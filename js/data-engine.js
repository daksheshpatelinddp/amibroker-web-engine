/**
 * js/data-engine.js
 * DuckDB-WASM integration with permanent IndexedDB caching for Cloudflare R2 Parquet files.
 */

class DataEngine {
    constructor() {
        this.baseUrl = "https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev";
        this.db = null;
        this.conn = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.symbolCache = new Map();
        this.startYear = 2000;
        this.currentYear = new Date().getFullYear();
        this.indexedDBName = 'AmiBrokerParquetCacheDB';
        this.storeName = 'parquet_buffers';
        this.idb = null;
        this.registeredVirtualFiles = new Set();
        this.availableYears = [];
    }

    /**
     * Open IndexedDB instance for permanent local file storage.
     */
    async initIDB() {
        if (this.idb) return this.idb;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.indexedDBName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (e) => {
                this.idb = e.target.result;
                resolve(this.idb);
            };
            request.onerror = (e) => reject("Failed to open IndexedDB: " + e.target.error);
        });
    }

    /**
     * Retrieve cached Parquet ArrayBuffer from IndexedDB.
     */
    async getCachedFile(year) {
        await this.initIDB();
        return new Promise((resolve) => {
            const tx = this.idb.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(year);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    /**
     * Save downloaded historical Parquet buffer permanently to IndexedDB.
     */
    async setCachedFile(year, arrayBuffer) {
        await this.initIDB();
        return new Promise((resolve) => {
            const tx = this.idb.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            store.put(arrayBuffer, year);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    }

    /**
     * Initialize DuckDB-WASM engine & register virtual file system targets.
     */
    async init() {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                const DUCKDB_BUNDLES = duckdb.getJsDelivrBundles();
                const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);

                const workerUrl = URL.createObjectURL(
                    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
                );

                const worker = new Worker(workerUrl);
                const logger = new duckdb.ConsoleLogger();
                this.db = new duckdb.AsyncDuckDB(logger, worker);

                await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
                URL.revokeObjectURL(workerUrl);

                this.conn = await this.db.connect();

                // Enable HTTPFS extension for current year HTTP requests
                await this.conn.query(`
                    INSTALL httpfs;
                    LOAD httpfs;
                    SET custom_user_agent='AmiBroker-WebWorkstation/1.0';
                `);

                await this.prepareAvailableYears();

                this.isInitialized = true;
                console.log(`[DataEngine] DuckDB-WASM ready. Active years: [${this.availableYears.join(', ')}]`);
            } catch (err) {
                console.error("[DataEngine] Initialization error:", err);
                this.initPromise = null;
                throw err;
            }
        })();

        return this.initPromise;
    }

    /**
     * Set active year ranges to query.
     */
    async prepareAvailableYears() {
        const years = [];
        for (let yr = 2023; yr <= this.currentYear; yr++) {
            years.push(yr);
        }
        this.availableYears = years;
    }

    /**
     * Mounts historical files from IndexedDB cache or streams current year from R2.
     */
    async mountYearFile(year) {
        const fileName = `${year}.parquet`;
        if (this.registeredVirtualFiles.has(fileName)) {
            return `'${fileName}'`;
        }

        // Current active year: Stream directly from R2 URL to pick up daily EOD updates
        if (year === this.currentYear) {
            return `'${this.baseUrl}/${fileName}'`;
        }

        // Historical years: Check IndexedDB cache first
        let buffer = await this.getCachedFile(year);

        if (!buffer) {
            // Fetch once from R2, then save permanently in browser IndexedDB
            console.log(`[DataEngine] First-time load: Caching ${year}.parquet into IndexedDB...`);
            const response = await fetch(`${this.baseUrl}/${fileName}`);
            if (!response.ok) {
                return null;
            }
            buffer = await response.arrayBuffer();
            await this.setCachedFile(year, buffer);
        }

        // Register binary buffer inside DuckDB virtual WASM filesystem
        await this.db.registerFileBuffer(fileName, new Uint8Array(buffer));
        this.registeredVirtualFiles.add(fileName);
        return `'${fileName}'`;
    }

    /**
     * Execute SQL Query for requested Symbol across all mounted yearly files.
     */
    async getSymbolData(symbol) {
        await this.init();

        const cleanSymbol = symbol.trim().toUpperCase();
        if (this.symbolCache.has(cleanSymbol)) {
            return this.symbolCache.get(cleanSymbol);
        }

        const fileTargets = await Promise.all(
            this.availableYears.map(yr => this.mountYearFile(yr))
        );

        const validTargets = fileTargets.filter(target => target !== null).join(', ');

        const query = `
            SELECT 
                Date,
                Open,
                High,
                Low,
                Close,
                Volume
            FROM read_parquet([${validTargets}], union_by_name = true)
            WHERE UPPER(Symbol) = '${cleanSymbol}'
            ORDER BY Date ASC;
        `;

        try {
            const result = await this.conn.query(query);
            const rows = result.toArray().map(row => ({
                date: row.Date instanceof Date ? row.Date.toISOString().split('T')[0] : String(row.Date),
                open: Number(row.Open),
                high: Number(row.High),
                low: Number(row.Low),
                close: Number(row.Close),
                volume: Number(row.Volume)
            }));

            this.symbolCache.set(cleanSymbol, rows);
            return rows;
        } catch (err) {
            console.error(`[DataEngine] Query failed for ${cleanSymbol}:`, err);
            return [];
        }
    }

    /**
     * Fetch list of available stock tickers from latest Parquet file.
     */
    async getAvailableSymbols() {
        await this.init();
        const latestTarget = await this.mountYearFile(this.currentYear);

        try {
            const query = `
                SELECT DISTINCT Symbol 
                FROM read_parquet(${latestTarget})
                WHERE Symbol IS NOT NULL AND Symbol != ''
                ORDER BY Symbol ASC;
            `;
            const result = await this.conn.query(query);
            return result.toArray().map(r => String(r.Symbol));
        } catch (err) {
            console.error("[DataEngine] Symbol discovery failed:", err);
            return [];
        }
    }
}

// Global instance
window.dataEngine = new DataEngine();