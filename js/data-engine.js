/**
 * DataEngine - DuckDB-WASM Parquet Engine connected to Cloudflare R2
 * Automatically extracts 3000+ symbols directly from R2 Parquet files.
 */
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm";

export class DataEngine {
  constructor() {
    this.r2BaseUrl = "https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev";
    this.availableYears = [2023, 2024, 2025, 2026];
    this.currentYear = new Date().getFullYear(); // 2026
    this.cacheName = "ab-r2-parquet-cache-v1";
    this.symbolList = [];
    this.db = null;
    this.conn = null;
    this.isInitialized = false;
  }

  async initialize() {
    console.log("[DataEngine] Initializing DuckDB-WASM & R2 Storage Pipeline...");
    
    try {
      // 1. Initialize Browser Cache for R2 Parquet files
      const cache = await caches.open(this.cacheName);

      for (const year of this.availableYears) {
        const url = `${this.r2BaseUrl}/data_${year}.parquet`;

        if (year < this.currentYear) {
          // Permanent Cache for historical years (2000 - 2025)
          const match = await cache.match(url);
          if (!match) {
            console.log(`[DataEngine] Permanent caching for historical year ${year}...`);
            await cache.add(url).catch(() => console.warn(`Parquet year ${year} pending on R2.`));
          }
        } else {
          // Current year (2026): Daily refresh to capture post-market 6-7 PM IST bhavcopy updates
          const lastSync = localStorage.getItem(`r2_sync_${year}`);
          const today = new Date().toISOString().slice(0, 10);

          if (lastSync !== today) {
            console.log(`[DataEngine] Daily sync for current year ${year} EOD parquet...`);
            await cache.add(url).catch(() => console.warn(`Current year parquet fetch pending.`));
            localStorage.setItem(`r2_sync_${year}`, today);
          }
        }
      }

      // 2. Initialize DuckDB-WASM Worker Bundle
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      const worker = await duckdb.createWorker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger();

      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      this.conn = await this.db.connect();

      this.isInitialized = true;
      this.updateCacheStatusUI("R2 Parquet Ready (DuckDB Connected)");
      return true;
    } catch (err) {
      console.error("[DataEngine] DuckDB WASM / R2 initialization error:", err);
      this.updateCacheStatusUI("R2 Fallback Mode");
      return false;
    }
  }

  /**
   * Queries R2 Parquet files via DuckDB-WASM to extract ALL 3000+ distinct symbols automatically
   */
  async getAllSymbols() {
    if (this.symbolList.length > 0) return this.symbolList;

    if (!this.conn) {
      console.warn("[DataEngine] DuckDB connection not ready yet. Retrying...");
      return [];
    }

    try {
      console.log("[DataEngine] Fetching complete 3000+ symbol list from R2 Parquet...");
      
      // Query distinct symbol tickers from R2 current year parquet file
      const parquetUrl = `${this.r2BaseUrl}/data_${this.currentYear}.parquet`;
      const query = `SELECT DISTINCT symbol FROM read_parquet('${parquetUrl}') ORDER BY symbol ASC;`;
      
      const result = await this.conn.query(query);
      const rows = result.toArray().map((r) => r.toJSON());
      
      this.symbolList = rows.map((row) => row.symbol).filter(Boolean);
      console.log(`[DataEngine] Successfully loaded ${this.symbolList.length} symbols from R2 bhavcopy.`);
      
      return this.symbolList;
    } catch (err) {
      console.error("[DataEngine] Failed to query symbols from R2 Parquet:", err);
      return [];
    }
  }

  /**
   * Fetches full historical OHLCV data for a specific symbol across all R2 Parquet years
   */
  async getHistoricalData(symbol) {
    console.log(`[DataEngine] Querying historical records for ${symbol} from R2 Parquet...`);

    if (!this.conn) {
      return this.getFallbackMockData(symbol);
    }

    try {
      const parquetPattern = `${this.r2BaseUrl}/data_*.parquet`;
      const query = `
        SELECT time, open, high, low, close, volume 
        FROM read_parquet('${parquetPattern}') 
        WHERE symbol = '${symbol}' 
        ORDER BY time ASC;
      `;

      const result = await this.conn.query(query);
      const rows = result.toArray().map((r) => r.toJSON());

      if (rows.length === 0) {
        console.warn(`[DataEngine] No records found for ${symbol} in R2 Parquet. Using fallback...`);
        return this.getFallbackMockData(symbol);
      }

      return rows.map((r) => ({
        time: typeof r.time === "number" ? r.time : Math.floor(new Date(r.time).getTime() / 1000),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume || 0),
      }));
    } catch (err) {
      console.error(`[DataEngine] Error querying ${symbol} from R2 Parquet:`, err);
      return this.getFallbackMockData(symbol);
    }
  }

  getFallbackMockData(symbol) {
    const now = Math.floor(Date.now() / 1000);
    const day = 86400;
    const data = [];
    let price = 1500;

    for (let i = 250; i >= 0; i--) {
      const time = now - i * day;
      const open = price + (Math.random() - 0.5) * 20;
      const high = open + Math.random() * 15;
      const low = open - Math.random() * 15;
      const close = (open + high + low) / 3;
      price = close;

      data.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(Math.random() * 100000)
      });
    }

    return data;
  }

  updateCacheStatusUI(msg) {
    const el = document.getElementById("cache-status");
    if (el) el.textContent = `Cache: ${msg}`;
    const tsEl = document.getElementById("data-timestamp");
    if (tsEl) tsEl.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  }
}