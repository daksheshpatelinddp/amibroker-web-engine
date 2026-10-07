// js/data-engine.js

class DataEngine {
    constructor() {
        this.db = null;
        this.conn = null;
        this.baseUrl = "https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev";
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        try {
            const JSDELIVR_BUNDLES = window.duckdb.getJsDelivrBundles();
            const bundle = await window.duckdb.selectBundle(JSDELIVR_BUNDLES);
            
            const worker_url = URL.createObjectURL(
                new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
            );

            const worker = new Worker(worker_url);
            const logger = new window.duckdb.ConsoleLogger();
            this.db = new window.duckdb.AsyncDuckDB(logger, worker);
            await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
            this.conn = await this.db.connect();
            
            this.isInitialized = true;
            console.log("DuckDB-WASM initialized successfully.");
        } catch (error) {
            console.error("Failed to initialize DuckDB-WASM:", error);
            throw error;
        }
    }

    async loadSymbolData(symbol) {
        if (!this.isInitialized) {
            await this.init();
        }

        const cleanSymbol = symbol.toUpperCase().replace('.PARQUET', '');
        const parquetUrl = `${this.baseUrl}/${cleanSymbol}.parquet`;

        try {
            // Register or fetch the parquet file into DuckDB virtual filesystem
            const response = await fetch(parquetUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const buffer = await response.arrayBuffer();
            const fileName = `${cleanSymbol}.parquet`;
            
            await this.db.registerFileBuffer(fileName, new Uint8Array(buffer));

            // Query and normalize data fields
            const query = `
                SELECT 
                    strftime(CAST(Date AS DATE), '%Y-%m-%d') AS time,
                    CAST(Open AS DOUBLE) AS open,
                    CAST(High AS DOUBLE) AS high,
                    CAST(Low AS DOUBLE) AS low,
                    CAST(Close AS DOUBLE) AS close,
                    CAST(Volume AS DOUBLE) AS volume
                FROM '${fileName}'
                ORDER BY Date ASC
            `;

            const result = await this.conn.query(query);
            const rows = result.toArray().map(row => row.toJSON());

            // Filter out invalid rows and ensure sorted order
            const formattedData = rows
                .filter(r => r.time && !isNaN(r.close))
                .sort((a, b) => (a.time > b.time ? 1 : -1));

            return formattedData;
        } catch (error) {
            console.error(`Error loading data for ${symbol}:`, error);
            return [];
        }
    }
}

window.dataEngine = new DataEngine();