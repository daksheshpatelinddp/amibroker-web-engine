// RangeEngine: reads ONE symbol from the parquet files on R2 using HTTP range requests.
//
// Three layouts are understood (the best one that exists on R2 is used):
//  * "pack" (fastest): manifest.json lists the byte position of every stock's compact block, recent.json the
//    last 400 bars. A chart = 2 parallel range requests, ~50 KB, no file headers. Bulk loading for backtests
//    (iterMany) and scans (iterRecent) read whole bucket packs / the single recent pack.
//  * "history" (fast, preferred): <db>/manifest.json lists history bucket files. Each bucket holds ~64
//    stocks and every stock's whole past history is ONE block, so a stock costs one small header + one
//    block (~0.3 MB) however many years exist. The current year still comes from its yearly file.
//  * "yearly" (fallback when there is no manifest): every yearly file is read in parallel, which gets
//    slower with every year added.
import { parquetMetadataAsync, parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.4.0/+esm';
import { decodeBlock, mergeBlocks, tailBlock, blockToRows } from './pack-codec.js';
import { planRanges } from './range-plan.js';
import { WorkerPool } from './worker-pool.js';

const COLUMN_NAMES = {
  symbol: ['symbol', 'ticker', 'scrip', 'name'],
  date:   ['date', 'time', 'timestamp', 'datetime'],
  open:   ['open'],
  high:   ['high'],
  low:    ['low'],
  close:  ['close'],
  volume: ['volume', 'vol'],
  delivery: ['delivery', 'deliv_qty', 'delivery_qty'],   // optional
};

function toDateString(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'bigint') v = Number(v);
  if (typeof v === 'number') return new Date(v < 1e11 ? v * 1000 : v).toISOString().slice(0, 10);
  return String(v ?? '').slice(0, 10);
}

// Runs fn over the list with a few items in flight at once, yielding results in order (decoding overlaps).
async function* pipelined(list, fn, window = 8) {
  const q = [];
  let i = 0;
  while (i < list.length || q.length) {
    while (i < list.length && q.length < window) q.push(fn(list[i++]));
    yield await q.shift();
  }
}

export class RangeEngine {
  constructor(dbConfig) {
    this.cfg = dbConfig;
    this.years = [];            // [{ year, url, size, token }]
    this.metaCache = new Map(); // year -> Promise<{ file, metadata, col, groups }>
    this.stats = { requests: 0, bytes: 0 };
    this.lastStats = null;
    this.onProgress = () => {};
    this.ready = null;
    this.idb = null;
    this.mode = 'yearly';       // 'pack' | 'history' (parquet) | 'yearly'
    this.packIdx = new Map();   // pack mode: stock -> { bucket, off, len, n }
    this.recentIdx = new Map(); // pack mode: stock -> { off, len, n }
    this.recentMeta = null;
    this.aliases = {};          // old ticker -> latest ticker
    this.manifest = null;
    this.symbolToBucket = new Map();
    this.histYears = 0;
  }

  init() {
    if (!this.ready) this.ready = this._init();
    return this.ready;
  }

  async _init() {
    const t0 = performance.now();
    const manifest = await this._loadManifest();
    const recent = manifest && manifest.packs ? await this._loadRecent() : null;
    if (manifest && recent) this._applyPacks(manifest, recent);
    else if (manifest) await this._initHistory(manifest);
    else await this._initYearly();
    this.initSeconds = (performance.now() - t0) / 1000;
    const what = this.mode === 'pack'
      ? `pack layout: ${this.packIdx.size} stocks, ${this.histYears} past years + last ${recent.bars} bars`
      : this.mode === 'history'
      ? `parquet history: ${this.histYears} past years in ${Object.keys(this.manifest.buckets).length} files + ${this.years.length} recent`
      : `${this.years.length} yearly files`;
    this.onProgress(`Range engine ready (${what}, ${this.initSeconds.toFixed(1)}s)`);
    return true;
  }

  async _loadManifest() {
    try {
      const r = await fetch(`${this.cfg.baseUrl}/manifest.json`, { cache: 'no-cache' });
      if (!r.ok) return null;
      const m = await r.json();
      if (!m || m.format !== 2 || !m.buckets || !m.histPath || !m.fingerprint) return null;
      return m;
    } catch (e) { return null; }       // no manifest / unreadable: use the yearly files
  }

  // HEAD one yearly file (never from cache): does it exist, how big, which version?
  // The version token goes into the URL so a re-uploaded file is never served from an old cached copy.
  async _headYear(year) {
    try {
      const r = await fetch(`${this.cfg.baseUrl}/${year}.parquet`, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok) return null;
      const size = Number(r.headers.get('content-length'));
      if (!(size > 0)) throw new Error('Content-Length not readable (check R2 CORS ExposeHeaders)');
      const raw = r.headers.get('etag') || r.headers.get('last-modified') || String(size);
      const token = String(raw).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
      return { year, size, token, url: `${this.cfg.baseUrl}/${year}.parquet?v=${token}` };
    } catch (e) {
      if (String(e.message).includes('Content-Length')) throw e;
      return null;
    }
  }

  async _initYearly() {
    this.mode = 'yearly';
    const thisYear = new Date().getFullYear();
    const list = [];
    for (let y = this.cfg.firstYear; y <= thisYear; y++) list.push(y);
    const infos = await Promise.all(list.map(y => this._headYear(y)));
    this.years = infos.filter(Boolean);
    if (this.years.length === 0) throw new Error('No yearly parquet files found on R2');
  }

  _applyManifest(m) {
    this.mode = 'history';
    this.manifest = m;
    this.symbolToBucket = new Map();
    for (const [bucket, b] of Object.entries(m.buckets)) for (const sym of b.symbols) this.symbolToBucket.set(sym, bucket);
    this.histYears = m.histThrough - m.firstYear + 1;
    for (const key of [...this.metaCache.keys()]) if (String(key).startsWith('h:')) this.metaCache.delete(key);
  }

  async _initHistory(m) {
    this._applyManifest(m);
    // the recent part: every yearly file after the history that exists on R2 (normally just this year)
    const thisYear = new Date().getFullYear();
    const list = [];
    for (let y = m.histThrough + 1; y <= Math.max(thisYear, m.currentYear); y++) list.push(y);
    const infos = await Promise.all(list.map(y => this._headYear(y)));
    this.years = infos.filter(Boolean);
  }

  // ---------------- pack mode ----------------
  async _loadRecent() {
    try {
      const r = await fetch(`${this.cfg.baseUrl}/recent.json`, { cache: 'no-cache' });
      if (!r.ok) return null;
      const j = await r.json();
      return (j && j.format === 1 && j.file && j.idx && j.token) ? j : null;
    } catch (e) { return null; }
  }

  _applyPacks(m, rec) {
    this.mode = 'pack';
    this.manifest = m;
    this.recentMeta = rec;
    this.aliases = m.aliases || {};
    this.histYears = m.histThrough - m.firstYear + 1;
    this.packIdx = new Map();
    for (const [bucket, b] of Object.entries(m.packs.buckets)) {
      for (const [sym, e] of Object.entries(b.idx)) this.packIdx.set(sym, { bucket, off: e[0], len: e[1], n: e[2] });
    }
    this.recentIdx = new Map(Object.entries(rec.idx).map(([sym, e]) => [sym, { off: e[0], len: e[1], n: e[2] }]));
    this.years = [];
  }

  // Rebuilt history/recent files replace the old ones; a long-open page reloads the small index files once.
  async _refreshPacks() {
    const m = await this._loadManifest();
    const rec = m && m.packs ? await this._loadRecent() : null;
    if (!m || !rec) return false;
    if (this.manifest && m.fingerprint === this.manifest.fingerprint && this.recentMeta && rec.token === this.recentMeta.token) return false;
    this._applyPacks(m, rec);
    return true;
  }

  // 'NSE:RELIANCE', 'reliance.ns' ... -> the name used in the data; old tickers resolve to the latest name
  _resolve(symbol) {
    const base = String(symbol).trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    const known = (n) => this.packIdx.has(n) || this.recentIdx.has(n);
    for (const n of [base, `${base}.NS`, `${base}.BO`]) if (known(n)) return n;
    const alias = this.aliases[base];
    return alias && known(alias) ? alias : null;
  }

  async _fetchRange(url, off, len) {
    const r = await fetch(url, { headers: { Range: `bytes=${off}-${off + len - 1}` } });
    this.stats.requests++;
    if (r.status === 206) { const b = new Uint8Array(await r.arrayBuffer()); this.stats.bytes += b.length; return b; }
    if (r.status === 200) { const all = new Uint8Array(await r.arrayBuffer()); this.stats.bytes += all.length; return all.slice(off, off + len); }
    throw new Error(`HTTP ${r.status} reading ${url.split('/').slice(-2).join('/')}`);
  }

  async _fetchWhole(url) {
    const r = await fetch(url);
    this.stats.requests++;
    if (!r.ok) throw new Error(`HTTP ${r.status} reading ${url.split('/').slice(-2).join('/')}`);
    const b = new Uint8Array(await r.arrayBuffer());
    this.stats.bytes += b.length;
    return b;
  }

  _packUrl(kind, sym) {
    return kind === 'h'
      ? `${this.cfg.baseUrl}/${this.manifest.packs.path}/${this.packIdx.get(sym).bucket}.pack`
      : `${this.cfg.baseUrl}/${this.recentMeta.file}`;
  }

  _packEntry(kind, sym) { return kind === 'h' ? this.packIdx.get(sym) : this.recentIdx.get(sym); }
  _packToken(kind) { return kind === 'h' ? this.manifest.fingerprint : this.recentMeta.token; }

  // Compressed bytes of one stock's block (browser cache first, else one range request)
  async _packBytes(kind, sym) {
    const e = this._packEntry(kind, sym);
    if (!e) return { bytes: null, cached: true };           // the stock has no block in this layer
    const key = `${sym}|pk-${kind}`;
    const hit = await this._cacheGet(key);
    if (hit && hit.token === this._packToken(kind) && hit.data) return { bytes: hit.data, cached: true };
    const bytes = await this._fetchRange(this._packUrl(kind, sym), e.off, e.len);
    this._cachePut({ key, token: this._packToken(kind), data: bytes, ts: Date.now() });
    return { bytes, cached: false };
  }

  async _getBarsPack(symbol) {
    const sym = this._resolve(symbol);
    if (!sym) return { rows: [], cached: [true, true] };
    const [h, r] = await Promise.all([this._packBytes('h', sym), this._packBytes('r', sym)]);
    const [hb, rb] = await Promise.all([h.bytes ? decodeBlock(h.bytes) : null, r.bytes ? decodeBlock(r.bytes) : null]);
    const merged = mergeBlocks(hb, rb);
    return { rows: merged ? blockToRows(merged, sym) : [], cached: [h.cached, r.cached] };
  }

  // ---------------- bulk loading (backtests, explorations) ----------------
  /** The decode workers (created on first use). Set engine.workers = false to decode inside the page instead. */
  _pool() {
    if (!this.pool) this.pool = new WorkerPool({ inline: this.workers === false });
    return this.pool;
  }

  /**
   * Gets the COMPRESSED blocks of many stocks into memory (browser storage first, then only the byte ranges still missing).
   * Returns { syms, hData, rData, saving } - Maps stock -> bytes; `saving` is the pending write to browser storage.
   */
  async loadPackBytes(symbols, { onProgress, concurrency = 8, prewarm = true } = {}) {
    await this.init();
    if (prewarm && this.workers !== false) this._pool().prewarm();          // the workers start while the data downloads
    if (this.mode !== 'pack') throw new Error('Bulk loading needs the pack layout: run "Convert DB to Parquet & Upload R2" first');
    this.stats.requests = 0; this.stats.bytes = 0;
    this._cachedCount = 0;
    const syms = [...new Set(symbols.map(s => this._resolve(s)).filter(Boolean))];
    const hData = new Map(), rData = new Map();
    const needH = [], needR = [];

    // 1. Ask the browser store for everything we may already have: ONE batched read
    const keyOf = (s, kind) => `${s}|pk-${kind}`;
    const keys = [];
    for (const s of syms) for (const kind of ['h', 'r']) if (this._packEntry(kind, s)) keys.push(keyOf(s, kind));
    const got = await this._cacheGetMany(keys);
    for (const s of syms) {
      for (const kind of ['h', 'r']) {
        if (!this._packEntry(kind, s)) continue;
        const hit = got.get(keyOf(s, kind));
        if (hit && hit.token === this._packToken(kind) && hit.data) { (kind === 'h' ? hData : rData).set(s, hit.data); this._cachedCount++; }
        else (kind === 'h' ? needH : needR).push(s);
      }
    }
    got.clear();

    // 2. Download only the byte ranges we still need: neighbouring blocks are joined (gap <= 64 KB), long runs are cut at 2 MB
    //    so several ranges download at the same time. New blocks are kept in the browser with a few batched writes.
    const fresh = [];
    const tasks = [];
    const planFor = (kind, list, url) => {
      const items = list.map((s) => { const e = this._packEntry(kind, s); return { s, off: e.off, len: e.len }; });
      for (const r of planRanges(items)) {
        tasks.push(async () => {
          const bytes = await this._fetchRange(url, r.start, r.end - r.start);
          for (const it of r.items) {
            const part = bytes.subarray(it.off - r.start, it.off - r.start + it.len);
            (kind === 'h' ? hData : rData).set(it.s, part);
            // slice() copies: storing a view would copy the whole downloaded range into every record
            fresh.push({ key: keyOf(it.s, kind), token: this._packToken(kind), data: part.slice(), ts: Date.now() });
          }
        });
      }
    };
    const byBucket = new Map();
    for (const s of needH) { const b = this.packIdx.get(s).bucket; if (!byBucket.has(b)) byBucket.set(b, []); byBucket.get(b).push(s); }
    for (const [, list] of byBucket) planFor('h', list, this._packUrl('h', list[0]));
    if (needR.length) planFor('r', needR, `${this.cfg.baseUrl}/${this.recentMeta.file}`);

    const worker = async () => { while (tasks.length) { const t = tasks.shift(); await t(); if (onProgress) onProgress({ phase: 'download', requests: this.stats.requests, bytes: this.stats.bytes }); } };
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
    const saving = this._cachePutMany(fresh);              // runs while we decode; waited for at the end

    return { syms, hData, rData, saving, cachedCount: this._cachedCount };
  }

  /**
   * Streams the full history of many stocks, one at a time, as typed arrays:
   *   for await (const s of engine.iterMany(['TCS', 'INFY', ...], { onProgress })) { s.symbol, s.n, s.t, s.o, s.h, s.l, s.c, s.v, s.dq }
   * Only the byte ranges still missing are downloaded (neighbouring blocks joined); everything fetched is kept in the browser,
   * so the second run needs no network. Decoding runs in a pool of Web Workers and the results arrive in order.
   */
  async *iterMany(symbols, { onProgress, concurrency = 8 } = {}) {
    const t0 = performance.now();
    const { syms, hData, rData, saving, cachedCount } = await this.loadPackBytes(symbols, { onProgress, concurrency });
    const tDown = (performance.now() - t0) / 1000;
    let n = 0;
    const take = (s) => { const r = { h: hData.get(s) || null, r: rData.get(s) || null }; hData.delete(s); rData.delete(s); return r; };   // free the compressed bytes as we go
    for await (const item of this._pool().decodeStream(syms, take)) {    // decoded in Web Workers (or in the page when they are not available), delivered in order
      n++;
      if (onProgress && n % 25 === 0) onProgress({ phase: 'decode', done: n, total: syms.length });
      yield item;
    }
    await saving;
    this.lastBulk = { stocks: n, requests: this.stats.requests, bytes: this.stats.bytes, fromBrowserCache: cachedCount, seconds: (performance.now() - t0) / 1000, downloadSeconds: tDown, decode: this.pool.inline ? 'in page' : `${this.pool.size} workers`, decodeNote: this.pool.fallbackReason || '' };
    if (onProgress) onProgress({ phase: 'done', ...this.lastBulk });
  }

  /** Convenience: all stocks at once into a Map (uses a lot of memory for big lists; prefer iterMany). */
  async getMany(symbols, opts) {
    const out = new Map();
    for await (const s of this.iterMany(symbols, opts)) out.set(s.symbol, s);
    return out;
  }

  /**
   * For scanners and explorations: the last `bars` bars of EVERY active stock, streamed one by one.
   * One download (the recent pack, ~10 MB), kept in the browser until the next daily rebuild.
   */
  async *iterRecent({ bars = 300, onProgress } = {}) {
    await this.init();
    if (this.mode !== 'pack') throw new Error('Scanning needs the pack layout: run "Convert DB to Parquet & Upload R2" first');
    const t0 = performance.now();
    if (this.workers !== false) this._pool().prewarm();
    this.stats.requests = 0; this.stats.bytes = 0;
    const key = 'rk|recent';
    let pack = null, fromCache = false;
    const hit = await this._cacheGet(key);
    if (hit && hit.token === this.recentMeta.token && hit.data) { pack = hit.data; fromCache = true; }
    else {
      pack = await this._fetchWhole(`${this.cfg.baseUrl}/${this.recentMeta.file}`);
      this._cachePut({ key, token: this.recentMeta.token, data: pack, ts: Date.now() });
    }
    if (onProgress) onProgress({ phase: 'downloaded', bytes: pack.length, fromBrowserCache: fromCache, seconds: (performance.now() - t0) / 1000 });
    const tDown = (performance.now() - t0) / 1000;
    let n = 0;
    const syms = [...this.recentIdx.keys()];
    const take = (sym) => { const e = this.recentIdx.get(sym); return { h: null, r: pack.subarray(e.off, e.off + e.len) }; };
    for await (const item of this._pool().decodeStream(syms, take, { bars })) {     // decoded in the worker pool, the last `bars` bars kept
      n++;
      if (onProgress && n % 250 === 0) onProgress({ phase: 'decode', done: n, total: this.recentIdx.size });
      yield item;
    }
    this.lastScan = { stocks: n, bytes: this.stats.bytes, fromBrowserCache: fromCache, seconds: (performance.now() - t0) / 1000, downloadSeconds: tDown, decode: this.pool.inline ? 'in page' : `${this.pool.size} workers`, decodeNote: this.pool.fallbackReason || '' };
  }

  // The history is rebuilt on days when a split/bonus changes old prices. If a long-open page still holds the
  // previous manifest, its files are gone: load the new manifest once and carry on.
  async _refreshManifest() {
    const m = await this._loadManifest();
    if (!m || (this.manifest && m.fingerprint === this.manifest.fingerprint)) return false;
    this._applyManifest(m);
    return true;
  }

  // ---- low level: a file-like object that fetches byte ranges ----
  _buffer(info) {
    const stats = this.stats;
    return {
      byteLength: info.size,
      async slice(start, end) {
        end = Math.min(end ?? info.size, info.size);
        const r = await fetch(info.url, { headers: { Range: `bytes=${start}-${end - 1}` } });
        stats.requests++;
        if (r.status === 206) { const b = await r.arrayBuffer(); stats.bytes += b.byteLength; return b; }
        if (r.status === 200) { const b = await r.arrayBuffer(); stats.bytes += b.byteLength; return b.slice(start, end); }
        throw new Error(`HTTP ${r.status} reading ${info.label || info.year + '.parquet'}`);
      },
    };
  }

  // Footer + row-group index of one file (fetched once per session)
  _meta(info) {
    const mkey = info.key || info.year;
    if (!this.metaCache.has(mkey)) {
      const p = (async () => {
        const file = this._buffer(info);
        const metadata = await parquetMetadataAsync(file, 1 << 17); // last 128 KB normally holds the footer (~80 KB)
        const first = metadata.row_groups[0].columns.map(c => c.meta_data.path_in_schema[0]);
        const lower = new Map(first.map(n => [String(n).toLowerCase(), n]));
        const col = {};
        for (const [key, cands] of Object.entries(COLUMN_NAMES)) {
          const hit = cands.find(c => lower.has(c));
          if (hit) col[key] = lower.get(hit);
        }
        for (const need of ['symbol', 'date', 'open', 'high', 'low', 'close']) {
          if (!col[need]) throw new Error(`${info.label || info.year + '.parquet'}: column "${need}" not found (has: ${first.join(', ')})`);
        }
        const symIdx = first.indexOf(col.symbol);
        let start = 0;
        const groups = metadata.row_groups.map((g) => {
          const n = Number(g.num_rows);
          const st = g.columns[symIdx].meta_data.statistics;
          const grp = { start, end: start + n, min: st && st.min_value, max: st && st.max_value };
          start += n;
          return grp;
        });
        return { file, metadata, col, groups };
      })();
      p.catch(() => this.metaCache.delete(mkey)); // allow a retry later
      this.metaCache.set(mkey, p);
    }
    return this.metaCache.get(mkey);
  }

  // ---- per symbol-year cache in IndexedDB (re-opening a symbol needs no network) ----
  // Any problem here (closed connection, cleared browser data, no storage) is treated as
  // "not cached" and never stops a chart from loading.
  _openIdb() {
    if (this.idb) return this.idb;
    this.idb = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(`amibroker_bars_${this.cfg.id}`, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('bars', { keyPath: 'key' });
        req.onsuccess = () => {
          const db = req.result;
          db.onclose = () => { this.idb = null; };                    // browser closed it: reopen next time
          db.onversionchange = () => { db.close(); this.idb = null; };
          resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return this.idb;
  }

  async _cacheGet(key) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const db = await this._openIdb();
        if (!db) return null;
        return await new Promise((resolve) => {
          const tx = db.transaction('bars', 'readonly');
          const r = tx.objectStore('bars').get(key);
          r.onsuccess = () => resolve(r.result || null);
          r.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        });
      } catch (e) {
        this.idb = null; // connection was closing: open a fresh one and try once more
      }
    }
    return null;
  }

  // Many keys in ONE transaction (1000 separate reads took seconds on a phone). Missing keys are simply absent from the result.
  async _cacheGetMany(keys) {
    const out = new Map();
    if (!keys.length) return out;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const db = await this._openIdb();
        if (!db) return out;
        return await new Promise((resolve) => {
          const tx = db.transaction('bars', 'readonly');
          const st = tx.objectStore('bars');
          for (const k of keys) { const r = st.get(k); r.onsuccess = () => { if (r.result) out.set(k, r.result); }; }
          tx.oncomplete = () => resolve(out);
          tx.onerror = () => resolve(out);
          tx.onabort = () => resolve(out);
        });
      } catch (e) { this.idb = null; }
    }
    return out;
  }

  // Many records in a few transactions (a full storage or a closed connection just means "not cached")
  async _cachePutMany(recs, chunk = 300) {
    for (let i = 0; i < recs.length; i += chunk) {
      const part = recs.slice(i, i + chunk);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const db = await this._openIdb();
          if (!db) return;
          await new Promise((resolve) => {
            const tx = db.transaction('bars', 'readwrite');
            const st = tx.objectStore('bars');
            for (const r of part) st.put(r);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
          });
          break;
        } catch (e) { this.idb = null; }
      }
    }
  }

  async _cachePut(rec) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const db = await this._openIdb();
        if (!db) return;
        return await new Promise((resolve) => {
          const tx = db.transaction('bars', 'readwrite');
          tx.objectStore('bars').put(rec);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        });
      } catch (e) {
        this.idb = null;
      }
    }
  }

  _pack(rows) {
    return {
      d: rows.map(r => r.date),
      o: Float64Array.from(rows, r => r.open),
      h: Float64Array.from(rows, r => r.high),
      l: Float64Array.from(rows, r => r.low),
      c: Float64Array.from(rows, r => r.close),
      v: Float64Array.from(rows, r => r.volume),
      q: Float64Array.from(rows, r => (r.delivery === undefined ? NaN : r.delivery)),
    };
  }

  _unpack(p, symbol) {
    return p.d.map((d, i) => ({ symbol, date: d, open: p.o[i], high: p.h[i], low: p.l[i], close: p.c[i], volume: p.v[i], delivery: p.q ? p.q[i] : NaN }));
  }

  // ---- one symbol, one year ----
  _year(info, base, names) {
    return this._part(info, base, names, `${base}|${info.year}`);
  }

  // ---- one symbol, all past years (history bucket) ----
  async _hist(base, names) {
    const sym = names.find(n => this.symbolToBucket.has(n));
    if (!sym) return { rows: [], cached: true };            // not in the past history (e.g. listed this year)
    const bucket = this.symbolToBucket.get(sym);
    const b = this.manifest.buckets[bucket];
    const info = {
      key: `h:${bucket}`, label: `${bucket}.parquet`, size: b.size, token: this.manifest.fingerprint,
      url: `${this.cfg.baseUrl}/${this.manifest.histPath}/${bucket}.parquet`,
    };
    return this._part(info, base, [sym], `${base}|h`);
  }

  // Reads one symbol's rows from one parquet file (the file must be sorted by symbol, date).
  // Saved in the browser per file version, so opening the same symbol again needs no network.
  async _part(info, base, names, key) {
    const hit = await this._cacheGet(key);
    if (hit && hit.token === info.token) return { rows: this._unpack(hit.data, base), cached: true };

    const { file, metadata, col, groups } = await this._meta(info);

    // row groups whose symbol range can contain one of the names (rows are sorted, so they are contiguous)
    let from = -1, to = -1;
    groups.forEach((g, i) => {
      const may = (g.min == null || g.max == null) || names.some(n => g.min <= n && n <= g.max);
      if (may) { if (from < 0) from = i; to = i; }
    });

    let rows = [];
    if (from >= 0) {
      const wanted = ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'delivery']
        .map(k => col[k]).filter(Boolean);
      let out = [];
      await parquetRead({
        file, metadata, columns: wanted,
        rowStart: groups[from].start, rowEnd: groups[to].end,
        rowFormat: 'object', onComplete: (r) => { out = r; },
      });
      const set = new Set(names);
      rows = out.filter(r => set.has(String(r[col.symbol]))).map(r => ({
        symbol: base,
        date: toDateString(r[col.date]),
        open: Number(r[col.open] ?? 0), high: Number(r[col.high] ?? 0),
        low: Number(r[col.low] ?? 0), close: Number(r[col.close] ?? 0),
        volume: Number(col.volume ? (r[col.volume] ?? 0) : 0),
        delivery: (col.delivery && r[col.delivery] != null) ? Number(r[col.delivery]) : NaN, // NaN = not available
      }));
    }
    this._cachePut({ key, token: info.token, data: this._pack(rows), ts: Date.now() }); // not awaited
    return { rows, cached: false };
  }

  // Full history of one symbol
  async getBars(symbol) {
    await this.init();
    const t0 = performance.now();
    this.stats.requests = 0; this.stats.bytes = 0;
    const base = String(symbol).trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    const names = [base, `${base}.NS`, `${base}.BO`];

    if (this.mode === 'pack') {
      let res;
      try {
        res = await this._getBarsPack(symbol);
      } catch (e) {
        if (await this._refreshPacks()) res = await this._getBarsPack(symbol);     // history was rebuilt meanwhile
        else throw e;
      }
      this.lastStats = {
        years: this.histYears + 1,
        cached: (res.cached[0] ? this.histYears : 0) + (res.cached[1] ? 1 : 0),
        requests: this.stats.requests, bytes: this.stats.bytes, seconds: (performance.now() - t0) / 1000,
      };
      return res.rows;
    }

    const recent = Promise.all(this.years.map(info => this._year(info, base, names)));
    let hist = null;
    if (this.mode === 'history') {
      try {
        hist = await this._hist(base, names);
      } catch (e) {
        if (await this._refreshManifest()) hist = await this._hist(base, names);   // history was rebuilt meanwhile
        else throw e;
      }
    }
    const recentParts = await recent;

    const parts = (hist ? [hist] : []).concat(recentParts);
    const rows = parts.flatMap(p => p.rows).sort((a, b) => (a.date < b.date ? -1 : 1));
    this.lastStats = {
      years: (hist ? this.histYears : 0) + recentParts.length,
      cached: (hist && hist.cached ? this.histYears : 0) + recentParts.filter(p => p.cached).length,
      requests: this.stats.requests,
      bytes: this.stats.bytes,
      seconds: (performance.now() - t0) / 1000,
    };
    return rows;
  }

  // Every symbol name
  async getSymbols() {
    await this.init();
    if (this.mode === 'pack') return [...new Set([...this.packIdx.keys(), ...this.recentIdx.keys()])].sort();   // no network
    const names = new Set(this.mode === 'history' ? this.symbolToBucket.keys() : []);

    // Stocks of the newest year (this also covers stocks listed after the history was built).
    // Preferred: the small symbols.json written by the daily conversion (one request).
    let recent = null;
    try {
      const r = await fetch(`${this.cfg.baseUrl}/symbols.json`, { cache: 'no-cache' });
      if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.symbols)) recent = j.symbols; }
    } catch (e) { /* use the fallback below */ }

    if (recent) {
      recent.forEach(n => names.add(String(n)));
    } else {
      // Fallback (older setups): read the symbol column of the newest yearly file
      const info = this.years[this.years.length - 1];
      if (info) {
        try {
          const { file, metadata, col } = await this._meta(info);
          let out = [];
          await parquetRead({ file, metadata, columns: [col.symbol], onComplete: (r) => { out = r; } });
          out.forEach(r => names.add(String(r[0])));
        } catch (e) {
          if (this.mode !== 'history') throw e;               // the manifest already gave us the list
        }
      }
    }
    return [...names].sort();
  }
}
