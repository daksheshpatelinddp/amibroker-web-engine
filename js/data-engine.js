/**
 * js/data-engine.js
 * AmiBroker Web Workstation - DuckDB-WASM & Tiered Parquet Data Engine
 * Includes static caching for archived years & daily EOD revalidation for current year.
 */

import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

class DataEngine {
  constructor() {
    this.db = null;
    this.conn = null;
    this.isInitialized = false;
    this.baseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
    
    // Define year range (Past archived years are cached permanently)
    this.archivedYears = [2023, 2024, 2025];
    this.currentYear = 2026;
    
    this.allSymbols = [];
    this.selectedSymbol = 'RELIANCE';
    this.onSymbolChangeCallback = null;
  }

  /**
   * Initialize DuckDB-WASM instance & load Parquet dataset
   */
  async init() {
    try {
      this.updateStatus('Initializing DuckDB...', 'amber');

      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      );

      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);

      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(worker_url);

      this.conn = await this.db.connect();

      // Load files with smart caching strategy
      await this.loadParquetFiles();

      // Extract unique symbol universe
      await this.indexSymbols();

      // Setup UI listeners for search combobox
      this.setupComboboxUI();

      this.isInitialized = true;
      this.updateStatus('Data Engine Ready', 'emerald');
    } catch (error) {
      console.error('DataEngine Initialization Error:', error);
      this.updateStatus('Engine Failed', 'red');
    }
  }

  /**
   * Smart Multi-Year Tiered Caching Strategy:
   * - Archived years (2023-2025): Downloaded ONCE and permanently stored in CacheStorage.
   * - Current year (2026): Checked & updated once daily for EOD data.
   */
  async loadParquetFiles() {
    const staticCache = await caches.open('ami-parquet-static-v1');
    const activeCache = await caches.open('ami-parquet-active-v1');

    const registeredFiles = [];

    // 1. Process Permanent Archived Years (2023 .. 2025)
    for (const year of this.archivedYears) {
      const fileName = `${year}.parquet`;
      const fileUrl = `${this.baseUrl}/${fileName}`;
      
      let response = await staticCache.match(fileUrl);
      if (!response) {
        this.updateStatus(`Caching ${fileName}...`, 'amber');
        response = await fetch(fileUrl);
        if (response.ok) {
          await staticCache.put(fileUrl, response.clone());
        }
      }

      if (response && response.ok) {
        const buffer = new Uint8Array(await response.arrayBuffer());
        await this.db.registerFileBuffer(fileName, buffer);
        registeredFiles.push(`'${fileName}'`);
      }
    }

    // 2. Process Active Current Year (2026) with Daily Cache Check
    const activeFileName = `${this.currentYear}.parquet`;
    const activeFileUrl = `${this.baseUrl}/${activeFileName}`;
    const todayStr = new Date().toISOString().split('T')[0];
    const lastFetchDate = localStorage.getItem('ami_active_year_fetch_date');

    let activeResponse = await activeCache.match(activeFileUrl);

    // Revalidate once a day or if missing from cache
    if (!activeResponse || lastFetchDate !== todayStr) {
      this.updateStatus(`Updating ${activeFileName}...`, 'amber');
      try {
        const networkResponse = await fetch(activeFileUrl);
        if (networkResponse.ok) {
          await activeCache.put(activeFileUrl, networkResponse.clone());
          localStorage.setItem('ami_active_year_fetch_date', todayStr);
          activeResponse = networkResponse;
        }
      } catch (err) {
        console.warn(`Could not update ${activeFileName} from network, falling back to cache if present.`, err);
      }
    }

    if (activeResponse && activeResponse.ok) {
      const buffer = new Uint8Array(await activeResponse.arrayBuffer());
      await this.db.registerFileBuffer(activeFileName, buffer);
      registeredFiles.push(`'${activeFileName}'`);
    }

    // Create unified view across all year files
    if (registeredFiles.length > 0) {
      const createViewQuery = `
        CREATE VIEW all_stocks AS 
        SELECT * FROM read_parquet([${registeredFiles.join(', ')}]);
      `;
      await this.conn.query(createViewQuery);
    } else {
      throw new Error('No Parquet files could be loaded from R2 or cache.');
    }
  }

  /**
   * Extract unique symbols from dataset to populate search index
   */
  async indexSymbols() {
    try {
      const res = await this.conn.query(`
        SELECT DISTINCT Ticker FROM all_stocks ORDER BY Ticker ASC;
      `);
      
      const rows = res.toArray().map(r => r.toJSON());
      this.allSymbols = rows.map(r => String(r.Ticker).trim().toUpperCase());
      
      if (this.allSymbols.length > 0 && !this.allSymbols.includes(this.selectedSymbol)) {
        this.selectedSymbol = this.allSymbols[0];
      }
    } catch (err) {
      console.warn('Could not index symbols from all_stocks view:', err);
      this.allSymbols = ['RELIANCE', 'TCS', 'INFY'];
    }
  }

  /**
   * Setup UI events for searchable combobox dropdown
   */
  setupComboboxUI() {
    const searchInput = document.getElementById('symbolSearchInput');
    const dropdown = document.getElementById('symbolDropdown');

    if (!searchInput || !dropdown) return;

    searchInput.value = this.selectedSymbol;

    const renderDropdownItems = (filterText = '') => {
      const query = filterText.trim().toUpperCase();
      const filtered = query 
        ? this.allSymbols.filter(s => s.includes(query)).slice(0, 50)
        : this.allSymbols.slice(0, 50);

      if (filtered.length === 0) {
        dropdown.innerHTML = `<div class="px-3 py-2 text-slate-500 italic">No symbols found</div>`;
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
   * Set currently selected symbol and notify listeners
   */
  setSymbol(symbol) {
    this.selectedSymbol = symbol.toUpperCase();
    const searchInput = document.getElementById('symbolSearchInput');
    if (searchInput) searchInput.value = this.selectedSymbol;

    if (typeof this.onSymbolChangeCallback === 'function') {
      this.onSymbolChangeCallback(this.selectedSymbol);
    }
  }

  /**
   * Query OHLCV data for selected symbol and timeframe
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
   * Status UI helper
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