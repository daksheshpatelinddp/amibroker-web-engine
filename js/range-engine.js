// RangeEngine: reads ONE symbol from the parquet files on R2 using HTTP range requests.
//
// Two layouts are understood:
//  * "history" (fast, preferred): <db>/manifest.json lists history bucket files. Each bucket holds ~64
//    stocks and every stock's whole past history is ONE block, so a stock costs one small header + one
//    block (~0.3 MB) however many years exist. The current year still comes from its yearly file.
//  * "yearly" (fallback when there is no manifest): every yearly file is read in parallel, which gets
//    slower with every year added.
import { parquetMetadataAsync, parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.4.0/+esm';

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
    this.mode = 'yearly';       // 'history' once a valid manifest is found
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
    if (manifest) await this._initHistory(manifest);
    else await this._initYearly();
    this.initSeconds = (performance.now() - t0) / 1000;
    const what = this.mode === 'history'
      ? `history layout: ${this.histYears} past years in ${Object.keys(this.manifest.buckets).length} files + ${this.years.length} recent`
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
