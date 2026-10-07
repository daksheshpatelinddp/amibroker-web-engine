// js/data-engine.js

export class DataEngine {
  constructor() {
    this.db = null;
    this.conn = null;
    this.isInitialized = false;
    this.currentDataMap = new Map();
  }

  async init() {
    if (this.isInitialized) return true;

    try {
      // 1. Initialize DuckDB-WASM cleanly with CDN fallback
      const JSDELIVR_BUNDLES = window.duckdb ? window.duckdb.getJsDelivrBundles() : null;
      
      if (JSDELIVR_BUNDLES) {
        const bundle = await window.duckdb.selectBundle(JSDELIVR_BUNDLES);
        const worker_url = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
        );
        const worker = new Worker(worker_url);
        const logger = new window.duckdb.ConsoleLogger();
        this.db = new window.duckdb.AsyncDuckDB(logger, worker);
        await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        this.conn = await this.db.connect();

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
      } else {
        console.warn('DuckDB global object not detected on window. Operating in local memory fallback mode.');
      }

      // 2. Once-Daily Sync Check (Skips download on repeated starts today)
      await this.checkAndSyncEODData();

      this.isInitialized = true;
      return true;
    } catch (err) {
      console.error('DataEngine initialization warning (falling back gracefully):', err);
      // Mark initialized to unblock UI even if WASM fails on restricted mobile browsers
      this.isInitialized = true;
      return false;
    }
  }

  async checkAndSyncEODData() {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastSyncDate = localStorage.getItem('ab_last_eod_sync_date');

    if (lastSyncDate === todayStr) {
      console.log(`[DataEngine] Data already updated today (${todayStr}). Bypassing R2 downloads.`);
      return;
    }

    console.log(`[DataEngine] First startup today (${todayStr}). Checking for updates...`);
    try {
      // Execute daily sync here if configured
      localStorage.setItem('ab_last_eod_sync_date', todayStr);
    } catch (e) {
      console.warn('Unable to write to localStorage:', e);
    }
  }

  async fetchBars(symbol) {
    if (!this.isInitialized) await this.init();

    // Query DuckDB if connected
    if (this.conn) {
      try {
        const stmt = await this.conn.prepare(
          `SELECT date, open, high, low, close, volume FROM stock_bars WHERE symbol = ? ORDER BY date ASC`
        );
        const result = await stmt.query(symbol);
        const rows = result.toArray().map(r => ({
          time: typeof r.date === 'string' ? r.date : r.date.toISOString().split('T')[0],
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close: Number(r.close),
          volume: Number(r.volume || 0),
        }));

        if (rows.length > 0) {
          this.currentDataMap.set(symbol, rows);
          return rows;
        }
      } catch (err) {
        console.warn(`DuckDB query fallback for ${symbol}:`, err);
      }
    }

    // Fallback Mock Synthetic Data Generation (prevents black screen if DB is empty)
    const mockData = this.generateMockBars(symbol);
    this.currentDataMap.set(symbol, mockData);
    return mockData;
  }

  getCurrentData(symbol) {
    return this.currentDataMap.get(symbol) || [];
  }

  generateMockBars(symbol) {
    const bars = [];
    let price = 2500;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 365);

    for (let i = 0; i < 365; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) continue;

      const change = (Math.random() - 0.48) * 35;
      const open = price;
      const high = open + Math.abs(change) + Math.random() * 15;
      const low = open - Math.abs(change) - Math.random() * 15;
      const close = open + change;
      const volume = Math.floor(Math.random() * 500000) + 100000;

      price = close;
      bars.push({
        time: currentDate.toISOString().split('T')[0],
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: volume,
      });
    }
    return bars;
  }
}