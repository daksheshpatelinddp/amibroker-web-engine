/**
 * AmiBroker Web Workstation - Data Engine
 * DuckDB-WASM Parquet Query Engine for Cloudflare R2
 */

class DataEngine {
    constructor() {
        // REPLACE THIS with your actual Cloudflare R2 public bucket URL
        this.r2BaseUrl = "https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev";
        this.db = null;
        this.conn = null;
        this.isInitialized = false;
        this.initDuckDB();
    }

    cleanSymbolKey(symbol) {
        if (!symbol) return "RELIANCE";
        return symbol.toUpperCase().replace(/\.(NS|BO)$/i, "").trim();
    }

    async initDuckDB() {
        try {
            if (window.duckdb) {
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
                console.log("[DuckDB-WASM] Initialized successfully");
            }
        } catch (err) {
            console.warn("[DuckDB-WASM] Failed to initialize, using HTTP/Fallback mode:", err);
        }
    }

    async fetchHistoricalData(symbol) {
        const cleanKey = this.cleanSymbolKey(symbol);
        const parquetUrl = `${this.r2BaseUrl}/${cleanKey}.parquet`;

        // 1. Try DuckDB Parquet Query if initialized
        if (this.isInitialized && this.conn) {
            try {
                const query = `
                    SELECT 
                        strftime(CAST(Date AS DATE), '%Y-%m-%d') as time,
                        CAST(Open AS DOUBLE) as open,
                        CAST(High AS DOUBLE) as high,
                        CAST(Low AS DOUBLE) as low,
                        CAST(Close AS DOUBLE) as close,
                        CAST(Volume AS DOUBLE) as volume
                    FROM read_parquet('${parquetUrl}')
                    ORDER BY Date ASC
                `;
                const result = await this.conn.query(query);
                const rows = result.toArray().map(row => row.toJSON());
                if (rows && rows.length > 0) return rows;
            } catch (e) {
                console.warn(`[DuckDB] Failed querying R2 Parquet for ${cleanKey}:`, e);
            }
        }

        // 2. Local Fallback Dataset Generator
        return this.generateFallbackData(cleanKey);
    }

    generateFallbackData(symbol) {
        let data = [];
        let baseTime = new Date(2025, 0, 1).getTime() / 1000;
        let price = 1000 + (symbol.length * 45);

        for (let i = 0; i < 220; i++) {
            let change = (Math.random() - 0.48) * (price * 0.025);
            let open = price;
            let close = price + change;
            let high = Math.max(open, close) + Math.random() * (price * 0.008);
            let low = Math.min(open, close) - Math.random() * (price * 0.008);
            let volume = Math.floor(Math.random() * 120000) + 25000;

            let timeString = new Date((baseTime + i * 86400) * 1000).toISOString().split('T')[0];

            data.push({ time: timeString, open, high, low, close, volume });
            price = close;
        }
        return data;
    }
}

window.dataEngine = new DataEngine();