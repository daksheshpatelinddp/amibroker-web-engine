/**
 * js/data-engine.js
 * AmiBroker Web Workstation - DuckDB-WASM & Tiered Parquet Data Engine
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
  }

  /**
   * Open IndexedDB Cache Store
   */
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
   * Initialize DuckDB-WASM Engine using same-origin blob worker
   */
  async init() {
    try {
      this.setLoaderProgress('Initializing DuckDB Engine...', 10, 'Creating local worker...');
      this.updateStatus('Initializing DB...', 'amber');

      const duckdb = window.duckdb;
      if (!duckdb) {
        throw new Error('DuckDB library script tag not found.');
      }

      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      // Fetch worker script as text and create same-origin Blob URL
      const workerScript = await fetch(bundle.mainWorker).then(r => r.text());
      const workerBlobUrl = URL.createObjectURL(
        new Blob([workerScript], { type: 'text/javascript' })
      );

      const worker = new Worker(workerBlobUrl);
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);

      await this.db.instantiate(bundle.mainModule);
      URL.revokeObjectURL(workerBlobUrl);

      this.conn = await this.db.connect();

      this.setLoaderProgress('DuckDB Worker Ready', 25, 'Downloading Parquet dataset from R2...');

      // Download Parquet files into virtual memory
      this.localParquetFiles = await this.loadParquetFilesWithCache();

      // Index available stock symbols
      await this.indexSymbols();

      // Bind search combobox UI
      this.setupComboboxUI();

      this.isInitialized = true;
      this.hideLoader();
      this.updateStatus('Data Engine Ready', 'emerald');

      if (this.selectedSymbol && typeof this.onSymbolChangeCallback === 'function') {
        this.onSymbolChangeCallback(this.selectedSymbol);
      }
    } catch (error) {
      console.error('DataEngine Initialization Error:', error);
      this.setLoaderProgress('Initialization Failed', 100, error.message || 'Worker setup failed');
      this.updateStatus('Engine Failed', 'red');
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

      const progressStart = 25 + Math.floor(((step - 1) / totalFiles) * 60);
      const progressEnd = 25 + Math.floor((step / totalFiles) * 60);

      let buffer = await this.idbGet(cacheKey);
      if (buffer) {
        this.setLoaderProgress(`Loading ${filename} (cached)...`, progressEnd, 'Using local IndexedDB cache');
      } else {
        this.setLoaderProgress(`Downloading ${filename} from R2...`, progressStart, 'Fetching remote Parquet bytes...');
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`Failed to fetch ${filename} from R2: HTTP ${resp.status}`);
        }
        buffer = await resp.arrayBuffer();
        await this.idbPut(cacheKey, buffer);
        this.setLoaderProgress(`Cached ${filename}`, progressEnd, 'Saved to IndexedDB cache');
      }

      const localName = `local_${filename}`;
      await this.db.registerFileBuffer(localName, new Uint8Array(buffer));
      localNames.push(localName);
    }

    // Register SQL View 'all_stocks' over local parquet files
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
    this.setLoaderProgress('Indexing Symbol Universe...', 90, 'Filtering active tickers...');
    
    try {
      const query = `
        SELECT Symbol
        FROM all_stocks
        WHERE Symbol IS NOT NULL AND TRIM(Symbol) <> ''
        GROUP BY Symbol
        HAVING COUNT(*) >= 50
        ORDER BY Symbol ASC
      `;

      const result = await this.conn.query(query);
      const rawRows = result.toArray().map(row => row.toJSON());

      this.allSymbols = rawRows.map(obj => obj.Symbol ?? obj.symbol ?? Object.values(obj)[0]).filter(Boolean);

      if (this.allSymbols.length > 0) {
        const PREFERRED_DEFAULTS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN'];
        const normalize = s => String(s).replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim();

        let defaultSymbol = this.allSymbols.find(s => PREFERRED_DEFAULTS.includes(normalize(s)));
        if (!defaultSymbol) {
          defaultSymbol = this.allSymbols[0];
        }
        this.selectedSymbol = defaultSymbol;
      }
    } catch (err) {
      console.error('Failed to index symbols:', err);
      this.allSymbols = [];
    }
  }

  /**
   * Bind top toolbar symbol search box
   */
  setupComboboxUI() {
    const searchInput = document.getElementById('symbolSearchInput');
    const dropdown = document.getElementById('symbolDropdown');

    if (!searchInput || !dropdown) return;

    searchInput.value = this.selectedSymbol;
    searchInput.placeholder = 'Search Symbol...';

    const renderDropdownItems = (filterText = '') => {
      const query = filterText.trim().toUpperCase();
      const filtered = query 
        ? this.allSymbols.filter(s => s.includes(query)).slice(0, 50)
        : this.allSymbols.slice(0, 50);

      if (filtered.length === 0) {
        dropdown.innerHTML = `<div class="px-3 py-2 text-slate-500 italic">No matching symbols</div>`;
      } else {
        dropdown.innerHTML = filtered.map(sym => `
          <div 
            data-symbol="${sym}" 
            class="symbol-option px-3 py-1.5 hover:bg-sky-600 hover:text-white cursor-pointer font-semibold tracking-wide text-slate-200 transition-colors"
          >
            ${sym}
          </div>
        `).join('');
      }
      dropdown.classList.remove('hidden');
    };

    searchInput.addEventListener('focus', () => renderDropdownItems(searchInput.value));
    searchInput.addEventListener('input', (e) => renderDropdownItems(e.target.value));

    dropdown.addEventListener('click', (e) => {
      const option = e.target.closest('.symbol-option');
      if (option) {
        const symbol = option.dataset.symbol;
        this.setSymbol(symbol);
        dropdown.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }

  setSymbol(symbol) {
    if (!symbol) return;
    this.selectedSymbol = symbol.toUpperCase();
    const searchInput = document.getElementById('symbolSearchInput');
    if (searchInput) searchInput.value = this.selectedSymbol;

    if (typeof this.onSymbolChangeCallback === 'function') {
      this.onSymbolChangeCallback(this.selectedSymbol);
    }
  }

  /**
   * Query OHLCV data for selected symbol & timeframe
   */
  async getOHLCV(symbol, timeframe = '1D') {
    if (!this.isInitialized || !this.conn) return [];

    const targetSymbol = (symbol || this.selectedSymbol).toUpperCase();

    try {
      let query = `
        SELECT Date, Open, High, Low, Close, Volume 
        FROM all_stocks 
        WHERE UPPER(Symbol) = '${targetSymbol}' 
        ORDER BY Date ASC;
      `;

      if (timeframe === '1W') {
        query = `
          SELECT 
            DATE_TRUNC('week', Date::DATE) as Date,
            FIRST(Open ORDER BY Date ASC) as Open,
            MAX(High) as High,
            MIN(Low) as Low,
            LAST(Close ORDER BY Date ASC) as Close,
            SUM(Volume) as Volume
          FROM all_stocks
          WHERE UPPER(Symbol) = '${targetSymbol}'
          GROUP BY DATE_TRUNC('week', Date::DATE)
          ORDER BY Date ASC;
        `;
      } else if (timeframe === '1M') {
        query = `
          SELECT 
            DATE_TRUNC('month', Date::DATE) as Date,
            FIRST(Open ORDER BY Date ASC) as Open,
            MAX(High) as High,
            MIN(Low) as Low,
            LAST(Close ORDER BY Date ASC) as Close,
            SUM(Volume) as Volume
          FROM all_stocks
          WHERE UPPER(Symbol) = '${targetSymbol}'
          GROUP BY DATE_TRUNC('month', Date::DATE)
          ORDER BY Date ASC;
        `;
      }

      const res = await this.conn.query(query);
      const rows = res.toArray().map(r => r.toJSON());

      return rows.map(r => ({
        time: typeof r.Date === 'string' ? r.Date.split('T')[0] : new Date(r.Date).toISOString().split('T')[0],
        open: Number(r.Open),
        high: Number(r.High),
        low: Number(r.Low),
        close: Number(r.Close),
        volume: Number(r.Volume || 0)
      }));
    } catch (err) {
      console.error(`Error querying OHLCV for ${targetSymbol}:`, err);
      return [];
    }
  }

  setLoaderProgress(msg, percent, subText) {
    const msgEl = document.getElementById('loaderMessage');
    const subEl = document.getElementById('loaderSubText');
    const barEl = document.getElementById('loaderProgressBar');

    if (msgEl) msgEl.innerText = msg;
    if (subEl) subEl.innerText = subText || '';
    if (barEl) barEl.style.width = `${percent}%`;
  }

  hideLoader() {
    const loader = document.getElementById('loaderOverlay');
    if (loader) {
      loader.classList.add('transition-opacity', 'duration-300', 'opacity-0');
      setTimeout(() => loader.remove(), 300);
    }
  }

  updateStatus(text, color) {
    const el = document.getElementById('engineStatus');
    if (!el) return;

    const colorClasses = {
      amber: 'text-amber-400 bg-amber-950/30 border-amber-800/50',
      emerald: 'text-emerald-400 bg-emerald-950/30 border-emerald-800/50',
      red: 'text-red-400 bg-red-950/30 border-red-800/50'
    };

    const dotClasses = {
      amber: 'bg-amber-400 animate-pulse',
      emerald: 'bg-emerald-400',
      red: 'bg-red-400'
    };

    el.className = `flex items-center space-x-1.5 text-[11px] font-mono px-2 py-0.5 rounded border ${colorClasses[color] || colorClasses.amber}`;
    el.innerHTML = `
      <span class="w-2 h-2 rounded-full ${dotClasses[color] || dotClasses.amber}"></span>
      <span>${text}</span>
    `;
  }
}

export const dataEngine = new DataEngine();