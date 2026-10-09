// DuckDB-WASM data engine: reads the yearly parquet files on R2 directly (HTTP range
// requests), so the browser downloads only the columns/rows a query needs.
import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm';

const COLUMN_NAMES = {
  symbol: ['symbol', 'ticker', 'scrip', 'name'],
  date:   ['date', 'time', 'timestamp', 'datetime'],
  open:   ['open'],
  high:   ['high'],
  low:    ['low'],
  close:  ['close'],
  volume: ['volume', 'vol'],
};

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const qid = (s) => `"${String(s).replace(/"/g, '""')}"`;

export class DuckEngine {
  constructor(dbConfig) {
    this.cfg = dbConfig;
    this.db = null;
    this.conn = null;
    this.files = [];      // registered parquet names, oldest -> newest
    this.col = null;      // detected column names
    this.ready = null;
    this.onProgress = () => {};
  }

  init() {
    if (!this.ready) this.ready = this._init();
    return this.ready;
  }

  async _init() {
    const t0 = performance.now();
    this.onProgress('Loading DuckDB engine...');
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
    );
    const worker = new Worker(workerUrl);
    this.db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    this.conn = await this.db.connect();

    await this._registerYears();
    await this._detectColumns();
    this.initSeconds = (performance.now() - t0) / 1000;
    const secs = this.initSeconds.toFixed(1);
    this.onProgress(`DuckDB ready in ${secs}s (${this.files.length} yearly files)`);
    return true;
  }

  async _registerYears() {
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = this.cfg.firstYear; y <= thisYear; y++) years.push(y);

    // HEAD each yearly file (never from cache) to learn if it exists and which version it is.
    // The version goes into the URL, so a re-uploaded file is never read from an old cached copy.
    const infos = await Promise.all(years.map(async (y) => {
      try {
        const r = await fetch(`${this.cfg.baseUrl}/${y}.parquet`, { method: 'HEAD', cache: 'no-store' });
        if (!r.ok) return { y, ok: false };
        const raw = r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length') || '';
        const token = String(raw).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
        return { y, ok: true, token };
      } catch (e) { return { y, ok: null, token: '' }; } // could not check
    }));

    let usable = infos.filter(i => i.ok === true);
    if (usable.length === 0 && infos.every(i => i.ok === null)) usable = infos; // HEAD blocked: try all

    for (const i of usable) {
      const name = `${this.cfg.id}_${i.y}.parquet`;
      const v = i.token || String(Date.now());
      await this.db.registerFileURL(
        name, `${this.cfg.baseUrl}/${i.y}.parquet?v=${v}`, duckdb.DuckDBDataProtocol.HTTP, false
      );
      this.files.push(name);
    }
    if (this.files.length === 0) throw new Error('No yearly parquet files found on R2');
  }

  async _detectColumns() {
    const res = await this.conn.query(`DESCRIBE SELECT * FROM read_parquet(${sqlStr(this.files[this.files.length - 1])})`);
    const names = res.toArray().map(r => String(r.column_name));
    const lower = new Map(names.map(n => [n.toLowerCase(), n]));
    const col = {};
    for (const [key, candidates] of Object.entries(COLUMN_NAMES)) {
      const hit = candidates.find(c => lower.has(c));
      if (hit) col[key] = lower.get(hit);
    }
    for (const need of ['symbol', 'date', 'open', 'high', 'low', 'close']) {
      if (!col[need]) throw new Error(`Column "${need}" not found. File has: ${names.join(', ')}`);
    }
    this.col = col;
  }

  _fileList(files = this.files) {
    return '[' + files.map(sqlStr).join(', ') + ']';
  }

  // All symbol names (from the newest yearly file)
  async getSymbols() {
    await this.init();
    const latest = this.files[this.files.length - 1];
    const res = await this.conn.query(
      `SELECT DISTINCT ${qid(this.col.symbol)} AS s FROM read_parquet(${sqlStr(latest)}) ORDER BY s`
    );
    return res.toArray().map(r => String(r.s));
  }

  // NOTE: the >= / <= range is deliberate. DuckDB skips whole row groups only for a single
  // equality or a range filter; a plain IN (...) list makes it read the entire file.
  // The IN list afterwards keeps only the exact names (X, X.NS, X.BO).
  _barsSql(files, symbol) {
    const c = this.col;
    const base = String(symbol).trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    const names = [base, `${base}.NS`, `${base}.BO`].map(sqlStr).join(', ');
    const vol = c.volume ? `CAST(${qid(c.volume)} AS DOUBLE)` : '0';
    return `
      SELECT strftime(CAST(${qid(c.date)} AS DATE), '%Y-%m-%d') AS d,
             CAST(${qid(c.open)}  AS DOUBLE) AS o,
             CAST(${qid(c.high)}  AS DOUBLE) AS h,
             CAST(${qid(c.low)}   AS DOUBLE) AS l,
             CAST(${qid(c.close)} AS DOUBLE) AS cl,
             ${vol} AS v
      FROM read_parquet(${this._fileList(files)})
      WHERE ${qid(c.symbol)} >= ${sqlStr(base)} AND ${qid(c.symbol)} <= ${sqlStr(base + '.NS')}
        AND ${qid(c.symbol)} IN (${names})
      ORDER BY d`;
  }

  async _run(files, symbol) {
    const base = String(symbol).trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    const res = await this.conn.query(this._barsSql(files, symbol));
    return res.toArray().map(r => ({
      symbol: base, date: String(r.d),
      open: Number(r.o), high: Number(r.h), low: Number(r.l), close: Number(r.cl), volume: Number(r.v),
    }));
  }

  // Full daily history of one symbol across all yearly files.
  // If the one-shot query fails, query file by file so we learn which year breaks and still draw the rest.
  async getBars(symbol) {
    await this.init();
    const t0 = performance.now();
    this.lastNote = '';
    let rows;
    try {
      rows = await this._run(this.files, symbol);
    } catch (e) {
      const combinedErr = (e && e.message) ? e.message : String(e);
      console.error('Combined query failed:', e);
      const parts = [], failed = [];
      for (const f of this.files) {
        const label = f.replace(/^[^_]*_/, '').replace('.parquet', '');
        try { parts.push(await this._run([f], symbol)); }
        catch (err) { failed.push(`${label}: ${(err && err.message) || err}`); }
      }
      if (parts.length === 0) throw new Error(`all years failed. First: ${failed[0]}`);
      rows = parts.flat().sort((a, b) => (a.date < b.date ? -1 : 1));
      this.lastNote = failed.length
        ? `PARTIAL DATA - failed: ${failed.join(' || ')}`
        : `combined query failed (${combinedErr}) - merged per file instead`;
    }
    this.lastQuerySeconds = (performance.now() - t0) / 1000;
    return rows;
  }
}
