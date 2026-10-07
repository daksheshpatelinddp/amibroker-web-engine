// js/data-engine.js
import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

class DataEngine {
  constructor() {
    this.db = null;
    this.conn = null;
    this.isInitialized = false;
    this.r2BaseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
    this.cacheName = 'amibroker-parquet-cache-v1';
    // Available yearly datasets (2023 to 2026, extensible down to 2000)
    this.availableYears = Array.from({ length: 2026 - 2023 + 1 }, (_, i) => 2023 + i);
  }

  async init() {
    if (this.isInitialized) return;

    try {
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      const worker = await duckdb.createWorker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger();
      
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      this.conn = await this.db.connect();

      // Register and load all yearly Parquet files with browser caching
      await this.loadYearlyParquetFiles();

      this.isInitialized = true;
      console.log('DuckDB-WASM Initialized and Parquet files loaded/cached successfully.');
    } catch (err) {
      console.error('Failed to initialize DuckDB-WASM DataEngine:', err);
      throw err;
    }
  }

  // Load Parquet files using Cache API to prevent duplicate R2 Class B requests
  async loadYearlyParquetFiles() {
    const cache = await caches.open(this.cacheName);

    for (const year of this.availableYears) {
      const fileName = `${year}.parquet`;
      const fileUrl = `${this.r2BaseUrl}/${fileName}`;

      let response = await cache.match(fileUrl);
      if (!response) {
        console.log(`[R2 Fetch] Cache miss for ${fileName}. Fetching from R2...`);
        response = await fetch(fileUrl);
        if (response.ok) {
          // Store historical files in browser CacheStorage
          await cache.put(fileUrl, response.clone());
        } else {
          console.warn(`Could not load ${fileName} from R2.`);
          continue;
        }
      } else {
        console.log(`[Cache Hit] Serving ${fileName} from browser CacheStorage.`);
      }

      const buffer = new Uint8Array(await response.arrayBuffer());
      // Register in-memory DuckDB file virtual filesystem
      await this.db.registerFileBuffer(fileName, buffer);
    }
  }

  async getSymbolData(symbol) {
    if (!this.isInitialized) await this.init();

    // Query across all registered yearly parquet files
    const query = `
      SELECT 
        Date as date,
        Open as open,
        High as high,
        Low as low,
        Close as close,
        Volume as volume
      FROM read_parquet(['*.parquet'])
      WHERE UPPER(Symbol) = UPPER('${symbol}')
      ORDER BY Date ASC;
    `;

    try {
      const result = await this.conn.query(query);
      const rows = result.toArray().map(row => ({
        time: typeof row.date === 'string' ? row.date.split('T')[0] : new Date(row.date).toISOString().split('T')[0],
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume)
      }));
      return rows;
    } catch (error) {
      console.error(`Error querying data for symbol ${symbol}:`, error);
      return [];
    }
  }
}

export const dataEngine = new DataEngine();