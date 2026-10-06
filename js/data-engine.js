import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

class DataEngine {
    constructor() {
        this.db = null;
        this.conn = null;
        this.isInitialized = false;
        // Update this URL if serving Parquet files from Cloudflare R2 bucket or static host
        this.baseUrl = window.location.origin;
    }

    /**
     * Initializes DuckDB-WASM using JSDelivr CDN bundles to ensure 
     * cross-origin & static MIME type compatibility across Render.com host environments.
     */
    async init() {
        const statusBadge = document.querySelector('.data-status-badge');

        try {
            if (statusBadge) {
                statusBadge.textContent = 'Initializing DB...';
                statusBadge.classList.remove('error');
            }

            // Select optimal bundle (MVP vs EH/SIMD) from CDN
            const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
            const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

            const worker = await duckdb.createWorker(bundle.mainWorker);
            this.db = new duckdb.AsyncDuckDB(worker);
            await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

            this.conn = await this.db.connect();
            this.isInitialized = true;

            console.log('[DataEngine] DuckDB-WASM initialized successfully.');

            if (statusBadge) {
                statusBadge.textContent = 'EOD Ready';
                statusBadge.style.color = '#2da44e';
            }

            // Load initial metadata/index
            await this.loadSymbolIndex();

        } catch (error) {
            console.error('[DataEngine Initialization Error]:', error);
            this.isInitialized = false;

            if (statusBadge) {
                statusBadge.textContent = 'Data Engine Error';
                statusBadge.style.color = '#f85149';
            }
        }
    }

    /**
     * Loads symbol catalog or Parquet metadata index into DuckDB memory.
     */
    async loadSymbolIndex() {
        if (!this.isInitialized) return;

        try {
            // Register HTTPFS spatial extension if fetching Parquet from external remote buckets
            await this.conn.query(`INSTALL httpfs; LOAD httpfs;`);
            console.log('[DataEngine] HTTPFS extension loaded for remote Parquet fetching.');
        } catch (err) {
            console.warn('[DataEngine] HTTPFS loading notice:', err.message);
        }
    }

    /**
     * Queries Parquet data for a specific symbol.
     * @param {string} symbol - Equity ticker (e.g., RELIANCE, TCS)
     * @returns {Promise<Array>} Array of bar objects { date, open, high, low, close, volume }
     */
    async fetchSymbolData(symbol) {
        if (!this.isInitialized) {
            throw new Error("DataEngine is not initialized yet.");
        }

        try {
            const formattedSymbol = symbol.trim().toUpperCase();
            // Point to your Parquet store path (e.g., /data/EOD_DATA.parquet or R2 public bucket URL)
            const query = `
                SELECT date, open, high, low, close, volume 
                FROM read_parquet('${this.baseUrl}/data/${formattedSymbol}.parquet') 
                ORDER BY date ASC;
            `;

            const result = await this.conn.query(query);
            const rows = result.toArray().map(row => row.toJSON());
            return rows;

        } catch (error) {
            console.error(`[DataEngine] Error fetching Parquet data for ${symbol}:`, error);
            throw error;
        }
    }

    /**
     * Cleans up DuckDB connection resources on teardown.
     */
    async destroy() {
        if (this.conn) {
            await this.conn.close();
        }
        if (this.db) {
            await this.db.terminate();
        }
        this.isInitialized = false;
    }
}

// Global Singleton Instance
export const dataEngine = new DataEngine();

// Auto-start initialization on page load
document.addEventListener('DOMContentLoaded', () => {
    dataEngine.init();
});