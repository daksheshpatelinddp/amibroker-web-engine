// js/data-engine.js

export class DataEngine {
  constructor() {
    this.db = null;
    this.conn = null;
    this.isInitialized = false;
    this.currentDataMap = new Map();
  }

  async init() {
    if (this.isInitialized) return;

    try {
      // 1. Initialize DuckDB-WASM with jsDelivr bundle
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      );

      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      
      this.conn = await this.db.connect();

      // Create internal virtual table for price bars
      await this.conn.query(`
        CREATE TABLE IF NOT EXISTS stock_bars (
          symbol VARCHAR,
          date DATE,
          open DOUBLE,
          high DOUBLE,
          low DOUBLE,
          close DOUBLE,
          volume DOUBLE
        );
      `);

      // 2. Check Once-Daily Sync Status
      await this.checkAndSyncEODData();

      this.isInitialized = true;
      console.log('DuckDB-WASM Engine successfully initialized.');
    } catch (err) {
      console.error('Failed to initialize DuckDB-WASM:', err);
      throw err;
    }
  }

  // Once-per-day sync check logic
  async checkAndSyncEODData() {
    const todayStr = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const lastSyncDate = localStorage.getItem('ab_last_eod_sync_date');

    if (lastSyncDate === todayStr) {
      console.log(`[DataEngine] Data already synced for today (${todayStr}). Skipping R2 network downloads.`);
      return;
    }

    console.log(`[DataEngine] New day detected (${todayStr}). Fetching daily EOD updates from R2...`);

    try {
      // Execute your daily R2 Parquet sync routine here
      // await this.fetchAndStoreLatestParquet();

      // Mark today's sync as completed upon success
      localStorage.setItem('ab_last_eod_sync_date', todayStr);
      console.log(`[DataEngine] EOD sync completed and cached for ${todayStr}.`);
    } catch (error) {
      console.warn('[DataEngine] EOD fetch failed, proceeding with local cached data:', error);
    }
  }

  async fetchBars(symbol) {
    if (!this.isInitialized) await this.init();

    try {
      const stmt = await this.conn.prepare(
        `SELECT date, open, high, low, close, volume FROM stock_bars WHERE symbol = ? ORDER BY date ASC`
      );
      const result = await stmt.query(symbol);
      const rows = result.toArray().map(r => ({
        time: r.date.toISOString().split('T')[0],
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));

      this.currentDataMap.set(symbol, rows);
      return rows;
    } catch (err) {
      console.error(`Error querying bars for ${symbol}:`, err);
      return [];
    }
  }

  getCurrentData(symbol) {
    return this.currentDataMap.get(symbol) || [];
  }
}