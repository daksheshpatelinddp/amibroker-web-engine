/**
 * DataEngine - Manages DuckDB-WASM connection, Parquet fetching from Cloudflare R2,
 * CacheStorage persistence, and OHLCV data queries.
 */

const R2_BASE_URL = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
const CACHE_NAME = 'amibroker-parquet-v1';
const START_YEAR = 2023; // Data available from 2023 onwards
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
     * Dispatch status events to update the UI pill and bottom status bar
     */
    notifyStatus(text, type = 'info') {
        window.dispatchEvent(new CustomEvent('r2-cache-update', {
            detail: { message: text, type }
        }));
    }

    notifyEngineStatus(text, statusClass) {
        window.dispatchEvent(new CustomEvent('engine-status-update', {
            detail: { text, statusClass }
        }));
    }

    /**
     * Initializes DuckDB-WASM worker and registers Parquet files.
     */
    async init() {
        if (this.isInitialized) return;

        try {
            this.notifyEngineStatus('Initializing Engine...', 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20');
            this.notifyStatus('Connecting to DuckDB WASM...');

            // Dynamically load DuckDB WASM from CDN
            const duckdbModule = await import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm');
            this.duckdb = duckdbModule;

            const JSDELIVR_BUNDLES = duckdbModule.getJsDelivrBundles();
            const bundle = await duckdbModule.selectBundle(JSDELIVR_BUNDLES);
            
            const worker = await duckdbModule.createWorker(bundle.mainWorker);
            const logger = new duckdbModule.ConsoleLogger();
            
            this.db = new duckdbModule.AsyncDuckDB(logger, worker);
            await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
            this.conn = await this.db.connect();

            // Fetch and register Parquet files (2023 to 2026)
            await this.loadAndRegisterParquetFiles();

            // Create unified view over all registered files
            await this.createUnifiedView();

            // Load symbol list (~3,000+ equities)
            await this.loadSymbolList();

            this.isInitialized = true;

            this.notifyEngineStatus('Engine Ready', 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20');
            this.notifyStatus(`Cached ${this.registeredFiles.length} Parquet Files (${this.symbolList.length} Symbols)`);

            console.log(`DataEngine ready: ${this.symbolList.length} symbols loaded.`);
        } catch (error) {
            console.error('DataEngine initialization failed:', error);
            this.notifyEngineStatus('Engine Error', 'bg-red-500/10 text-red-400 border-red-500/20');
            this.notifyStatus('Failed to load Parquet dataset');
            throw error;
        }
    }

    /**
     * Fetches parquet files using CacheStorage API and registers buffers in DuckDB-WASM.
     */
    async loadAndRegisterParquetFiles() {
        const cache = await caches.open(CACHE_NAME);
        this.registeredFiles = [];

        for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
            const fileName = `data_${year}.parquet`;
            const fileUrl = `${R2_BASE_URL}/${fileName}`;

            this.notifyStatus(`Downloading ${fileName}...`);

            try {
                let response;
                const isCurrentYear = (year === CURRENT_YEAR);

                if (isCurrentYear) {
                    // Current year daily refresh check
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
                    // Historical years (2023-2025): Permanent browser caching
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
                console.warn(`Could not load ${fileName}:`, err);
            }
        }

        if (this.registeredFiles.length === 0) {
            throw new Error('No Parquet files could be downloaded from R2.');
        }
    }

    /**
     * Constructs a unified SQL view merging all registered year Parquet files.
     */
    async createUnifiedView() {
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