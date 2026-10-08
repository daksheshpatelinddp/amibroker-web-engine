/**
 * js/data-engine.js
 * AmiBroker Web Workstation - DuckDB-WASM & Tiered Parquet Data Engine
 * Features On-Screen Live Debug Console
 */

class DataEngine {
  constructor() {
    this.db = null;
    this.conn = null;
    this.isInitialized = false;
    
    this.baseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
    this.parquetFiles = [
      `${this.baseUrl}/2023.parquet`,
      `${this.baseUrl}/2024.parquet`,
      `${this.baseUrl}/2025.parquet`,
      `${this.baseUrl}/2026.parquet`
    ];

    this.cacheVersion = 'v6';
    this.cacheDbName = 'nse-parquet-cache';
    this.cacheStore = 'files';
    this.currentYear = new Date().getFullYear();

    this.localParquetFiles = [];
    this.allSymbols = [];
    this.selectedSymbol = '';
    this.onSymbolChangeCallback = null;

    // Attach global error capturer
    this.setupGlobalErrorLogging();
  }

  setupGlobalErrorLogging() {
    window.addEventListener('error', (e) => {
      this.showErrorOnScreen(`GLOBAL ERROR: ${e.message} at ${e.filename}:${e.lineno}`);
    });

    window.addEventListener('unhandledrejection', (e) => {
      this.showErrorOnScreen(`UNHANDLED PROMISE REJECTION: ${e.reason?.message || e.reason}`);
    });
  }

  showErrorOnScreen(errText) {
    console.error(errText);
    const errBox = document.getElementById('errorDisplay');
    if (errBox) {
      errBox.classList.remove('hidden');
      errBox.innerText += `\n[${new Date().toLocaleTimeString()}]${errText}`;
    }
    this.updateStatus('Engine Error', 'red');
  }

  openCacheDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.cacheDbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.cacheStore);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async idbGet(key) {
    try {
      const cdb = await this.openCacheDB();
      return await new Promise((resolve, reject) => {
        const tx = cdb.transaction(this.cacheStore, 'readonly');
        const req = tx.objectStore(this.cacheStore).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB read failed:', e);
      return null;
    }
  }

  async idbPut(key, value) {
    try {
      const cdb = await this.openCacheDB();
      await new Promise((resolve, reject) => {
        const tx = cdb.transaction(this.cacheStore, 'readwrite');
        tx.objectStore(this.cacheStore).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('IndexedDB write failed:', e);
    }
  }

  /**
   * Initialize DuckDB-WASM Instance
   */
  async init() {
    try {
      this.setLoaderProgress('Initializing DuckDB WASM...', 10, 'Step 1/3: Locating CDN Bundles...');
      this.updateStatus('Initializing DB...', 'amber');

      const duckdb = window.duckdb;
      if (!duckdb) {
        throw new Error('window.duckdb is undefined. DuckDB script tag failed to load from CDN.');
      }

      this.setLoaderProgress('Selecting WASM Bundle...', 15, 'Step 1/3: Fetching WASM binaries...');
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      this.setLoaderProgress('Creating Same-Origin Worker...', 20, 'Step 1/3: Fetching worker script...');
      const workerScript = await fetch(bundle.mainWorker).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching mainWorker from jsDelivr`);
        return r.text();
      });

      const workerBlobUrl = URL.createObjectURL(
        new Blob([workerScript], { type: 'text/javascript' })
      );

      const worker = new Worker(workerBlobUrl);
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);

      this.setLoaderProgress('Instantiating WASM Module...', 25, 'Step 1/3: Compiling WASM module...');
      await this.db.instantiate(bundle.mainModule);
      URL.revokeObjectURL(workerBlobUrl);

      this.conn = await this.db.connect();

      this.setLoaderProgress('DuckDB Engine Online', 30, 'Step 2/3: Checking Parquet Files...');

      // Load Parquet files into virtual memory
      this.localParquetFiles = await this.loadParquetFilesWithCache();

      // Index available symbols
      await this.indexSymbols();

      // Setup Search Combobox
      this.setupComboboxUI();

      this.isInitialized = true;
      this.hideLoader();
      this.updateStatus('Data Engine Ready', 'emerald');

      if (this.selectedSymbol && typeof this.onSymbolChangeCallback === 'function') {
        this.onSymbolChangeCallback(this.selectedSymbol);
      }
    } catch (error) {
      this.showErrorOnScreen(`INIT FAIL: ${error.stack || error.message || error}`);
    }
  }

  /**
   * Load and Cache Parquet files in IndexedDB
   */
  async loadParquetFilesWithCache() {
    const localNames = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const totalFiles = this.parquetFiles.length;
    let step = 0;

    for (const url of this.parquetFiles) {
      step++;
      const filename = url.split('/').pop();
      const year = parseInt(filename, 10);
      const isCurrentYear = year === this.currentYear;
      const cacheKey = isCurrentYear
        ? `${filename}::${this.cacheVersion}::${todayStr}`
        : `${filename}::${this.cacheVersion}`;

      const progressStart = 30 + Math.floor(((step - 1) / totalFiles) * 55);
      const progressEnd = 30 + Math.floor((step / totalFiles) * 55);

      let buffer = await this.idbGet(cacheKey);
      if (buffer) {
        this.setLoaderProgress(`Loading ${filename} (cached)...`, progressEnd, 'Using IndexedDB offline cache');
      } else {
        this.setLoaderProgress(`Downloading ${filename} from R2...`, progressStart, `Fetching ${url}...`);
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} when fetching${url}`);
        }
        buffer = await resp.arrayBuffer();
        await this.idbPut(cacheKey, buffer);
        this.setLoaderProgress(`Cached ${filename}`, progressEnd, 'Saved to IndexedDB cache');
      }

      const localName = `local_${filename}`;
      await this.db.registerFileBuffer(localName, new Uint8Array(buffer));
      localNames.push(localName);
    }

    this.setLoaderProgress('Building DuckDB SQL View...', 88, 'Mapping local_2023 .. local_2026...');
    const createViewQuery = `
      CREATE VIEW all_stocks AS 
      SELECT * FROM read_parquet([${localNames.map(f => `'${f}'`).join(',')}]);
    `;
    await this.conn.query(createViewQuery);

    return localNames;
  }

  /**
   * Index symbols with HAVING COUNT(*) >= 50
   */
  async indexSymbols() {
    this.setLoaderProgress('Indexing Symbol Universe...', 92, 'Step 3/3: Extracting active tickers...');
    
    try {
      const query = `
        SELECT Symbol
        FROM all_stocks
        WHERE Symbol IS NOT NULL AND TRIM(Symbol) <> ''
        GROUP BY Symbol
        HAVING COUNT(*) >= 50
        ORDER BY Symbol