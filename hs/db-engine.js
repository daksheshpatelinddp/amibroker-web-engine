// DuckDB-WASM & Cloudflare R2 Data Ingestion Layer
class DatabaseEngine {
  constructor(r2BucketUrl) {
    this.r2BucketUrl = r2BucketUrl || 'https://your-r2-bucket-url.r2.dev';
    this.db = null;
    this.conn = null;
    this.isReady = false;
  }

  async init() {
    try {
      console.log("Initializing DuckDB-WASM Data Engine...");
      // Dynamically load DuckDB-WASM bundle
      const duckdb = window.duckdb;
      if (!duckdb) {
        console.warn("DuckDB-WASM library script not detected. Falling back to local array mode.");
        return;
      }
      
      const BUNDLE = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      const worker = await duckdb.createWorker(BUNDLE.mainWorker);
      const logger = new duckdb.ConsoleLogger();
      
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(BUNDLE.mainModule, BUNDLE.pthreadWorker);
      this.conn = await this.db.connect();
      
      this.isReady = true;
      console.log("DuckDB-WASM initialized successfully.");
    } catch (err) {
      console.error("Failed to initialize DuckDB-WASM:", err);
    }
  }

  // Fetch OHLCV vector data for a symbol directly from Parquet on R2
  async fetchSymbolData(symbol) {
    if (!this.isReady || !this.conn) {
      console.warn("DuckDB connection not ready. Mocking data load for:", symbol);
      return null;
    }

    const parquetUrl = `${this.r2BucketUrl}/${symbol.toUpperCase()}.parquet`;
    
    // Register remote Parquet file URL via HTTP Range fetch
    await this.db.registerFileURL(
      `${symbol}.parquet`,
      parquetUrl,
      duckdb.DuckDBDataProtocol.HTTP,
      false
    );

    const query = `
      SELECT date, open, high, low, close, volume 
      FROM '${symbol}.parquet' 
      ORDER BY date ASC
    `;

    const result = await this.conn.query(query);
    return result.toArray().map(row => row.toJSON());
  }
}

window.dbEngine = new DatabaseEngine();