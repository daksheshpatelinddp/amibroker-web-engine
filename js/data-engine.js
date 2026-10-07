// js/data-engine.js
import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

class DataEngine {
  constructor() {
    this.db = null;
    this.conn = null;
    this.isInitialized = false;
    this.r2BaseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
    this.cacheName = 'amibroker-parquet-cache-v1';
    
    // Static past years to permanently cache locally
    this.historicalYears = [2023, 2024, 2025];
    // Dynamic current year that receives daily EOD updates
    this.currentYear = new Date().getFullYear(); // 2026
  }

  updateStatus(message, state = 'loading') {
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    
    if (statusText) statusText.textContent = message;
    if (statusDot) {
      if (state === 'downloading') {
        statusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping';
        if (statusText) statusText.className = 'text-amber-300 font-semibold text-[11px]';
      } else if (state === 'cached') {
        statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
        if (statusText) statusText.className = 'text-emerald-400 font-semibold text-[11px]';
      } else {
        statusDot.className = 'w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse';
        if (statusText) statusText.className = 'text-blue-300 font-semibold text-[11px]';
      }
    }
  }

  async init() {
    if (this.isInitialized) return;

    try {
      this.updateStatus('Booting DuckDB-WASM...', 'loading');

      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      const worker = await duckdb.createWorker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger();

      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      this.conn = await this.db.connect();

      await this.loadYearlyParquetFiles();

      this.isInitialized = true;
    } catch (err) {
      console.error('Failed to initialize DataEngine:', err);
      this.updateStatus('Engine Error', 'error');
      throw err;
    }
  }

  async loadYearlyParquetFiles() {
    const cache = await caches.open(this.cacheName);

    // 1. Process Static Historical Years (Served from CacheStorage after initial download)
    for (const year of this.historicalYears) {
      const fileName = `${year}.parquet`;
      const fileUrl = `${this.r2BaseUrl}/${fileName}`;

      let response = await cache.match(fileUrl);

      if (!response) {
        this.updateStatus(`R2 Download: ${fileName}...`, 'downloading');
        try {
          response = await fetch(fileUrl);
          if (response.ok) {
            await cache.put(fileUrl, response.clone());
          } else {
            console.warn(`File ${fileName} not found on R2.`);
            continue;
          }
        } catch (fetchErr) {
          console.error(`Download failed for ${fileName}:`, fetchErr);
          continue;
        }
      } else {
        this.updateStatus(`Cache Hit: ${fileName}`, 'cached');
      }

      const arrayBuffer = await response.arrayBuffer();
      await this.db.registerFileBuffer(fileName, new Uint8Array(arrayBuffer));
    }

    // 2. Process Current Year (Always fetch fresh daily EOD updates from R2 on startup)
    const currentYearFile = `${this.currentYear}.parquet`;
    const currentYearUrl = `${this.r2BaseUrl}/${currentYearFile}`;
    this.updateStatus(`Updating Daily EOD: ${currentYearFile}...`, 'downloading');

    try {
      const freshResponse = await fetch(currentYearUrl, { cache: 'no-store' });
      if (freshResponse.ok) {
        // Overwrite cached entry with today's latest EOD dataset
        await cache.put(currentYearUrl, freshResponse.clone());
        const arrayBuffer = await freshResponse.arrayBuffer();
        await this.db.registerFileBuffer(currentYearFile, new Uint8Array(arrayBuffer));
      } else {
        console.warn(`Could not fetch fresh ${currentYearFile} from R2.`);
      }
    } catch (err) {
      console.error(`Error fetching fresh EOD data for ${currentYearFile}:`, err);
      // Fallback to cached version if network is offline
      const cachedFallback = await cache.match(currentYearUrl);
      if (cachedFallback) {
        const arrayBuffer = await cachedFallback.arrayBuffer();
        await this.db.registerFileBuffer(currentYearFile, new Uint8Array(arrayBuffer));
      }
    }

    this.updateStatus('EOD Data Ready & Up-to-Date', 'cached');
  }

  async getSymbolData(symbol) {
    if (!this.isInitialized) await this.init();

    this.updateStatus(`Querying ${symbol}...`, 'loading');

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

      this.updateStatus(`Ready: ${symbol} (${rows.length} bars)`, 'cached');
      return rows;
    } catch (error) {
      console.error(`Error querying symbol ${symbol}:`, error);
      this.updateStatus(`No data for ${symbol}`, 'error');
      return [];
    }
  }
}

export const dataEngine = new DataEngine();