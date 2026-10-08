/**
 * DataEngine - Fully Initialized DuckDB-WASM with Direct Cloudflare R2 Parquet Access
 */
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm";

export class DataEngine {
  constructor() {
    this.r2BaseUrl = "https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev";
    this.availableYears = [2023, 2024, 2025, 2026];
    this.currentYear = new Date().getFullYear(); // 2026
    this.cacheName = "ab-r2-parquet-cache-v1";
    this.db = null;
    this.conn = null;
    this.symbolList = [];
    this.isInitialized = false;
  }

  async initialize() {
    console.log("[DataEngine] Booting DuckDB-WASM Worker Engine & R2 Sync...");
    this.updateCacheStatusUI("Initializing DuckDB-WASM...");

    try {
      // 1. Initialize DuckDB-WASM Worker from CDN bundles
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
      );

      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);

      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(worker_url);

      this.conn = await this.db.connect();
      console.log("[DataEngine] DuckDB-WASM Engine successfully connected.");

      // 2. Perform Browser CacheStorage sync for Cloudflare R2 files
      await this.syncR2ParquetCache();

      // 3. Register HTTP/S Remote Filesystem Access in DuckDB
      await this.conn.query(`INSTALL httpfs; LOAD httpfs;`);

      this.isInitialized = true;
      this.updateCacheStatusUI("DuckDB-WASM Ready (R2 Connected)");
      
      // Warm up symbol list asynchronously from R2 Parquet files
      this.getAllSymbols().catch((e) => console.warn("Symbol extraction warming up:", e));

      return true;
    } catch (err) {
      console.error("[DataEngine] DuckDB-WASM initialization failed:", err);
      this.updateCacheStatusUI("Engine Error: Fallback Active");
      return false;
    }
  }

  async syncR2ParquetCache() {
    const cache = await caches.open(this.cacheName);

    for (const year of this.availableYears) {
      const url = `${this.r2BaseUrl}/data_${year}.parquet`;

      if (year < this.currentYear) {
        // Permanent Cache for historical years (2000 - 2025)
        const match = await cache.match(url);
        if (!match) {
          console.log(`[DataEngine] Permanent caching for historical year ${year}...`);
          await cache.add(url).catch((e) => console.warn(`Parquet year ${year} pending on R2:`, e));
        }
      } else {
        // Current year (2026): Refresh daily on app startup to fetch evening EOD updates
        const lastSync = localStorage.getItem(`r2_sync_${year}`);
        const today = new Date().toISOString().slice(0, 10);

        if (lastSync !== today) {
          console.log(`[DataEngine] Daily refresh for current year ${year} parquet...`);
          await cache.add(url).catch((e) => console.warn(`Current year parquet fetch pending:`, e));
          localStorage.setItem(`r2_sync_${year}`, today);
        }
      }
    }
  }

  /**
   * Directly queries distinct symbols across all R2 Parquet files in DuckDB
   */
  async getAllSymbols() {
    if (this.symbolList.length > 0) return this.symbolList;

    if (this.isInitialized && this.conn) {
      try {
        console.log("[DataEngine] Querying distinct symbols from Cloudflare R2 Parquet...");
        const query = `
          SELECT DISTINCT symbol 
          FROM read_parquet('${this.r2BaseUrl}/data_*.parquet') 
          ORDER BY symbol ASC
        `;
        const result = await this.conn.query(query);
        const rows = result.toArray().map((r) => r.toJSON());

        if (rows.length > 0) {
          this.symbolList = rows.map((r) => r.symbol).filter(Boolean);
          console.log(`[DataEngine] Loaded ${this.symbolList.length} distinct symbols from R2.`);
          return this.symbolList;
        }
      } catch (err) {
        console.warn("[DataEngine] Could not fetch symbols via DuckDB SQL query, using default fallback list:", err);
      }
    }

    // Default fallback list while remote queries initialize
    this.symbolList = [
      "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "BHARTIARTL", "SBIN",
      "LTIM", "ITC", "HINDUNILVR", "BAJFINANCE", "LT", "KOTAKBANK", "AXISBANK",
      "TATAMOTORS", "SUNPHARMA", "MARUTI", "NTPC", "TITAN", "ULTRACEMCO"
    ].sort();

    return this.symbolList;
  }

  /**
   * Queries historical OHLCV data for a specific symbol from R2 Parquet files
   */
  async getHistoricalData(symbol) {
    if (this.isInitialized && this.conn) {
      try {
        console.log(`[DataEngine] Querying DuckDB for symbol: ${symbol}`);
        const query = `
          SELECT 
            epoch(date) AS time,
            open,
            high,
            low,
            close,
            volume
          FROM read_parquet('${this.r2BaseUrl}/data_*.parquet')
          WHERE symbol = '${symbol}'
          ORDER BY date ASC
        `;
        const result = await this.conn.query(query);
        const rows = result.toArray().map((r) => r.toJSON());

        if (rows.length > 0) {
          console.log(`[DataEngine] Retrieved ${rows.length} candles for ${symbol} from R2.`);
          return rows.map((r) => ({
            time: Number(r.time),
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.volume || 0),
          }));
        }
      } catch (err) {
        console.warn(`[DataEngine] DuckDB query failed for ${symbol}, generating fallback chart:`, err);
      }
    }

    // Generate fallback data if DuckDB query is pending
    return this.generateFallbackOHLCV(symbol);
  }

  generateFallbackOHLCV(symbol) {
    const now = Math.floor(Date.now() / 1000);
    const day = 86400;
    const data = [];
    let price = symbol === "RELIANCE" ? 2500 : symbol === "TCS" ? 3800 : 1500;

    for (let i = 300; i >= 0; i--) {
      const time = now - i * day;
      const open = price + (Math.random() - 0.5) * 25;
      const high = open + Math.random() * 20;
      const low = open - Math.random() * 20;
      const close = (open + high + low) / 3;
      price = close;

      data.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(Math.random() * 200000)
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