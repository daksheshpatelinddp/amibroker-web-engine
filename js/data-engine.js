/**
 * DataEngine - Manages DuckDB-WASM connection, Parquet fetching from Cloudflare R2,
 * CacheStorage persistence, and OHLCV data queries.
 */

const R2_BASE_URL = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
const CACHE_NAME = 'amibroker-parquet-v1';
const START_YEAR = 2000;
const CURRENT_YEAR = new Date().getFullYear();

export class DataEngine {
    constructor() {
        this.db = null;
        this.conn = null;
        this.duckdb = null;
        this.isInitialized = false;
        this.symbolList = [];
    }

    /**
     * Initializes DuckDB-WASM worker and loads Parquet files into virtual FS.
     */
    async init() {
        if (this.isInitialized) return;

        try {
            // Import DuckDB-WASM bundles dynamically from CDN
            const duckdbModule = await import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm');
            this.duckdb = duckdbModule;

            const MANUAL_BUNDLES = {
                mvp: {
                    mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm',
                    mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js',
                },
                eh: {
                    mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm',
                    mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js',
                },
            };

            const bundle = await duckdbModule.selectBundle(MANUAL_BUNDLES);
            const worker = new Worker(bundle.mainWorker);
            const logger = new duckdbModule.ConsoleLogger();
            
            this.db = new duckdbModule.AsyncDuckDB(logger, worker);
            await this.db.instantiate(bundle.mainModule);
            this.conn = await this.db.connect();

            // Fetch and cache all Parquet files into DuckDB Virtual FileSystem
            await this.loadAndRegisterParquetFiles();

            // Create unified view over all loaded parquet files
            await this.createUnifiedView();

            // Cache available symbol list
            await this.loadSymbolList();

            this.isInitialized = true;
            console.log('DataEngine initialized successfully.');
        } catch (error) {
            console.error('Failed to initialize DataEngine:', error);
            throw error;
        }
    }

    /**
     * Fetches parquet files using CacheStorage API and registers buffers in DuckDB-WASM.
     */
    async loadAndRegisterParquetFiles() {
        const cache = await caches.open(CACHE_NAME);
        const registeredFiles = [];

        for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
            const fileName = `data_${year}.parquet`;
            const fileUrl = `${R2_BASE_URL}/${fileName}`;

            try {
                let response;
                const isCurrentYear = (year === CURRENT_YEAR);

                if (isCurrentYear) {
                    // Check daily refresh for current year file
                    const cachedResponse = await cache.match(fileUrl);
                    const lastFetched = localStorage.getItem(`last_fetch_${fileName}`);
                    const todayStr = new Date().toISOString().split('T')[0];

                    if (cachedResponse && lastFetched === todayStr) {
                        response = cachedResponse;
                    } else {
                        // Fetch fresh current year Parquet file from R2
                        response = await fetch(fileUrl, { cache: 'no-cache' });
                        if (response.ok) {
                            await cache.put(fileUrl, response.clone());
                            localStorage.setItem(`last_fetch_${fileName}`, todayStr);
                        } else if (cachedResponse) {
                            // Fallback to cached version if offline/failed
                            response = cachedResponse;
                        }
                    }
                } else {
                    // Historical years (2000-2025): Fetch once and cache permanently
                    response = await cache.match(fileUrl);
                    if (!response) {
                        response = await fetch(fileUrl);
                        if (response.ok) {
                            await cache.put(fileUrl, response.clone());
                        }
                    }
                }

                if (response && response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    await this.db.registerFileBuffer(fileName, uint8Array);
                    registeredFiles.push(fileName);
                }
            } catch (err) {
                console.warn(`Could not load Parquet file for year ${year}:`, err);
            }
        }

        this.registeredFiles = registeredFiles;
    }

    /**
     * Constructs a unified SQL view merging all registered year Parquet files.
     */
    async createUnifiedView() {
        if (!this.registeredFiles || this.registeredFiles.length === 0) {
            throw new Error('No Parquet files were registered in DuckDB.');
        }

        const filesListStr = this.registeredFiles.map(f => `'${f}'`).join(', ');
        const query = `
            CREATE OR REPLACE VIEW stock_data AS 
            SELECT * FROM read_parquet([${filesListStr}]);
        `;
        await this.conn.query(query);
    }

    /**
     * Loads the complete symbol list (~3,000+ equities) from the dataset.
     */
    async loadSymbolList() {
        const result = await this.conn.query(`
            SELECT DISTINCT symbol FROM stock_data ORDER BY symbol ASC;
        `);
        
        const rows = result.toArray().map(row => row.toJSON());
        this.symbolList = rows.map(r => r.symbol);
        return this.symbolList;
    }

    /**
     * Retrieves all available symbols.
     */
    getSymbols() {
        return this.symbolList;
    }

    /**
     * Queries OHLCV bar chart data for a specific stock symbol.
     * @param {string} symbol - Stock ticker symbol (e.g. "RELIANCE")
     * @returns {Array<Object>} Array of bar objects formatted for Lightweight Charts
     */
    async getOHLCV(symbol) {
        if (!symbol) return [];

        const sanitizedSymbol = symbol.trim().toUpperCase();
        const query = `
            SELECT 
                CAST(date AS VARCHAR) as date_str,
                open, 
                high, 
                low, 
                close, 
                volume 
            FROM stock_data 
            WHERE symbol = '${sanitizedSymbol}'
            ORDER BY date ASC;
        `;

        const result = await this.conn.query(query);
        const rows = result.toArray().map(r => r.toJSON());

        return rows.map(row => {
            // Convert date representation to UNIX timestamp (seconds) or YYYY-MM-DD string
            let timeVal = row.date_str;
            if (typeof timeVal === 'number' || !isNaN(timeVal)) {
                timeVal = Math.floor(new Date(row.date_str).getTime() / 1000);
            } else if (typeof timeVal === 'string' && timeVal.includes('T')) {
                timeVal = timeVal.split('T')[0];
            }

            return {
                time: timeVal,
                open: Number(row.open),
                high: Number(row.high),
                low: Number(row.low),
                close: Number(row.close),
                volume: Number(row.volume || 0)
            };
        });
    }
}