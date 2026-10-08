/**
 * js/data-engine.js
 * AmiBroker Web Workstation - Pure JS Parquet Engine via hyparquet & IndexedDB
 */

class DataEngine {
  constructor() {
    this.isInitialized = false;

    this.baseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
    this.parquetFiles = [
      `${this.baseUrl}/2023.parquet`,
      `${this.baseUrl}/2024.parquet`,
      `${this.baseUrl}/2025.parquet`,
      `${this.baseUrl}/2026.parquet`
    ];

    this.cacheVersion = 'v8';
    this.cacheDbName = 'hyparquet-stock-cache';
    this.cacheStore = 'files';
    this.currentYear = new Date().getFullYear();

    this.records = [];
    this.symbolMap = new Map(); // Map<Symbol, Array<Record>>
    this.allSymbols = [];
    this.selectedSymbol = '';
    this.onSymbolChangeCallback = null;

    this.setupGlobalErrorLogging();
  }

  setupGlobalErrorLogging() {
    window.addEventListener('error', (e) => {
      this.showErrorOnScreen(`GLOBAL ERROR: ${e.message} at ${e.filename}:${e.lineno}`);
    });

    window.addEventListener('unhandledrejection', (e) => {
      this.showErrorOnScreen(`PROMISE ERROR: ${e.reason?.message || e.reason}`);
    });
  }

  showErrorOnScreen(errText) {
    console.error(errText);
    const errBox = document.getElementById('errorDisplay');
    if (errBox) {
      errBox.classList.remove('hidden');
      errBox.innerText += `\n[${new Date().toLocaleTimeString()}] ${errText}`;
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
   * Main Initialization Pipeline
   */
  async init() {
    try {
      this.setLoaderProgress('Initializing Engine...', 10, 'Locating hyparquet global reader...');
      this.updateStatus('Loading Data...', 'amber');

      const hyparquet = window.hyparquet;
      if (!hyparquet || typeof hyparquet.parquetRead !== 'function') {
        throw new Error('window.hyparquet script tag failed to load from CDN.');
      }

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

        const progressStart = 10 + Math.floor(((step - 1) / totalFiles) * 70);
        const progressEnd = 10 + Math.floor((step / totalFiles) * 70);

        let buffer = await this.idbGet(cacheKey);

        if (buffer) {
          this.setLoaderProgress(`Parsing ${filename} (cached)...`, progressEnd, 'Using IndexedDB cache');
        } else {
          this.setLoaderProgress(`Downloading ${filename}...`, progressStart, `Fetching remote Parquet bytes...`);
          const resp = await fetch(url);
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} fetching ${filename}`);
          }
          buffer = await resp.arrayBuffer();
          await this.idbPut(cacheKey, buffer);
          this.setLoaderProgress(`Cached ${filename}`, progressEnd, 'Saved to IndexedDB cache');
        }

        // Parse Parquet natively in Pure JS
        await hyparquet.parquetRead({
          file: buffer,
          onRecord: (record) => {
            const rawSymbol = record.Symbol || record.symbol;
            if (!rawSymbol) return;

            const sym = String(rawSymbol).trim().toUpperCase();
            if (!this.symbolMap.has(sym)) {
              this.symbolMap.set(sym, []);
            }

            this.symbolMap.get(sym).push({
              Date: record.Date || record.date,
              Open: Number(record.Open || record.open || 0),
              High: Number(record.High || record.high || 0),
              Low: Number(record.Low || record.low || 0),
              Close: Number(record.Close || record.close || 0),
              Volume: Number(record.Volume || record.volume || 0)
            });
          }
        });
      }

      this.setLoaderProgress('Indexing Symbol Universe...', 90, 'Filtering active tickers...');

      // Filter tickers with at least 50 historical candles
      const validSymbols = [];
      for (const [sym, rows] of this.symbolMap.entries()) {
        if (rows.length >= 50) {
          validSymbols.push(sym);
          rows.sort((a, b) => new Date(a.Date) - new Date(b.Date));
        }
      }

      this.allSymbols = validSymbols.sort();

      if (this.allSymbols.length > 0) {
        const PREFERRED_DEFAULTS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN'];
        let defaultSymbol = this.allSymbols.find(s => PREFERRED_DEFAULTS.includes(s));
        if (!defaultSymbol) {
          defaultSymbol = this.allSymbols[0];
        }
        this.selectedSymbol = defaultSymbol;
      }

      this.setupComboboxUI();

      this.isInitialized = true;
      this.hideLoader();
      this.updateStatus('Data Engine Ready', 'emerald');

      if (this.selectedSymbol && typeof this.onSymbolChangeCallback === 'function') {
        this.onSymbolChangeCallback(this.selectedSymbol);
      }
    } catch (err) {
      this.showErrorOnScreen(`INIT FAIL: ${err.message || err}`);
    }
  }

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

  async getOHLCV(symbol, timeframe = '1D') {
    if (!this.isInitialized) return [];

    const targetSymbol = (symbol || this.selectedSymbol).toUpperCase();
    const rawRows = this.symbolMap.get(targetSymbol) || [];

    if (rawRows.length === 0) return [];

    if (timeframe === '1D') {
      return rawRows.map(r => ({
        time: typeof r.Date === 'string' ? r.Date.split('T')[0] : new Date(r.Date).toISOString().split('T')[0],
        open: r.Open,
        high: r.High,
        low: r.Low,
        close: r.Close,
        volume: r.Volume
      }));
    }

    const aggregated = [];
    let currentGroupKey = null;
    let currentCandle = null;

    for (const r of rawRows) {
      const d = new Date(r.Date);
      let groupKey = '';

      if (timeframe === '1W') {
        const startOfYear = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil((((d - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
        groupKey = `${d.getFullYear()}-W${weekNum}`;
      } else if (timeframe === '1M') {
        groupKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }

      const dateStr = typeof r.Date === 'string' ? r.Date.split('T')[0] : d.toISOString().split('T')[0];

      if (groupKey !== currentGroupKey) {
        if (currentCandle) aggregated.push(currentCandle);
        currentGroupKey = groupKey;
        currentCandle = {
          time: dateStr,
          open: r.Open,
          high: r.High,
          low: r.Low,
          close: r.Close,
          volume: r.Volume
        };
      } else {
        currentCandle.high = Math.max(currentCandle.high, r.High);
        currentCandle.low = Math.min(currentCandle.low, r.Low);
        currentCandle.close = r.Close;
        currentCandle.volume += r.Volume;
      }
    }

    if (currentCandle) aggregated.push(currentCandle);
    return aggregated;
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