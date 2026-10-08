/**
 * DataEngine - Manages DuckDB-WASM connection, Parquet fetching from Cloudflare R2,
 * CacheStorage persistence, and OHLCV data queries.
 */

const R2_BASE_URL = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
const CACHE_NAME = 'amibroker-parquet-v1';
const START_YEAR = 2023; // Dataset contains 2023 to 2026
const CURRENT_YEAR = new Date().getFullYear();

export class DataEngine {
    constructor() {
        this.db = null;
        this.conn = null;
        this.duckdb = null;
        this.isInitialized = false;
        this.symbolList = [];
        this.registeredFiles = [];
    }

    /**
     * Initializes DuckDB-WASM worker and loads Parquet files into virtual FS.
     */
    async init(statusCallback = null) {
        if (this.isInitialized) return;

        try {
            if (statusCallback) statusCallback('Initializing DuckDB WASM...');

            // Import DuckDB-WASM bundles dynamically from CDN
            const duckdbModule = await import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm');
            this.duckdb = duckdbModule;

            const JSDELIVR_BUNDLES = duckdbModule.getJsDelivrBundles();
            const bundle = await duckdbModule.selectBundle(JSDELIVR_BUNDLES);
            
            const worker = await duckdbModule.createWorker(bundle.mainWorker);
            const logger = new duckdbModule.ConsoleLogger();
            
            this.db = new duckdbModule.AsyncDuckDB(logger, worker);
            await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
            this.conn = await this.db.connect();

            // Fetch and cache all Parquet files (2023 to 2026) into DuckDB Virtual FileSystem
            await this.loadAndRegisterParquetFiles(statusCallback);

            // Create unified view over all loaded parquet files
            await this.createUnifiedView();

            // Cache available symbol list
            await this.loadSymbolList();

            this.isInitialized = true;
            if (statusCallback) statusCallback('Ready');
            console.log('DataEngine initialized successfully.');
        } catch (error) {
            console.error('Failed to initialize DataEngine:', error);
            if (statusCallback) statusCallback('Init Failed');
            throw error;
        }
    }

    /**
     * Fetches parquet files using CacheStorage API and registers buffers in DuckDB-WASM.
     */
    async loadAndRegisterParquetFiles(statusCallback) {
        const cache = await caches.open(CACHE_NAME);
        this.registeredFiles = [];

        for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
            const fileName = `data_${year}.parquet`;
            const fileUrl = `${R2_BASE_URL}/${fileName}`;

            if (statusCallback) statusCallback(`Loading ${fileName}...`);

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
                        response = await fetch(fileUrl, { cache: 'no-cache' });
                        if (response.ok) {
                            await cache.put(fileUrl, response.clone());
                            localStorage.setItem(`last_fetch_${fileName}`, todayStr);
                        } else if (cachedResponse) {
                            response = cachedResponse;
                        }
                    }
                } else {
                    // Historical years (2023-2025): Fetch once and cache permanently
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
                    this.registeredFiles.push(fileName);
                }
            } catch (err) {
                console.warn(`Could not load Parquet file for year ${year}:`, err);
            }
        }
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
            SELECT DISTINCT symbol FROM stock_data WHERE symbol IS NOT NULL ORDER BY symbol ASC;
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
            WHERE UPPER(symbol) = '${sanitizedSymbol}'
            ORDER BY date ASC;
        `;

        const result = await this.conn.query(query);
        const rows = result.toArray().map(r => r.toJSON());

        return rows.map(row => {
            let timeVal = row.date_str;
            if (typeof timeVal === 'string' && timeVal.includes('T')) {
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