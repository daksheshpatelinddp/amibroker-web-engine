/**
 * js/data-engine.js
 * AmiBroker Web Workstation - DuckDB-WASM & Tiered Parquet Data Engine
 * Includes CORS protection, worker error handling, and tiered caching.
 */

import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

class DataEngine {
  constructor() {
    this.db = null;
    this.conn = null;
    this.isInitialized = false;
    this.baseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
    
    this.archivedYears = [2023, 2024, 2025];
    this.currentYear = 2026;
    
    this.allSymbols = [];
    this.selectedSymbol = '';
    this.onSymbolChangeCallback = null;
  }

  /**
   * Initialize DuckDB-WASM instance & start file loading
   */
  async init() {
    try {
      this.setLoaderProgress('Initializing DuckDB WASM Engine...', 10, 'Connecting to database worker...');
      this.updateStatus('Initializing DB...', 'amber');

      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      // Create blob worker for bundle
      const workerCode = `
        importScripts("${bundle.mainWorker}");
      `;
      const blob = new Blob([workerCode], { type: 'text/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);

      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);

      this.conn = await this.db.connect();

      this.setLoaderProgress('DuckDB Engine Ready', 20, 'Connecting to Cloudflare R2 Storage...');

      // Load Parquet files with live progress
      await this.loadParquetFiles();

      // Extract symbols automatically from DuckDB cache
      await this.indexSymbols();

      // Setup Search Combobox UI
      this.setupComboboxUI();

      this.isInitialized = true;
      this.hideLoader();
      this.updateStatus('Data Engine Ready', 'emerald');

      // Trigger default symbol load if callback registered
      if (this.selectedSymbol && typeof this.onSymbolChangeCallback === 'function') {
        this.onSymbolChangeCallback(this.selectedSymbol);
      }
    } catch (error) {
      console.error('DataEngine Initialization Error:', error);
      this.setLoaderProgress('Initialization Failed', 100, `Error: ${error.message || 'CORS / Worker Blocked'}`);
      this.updateStatus('Engine Failed', 'red');
    }
  }

  /**
   * Fetch Parquet file with stream progress tracking
   */
  async fetchWithProgress(url, progressStart, progressEnd, label) {
    let response;
    try {
      response = await fetch(url, { mode: 'cors' });
    } catch (netErr) {
      throw new Error(`Network/CORS error fetching ${label}. Check R2 CORS settings.`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} when fetching ${label}`);
    }

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    
    const reader = response.body.getReader();
    let loadedBytes = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loadedBytes += value.length;

      if (totalBytes > 0) {
        const percent = Math.round(progressStart + ((loadedBytes / totalBytes) * (progressEnd - progressStart)));
        const loadedMB = (loadedBytes / (1024 * 1024)).toFixed(1);
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
        this.setLoaderProgress(`Downloading ${label}... (${loadedMB}MB / ${totalMB}MB)`, percent, `Caching file locally...`);
      } else {
        const loadedMB = (loadedBytes / (1024 * 1024)).toFixed(1);
        this.setLoaderProgress(`Downloading ${label}... (${loadedMB}MB)`, progressStart, `Streaming data buffer...`);
      }
    }

    const allChunks = new Uint8Array(loadedBytes);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    return new Response(allChunks.buffer, {
      headers: { 'Content-Type': 'application/octet-stream' }
    });
  }

  /**
   * Load and cache Parquet files across static & active tiers
   */
  async loadParquetFiles() {
    const staticCache = await caches.open('ami-parquet-static-v1');
    const activeCache = await caches.open('ami-parquet-active-v1');
    const registeredFiles = [];

    const totalYears = this.archivedYears.length + 1;
    let currentStep = 0;

    // 1. Load Archived Past Years (2023 - 2025)
    for (const year of this.archivedYears) {
      currentStep++;
      const fileName = `${year}.parquet`;
      const fileUrl = `${this.baseUrl}/${fileName}`;
      const pStart = 20 + Math.floor(((currentStep - 1) / totalYears) * 60);
      const pEnd = 20 + Math.floor((currentStep / totalYears) * 60);

      let response = await staticCache.match(fileUrl);

      if (!response) {
        try {
          response = await this.fetchWithProgress(fileUrl, pStart, pEnd, fileName);
          await staticCache.put(fileUrl, response.clone());
        } catch (fetchErr) {
          console.warn(`Could not download ${fileName}:`, fetchErr);
        }
      } else {
        this.setLoaderProgress(`Loaded ${fileName} from CacheStorage`, pEnd, 'Using permanent offline cache');
      }

      if (response) {
        const buffer = new Uint8Array(await response.arrayBuffer());
        await this.db.registerFileBuffer(fileName, buffer);
        registeredFiles.push(`'${fileName}'`);
      }
    }

    // 2. Load Active Current Year (2026) with Daily Check
    currentStep++;
    const activeFileName = `${this.currentYear}.parquet`;
    const activeFileUrl = `${this.baseUrl}/${activeFileName}`;
    const todayStr = new Date().toISOString().split('T')[0];
    const lastFetchDate = localStorage.getItem('ami_active_year_fetch_date');

    let activeResponse = await activeCache.match(activeFileUrl);

    if (!activeResponse || lastFetchDate !== todayStr) {
      try {
        activeResponse = await this.fetchWithProgress(activeFileUrl, 80, 90, activeFileName);
        await activeCache.put(activeFileUrl, activeResponse.clone());
        localStorage.setItem('ami_active_year_fetch_date', todayStr);
      } catch (err) {
        console.warn(`Fallback to active cache for ${activeFileName}:`, err);
      }
    } else {
      this.setLoaderProgress(`Loaded ${activeFileName} from CacheStorage`, 90, 'Active year updated today');
    }

    if (activeResponse) {
      const buffer = new Uint8Array(await activeResponse.arrayBuffer());
      await this.db.registerFileBuffer(activeFileName, buffer);
      registeredFiles.push(`'${activeFileName}'`);
    }

    // Register unified DuckDB SQL View
    if (registeredFiles.length > 0) {
      this.setLoaderProgress('Building DuckDB SQL Database View...', 95, 'Mapping all year partitions...');
      const createViewQuery = `
        CREATE VIEW all_stocks AS 
        SELECT * FROM read_parquet([${registeredFiles.join(', ')}]);
      `;
      await this.conn.query(createViewQuery);
    } else {
      throw new Error('No Parquet files could be loaded from R2 or local cache.');
    }
  }

  /**
   * Auto-extract all unique ticker symbols from DuckDB dataset
   */
  async indexSymbols() {
    this.setLoaderProgress('Indexing Ticker Universe...', 98, 'Extracting symbol universe...');
    
    try {
      const res = await this.conn.query(`
        SELECT DISTINCT Ticker FROM all_stocks WHERE Ticker IS NOT NULL ORDER BY Ticker ASC;
      `);
      
      const rows = res.toArray().map(r => r.toJSON());
      this.allSymbols = rows.map(r => String(r.Ticker).trim().toUpperCase()).filter(Boolean);

      if (this.allSymbols.length > 0) {
        this.selectedSymbol = this.allSymbols[0]; // Auto-select first symbol (e.g. RELIANCE)
      }
    } catch (err) {
      console.error('Symbol indexing error:', err);
      this.allSymbols = [];
    }
  }

  /**
   * Setup UI events for Search Combobox
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

  /**
   * Change current active symbol
   */
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
   * Query OHLCV data for symbol
   */
  async getOHLCV(symbol, timeframe = '1D') {
    if (!this.isInitialized || !this.conn) return [];

    const targetSymbol = (symbol || this.selectedSymbol).toUpperCase();

    try {
      let query = `
        SELECT Date, Open, High, Low, Close, Volume 
        FROM all_stocks 
        WHERE Ticker = '${targetSymbol}' 
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
          WHERE Ticker = '${targetSymbol}'
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
          WHERE Ticker = '${targetSymbol}'
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

  /**
   * Update Progress Loader UI
   */
  setLoaderProgress(msg, percent, subText) {
    const msgEl = document.getElementById('loaderMessage');
    const subEl = document.getElementById('loaderSubText');
    const barEl = document.getElementById('loaderProgressBar');

    if (msgEl) msgEl.innerText = msg;
    if (subEl) subEl.innerText = subText || '';
    if (barEl) barEl.style.width = `${percent}%`;
  }

  /**
   * Hide Progress Loader UI
   */
  hideLoader() {
    const loader = document.getElementById('loaderOverlay');
    if (loader) {
      loader.classList.add('transition-opacity', 'duration-300', 'opacity-0');
      setTimeout(() => loader.remove(), 300);
    }
  }

  /**
   * Update top status indicator
   */
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