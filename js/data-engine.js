// js/data-engine.js
import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

class DataEngine {
  constructor() {
    this.db = null;
    this.conn = null;
    this.isInitialized = false;
    this.r2BaseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
    this.cacheName = 'amibroker-parquet-cache-v1';
    
    // Configured for historical data from 2023 to 2026 (Expandable down to 2000)
    this.availableYears = [2023, 2024, 2025, 2026];
  }

  updateStatus(message, isDownloading = false) {
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    
    if (statusText) statusText.textContent = message;
    if (statusDot) {
      statusDot.className = `w-2 h-2 rounded-full ${
        isDownloading ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'
      }`;
    }
  }

  async init() {
    if (this.isInitialized) return;

    try {
      this.updateStatus('Initializing DuckDB-WASM...', true);

      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      const worker = await duckdb.createWorker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger();

      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      this.conn = await this.db.connect();

      await this.loadYearlyParquetFiles();

      this.isInitialized = true;
      this.updateStatus('EOD Data Ready (Cached)', false);
    } catch (err) {
      console.error('Failed to initialize DataEngine:', err);
      this.updateStatus('Data Engine Error', false);
      throw err;
    }
  }

  async loadYearlyParquetFiles() {
    const cache = await caches.open(this.cacheName);

    for (const year of this.availableYears) {
      const fileName = `${year}.parquet`;
      const fileUrl = `${this.r2BaseUrl}/${fileName}`;

      let response = await cache.match(fileUrl);

      if (!response) {
        this.updateStatus(`Downloading ${fileName} from R2...`, true);
        try {
          response = await fetch(fileUrl);
          if (response.ok) {
            // Store response in browser CacheStorage to avoid future R2 requests
            await cache.put(fileUrl, response.clone());
          } else {
            console.warn(`Parquet file not found on R2: ${fileName}`);
            continue;
          }
        } catch (fetchErr) {
          console.error(`Failed to download ${fileName}:`, fetchErr);
          continue;
        }
      } else {
        this.updateStatus(`Loading ${fileName} from browser cache...`, false);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      
      // Register file inside DuckDB virtual file system
      await this.db.registerFileBuffer(fileName, buffer);
    }
  }

  async getSymbolData(symbol) {
    if (!this.isInitialized) await this.init();

    this.updateStatus(`Querying ${symbol}...`, false);

    // SQL query scanning across registered parquet files
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

      this.updateStatus(`EOD Ready (${rows.length} bars)`, false);
      return rows;
    } catch (error) {
      console.error(`Error querying data for symbol ${symbol}:`, error);
      this.updateStatus(`No data for ${symbol}`, false);
      return [];
    }
  }
}

export const dataEngine = new DataEngine();