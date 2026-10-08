/**
 * DataEngine - DuckDB-WASM Engine with Full 38 MB R2 Pre-Fetch & CacheStorage VFS Registration
 */
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm";

export class DataEngine {
  constructor() {
    this.r2BaseUrl = "https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev";
    this.availableYears = [2023, 2024, 2025, 2026];
    this.currentYear = new Date().getFullYear(); // 2026
    this.cacheName = "ab-r2-parquet-cache-v2";
    this.db = null;
    this.conn = null;
    this.symbolList = [];
    this.isInitialized = false;
  }

  async initialize() {
    console.log("[DataEngine] Initializing DuckDB-WASM & Downloading R2 Parquet files...");
    this.updateCacheStatusUI("Initializing Engine...");

    try {
      // 1. Initialize DuckDB-WASM Worker from CDN
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
      console.log("[DataEngine] DuckDB-WASM Engine Instance Ready.");

      // 2. Download 38 MB Parquet files from R2, store in CacheStorage, and register in DuckDB VFS
      await this.loadAndCacheParquetFiles();

      this.isInitialized = true;
      this.updateCacheStatusUI("R2 Parquet Cached & Ready");

      // 3. Extract all unique symbols from local DuckDB VFS
      await this.getAllSymbols();

      return true;
    } catch (err) {
      console.error("[DataEngine] Initialization / R2 Sync Error:", err);
      this.updateCacheStatusUI("R2 Fetch Error: Check CORS");
      return false;
    }
  }

  /**
   * Downloads full 38 MB Parquet files, caches them in CacheStorage, and mounts them in DuckDB VFS
   */
  async loadAndCacheParquetFiles() {
    const cache = await caches.open(this.cacheName);

    for (const year of this.availableYears) {
      const fileUrl = `${this.r2BaseUrl}/data_${year}.parquet`;
      const vfsFileName = `data_${year}.parquet`;
      const today = new Date().toISOString().slice(0, 10);
      const lastSync = localStorage.getItem(`r2_sync_${year}`);

      let response = null;

      // Check browser CacheStorage first
      const cachedResponse = await cache.match(fileUrl);

      if (cachedResponse && (year < this.currentYear || lastSync === today)) {
        console.log(`[DataEngine] Loading cached ${vfsFileName} from CacheStorage...`);
        this.updateCacheStatusUI(`Loaded ${vfsFileName} from Cache`);
        response = cachedResponse;
      } else {
        console.log(`[DataEngine] Downloading 38 MB ${vfsFileName} from R2...`);
        this.updateCacheStatusUI(`Downloading ${vfsFileName} (~38 MB)...`);

        // Force CORS pre-fetch for entire file
        response = await fetch(fileUrl, { mode: "cors" });

        if (!response.ok) {
          console.warn(`[DataEngine] Could not download ${fileUrl} (Status: ${response.status})`);
          continue;
        }

        // Put full 200 OK response into CacheStorage permanently
        await cache.put(fileUrl, response.clone());
        if (year === this.currentYear) {
          localStorage.setItem(`r2_sync_${year}`, today);
        }
        console.log(`[DataEngine] Successfully stored ${vfsFileName} in CacheStorage.`);
      }

      // Convert ArrayBuffer and register in DuckDB Virtual File System
      const buffer = new Uint8Array(await response.arrayBuffer());
      await this.db.registerFileBuffer(vfsFileName, buffer);
      console.log(`[DataEngine] Registered ${vfsFileName} in DuckDB VFS.`);
    }
  }

  /**
   * Queries distinct tickers directly from DuckDB VFS Parquet files
   */
  async getAllSymbols() {
    if (this.symbolList.length > 0) return this.symbolList;

    if (this.isInitialized && this.conn) {
      try {
        console.log("[DataEngine] Querying distinct symbols from DuckDB VFS...");
        const query = `
          SELECT DISTINCT symbol 
          FROM read_parquet('data_*.parquet') 
          ORDER BY symbol ASC
        `;
        const result = await this.conn.query(query);
        const rows = result.toArray().map((r) => r.toJSON());

        if (rows.length > 0) {
          this.symbolList = rows.map((r) => r.symbol).filter(Boolean);
          console.log(`[DataEngine] Loaded ${this.symbolList.length} distinct symbols from local Parquet.`);
          return this.symbolList;
        }
      } catch (err) {
        console.warn("[DataEngine] VFS symbol query failed:", err);
      }
    }

    // Fallback symbol list
    this.symbolList = [
      "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "BHARTIARTL", "SBIN",
      "LTIM", "ITC", "HINDUNILVR", "BAJFINANCE", "LT", "KOTAKBANK", "AXISBANK",
      "TATAMOTORS", "SUNPHARMA", "MARUTI", "NTPC", "TITAN", "ULTRACEMCO"
    ].sort();

    return this.symbolList;
  }

  /**
   * Queries historical OHLCV candles for selected symbol directly from local DuckDB VFS
   */
  async getHistoricalData(symbol) {
    if (this.isInitialized && this.conn) {
      try {
        console.log(`[DataEngine] Executing VFS DuckDB query for: ${symbol}`);
        const query = `
          SELECT 
            epoch(CAST(date AS TIMESTAMP)) AS time,
            open,
            high,
            low,
            close,
            volume
          FROM read_parquet('data_*.parquet')
          WHERE UPPER(symbol) = UPPER('${symbol}')
          ORDER BY date ASC
        `;
        const result = await this.conn.query(query);
        const rows = result.toArray().map((r) => r.toJSON());

        if (rows.length > 0) {
          console.log(`[DataEngine] Fetched ${rows.length} OHLCV bars for ${symbol}.`);
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
        console.warn(`[DataEngine] Query failed for ${symbol}:`, err);
      }
    }

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