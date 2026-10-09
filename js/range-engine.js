// RangeEngine: reads ONE symbol from the yearly parquet files on R2 using HTTP range requests.
// All years are fetched in parallel, so the time is a few network round trips in total,
// no matter how many years exist. Needs the files sorted by (symbol, date) in small row groups.
import { parquetMetadataAsync, parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.4.0/+esm';

const COLUMN_NAMES = {
  symbol: ['symbol', 'ticker', 'scrip', 'name'],
  date:   ['date', 'time', 'timestamp', 'datetime'],
  open:   ['open'],
  high:   ['high'],
  low:    ['low'],
  close:  ['close'],
  volume: ['volume', 'vol'],
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
  }

  init() {
    if (!this.ready) this.ready = this._init();
    return this.ready;
  }

  async _init() {
    const t0 = performance.now();
    const thisYear = new Date().getFullYear();
    const list = [];
    for (let y = this.cfg.firstYear; y <= thisYear; y++) list.push(y);

    // HEAD every yearly file (never from cache): does it exist, how big, which version?
    // The version token goes into the URL so a re-uploaded file is never served from an old cached copy.
    const infos = await Promise.all(list.map(async (year) => {
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
    }));
    this.years = infos.filter(Boolean);
    if (this.years.length === 0) throw new Error('No yearly parquet files found on R2');
    this.initSeconds = (performance.now() - t0) / 1000;
    this.onProgress(`Range engine ready (${this.years.length} yearly files, ${this.initSeconds.toFixed(1)}s)`);
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
        throw new Error(`HTTP ${r.status} reading ${info.year}.parquet`);
      },
    };
  }

  // Footer + row-group index of one file (fetched once per session)
  _meta(info) {
    if (!this.metaCache.has(info.year)) {
      const p = (async () => {
        const file = this._buffer(info);
        const metadata = await parquetMetadataAsync(file, 1 << 18); // last 256 KB holds the footer
        const first = metadata.row_groups[0].columns.map(c => c.meta_data.path_in_schema[0]);
        const lower = new Map(first.map(n => [String(n).toLowerCase(), n]));
        const col = {};
        for (const [key, cands] of Object.entries(COLUMN_NAMES)) {
          const hit = cands.find(c => lower.has(c));
          if (hit) col[key] = lower.get(hit);
        }
        for (const need of ['symbol', 'date', 'open', 'high', 'low', 'close']) {
          if (!col[need]) throw new Error(`${info.year}.parquet: column "${need}" not found (has: ${first.join(', ')})`);
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
      p.catch(() => this.metaCache.delete(info.year)); // allow a retry later
      this.metaCache.set(info.year, p);
    }
    return this.metaCache.get(info.year);
  }

  // ---- per symbol-year cache in IndexedDB (re-opening a symbol needs no network) ----
  _openIdb() {
    if (this.idb) return this.idb;
    this.idb = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(`amibroker_bars_${this.cfg.id}`, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('bars', { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return this.idb;
  }

  async _cacheGet(key) {
    const db = await this._openIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      const r = db.transaction('bars', 'readonly').objectStore('bars').get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  }

  async _cachePut(rec) {
    const db = await this._openIdb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction('bars', 'readwrite');
      tx.objectStore('bars').put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  _pack(rows) {
    return {
      d: rows.map(r => r.date),
      o: Float64Array.from(rows, r => r.open),
      h: Float64Array.from(rows, r => r.high),
      l: Float64Array.from(rows, r => r.low),
      c: Float64Array.from(rows, r => r.close),
      v: Float64Array.from(rows, r => r.volume),
    };
  }

  _unpack(p, symbol) {
    return p.d.map((d, i) => ({ symbol, date: d, open: p.o[i], high: p.h[i], low: p.l[i], close: p.c[i], volume: p.v[i] }));
  }

  // ---- one symbol, one year ----
  async _year(info, base, names) {
    const key = `${base}|${info.year}`;
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
      const wanted = ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume']
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
      }));
    }
    this._cachePut({ key, token: info.token, data: this._pack(rows), ts: Date.now() }); // not awaited
    return { rows, cached: false };
  }

  // Full history of one symbol: all years in parallel
  async getBars(symbol) {
    await this.init();
    const t0 = performance.now();
    this.stats.requests = 0; this.stats.bytes = 0;
    const base = String(symbol).trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    const names = [base, `${base}.NS`, `${base}.BO`];

    const parts = await Promise.all(this.years.map(info => this._year(info, base, names)));
    const rows = parts.flatMap(p => p.rows).sort((a, b) => (a.date < b.date ? -1 : 1));
    this.lastStats = {
      years: this.years.length,
      cached: parts.filter(p => p.cached).length,
      requests: this.stats.requests,
      bytes: this.stats.bytes,
      seconds: (performance.now() - t0) / 1000,
    };
    return rows;
  }

  // Every symbol name (reads only the symbol column of the newest file)
  async getSymbols() {
    await this.init();
    const info = this.years[this.years.length - 1];
    const { file, metadata, col } = await this._meta(info);
    let out = [];
    await parquetRead({ file, metadata, columns: [col.symbol], onComplete: (r) => { out = r; } });
    return [...new Set(out.map(r => String(r[0])))].sort();
  }
}
