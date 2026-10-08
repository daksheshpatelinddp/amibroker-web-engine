import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.4.0/+esm';

class DataEngine {
    constructor() {
        this.baseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
        this.dbName = 'AmiBroker_Parquet_CacheDB';
        this.dbVersion = 1;
        this.storeName = 'parquet_years';
        this.db = null;
        this.memoryCache = new Map(); // Fast runtime memory cache
    }

    /**
     * Initialize DataEngine and IndexedDB storage
     */
    async init() {
        if (this.db) return true;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'year' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('IndexedDB initialized successfully.');
                resolve(true);
            };

            request.onerror = (event) => {
                console.error('IndexedDB initialization failed:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Get today's date string in YYYY-MM-DD format
     */
    getTodayDateString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Retrieve cached year data from IndexedDB
     */
    async getCachedYear(year) {
        await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(year);

            request.onsuccess = () => {
                resolve(request.result ? request.result.records : null);
            };
            request.onerror = () => {
                resolve(null);
            };
        });
    }

    /**
     * Save parsed year data to IndexedDB
     */
    async setCachedYear(year, records) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put({ year: year, records: records, timestamp: Date.now() });

            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e);
        });
    }

    /**
     * Download and parse a Parquet file using hyparquet
     */
    async fetchAndParseParquet(year) {
        const url = `${this.baseUrl}/${year}.parquet`;
        console.log(`Fetching Parquet file from R2: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        return new Promise((resolve, reject) => {
            try {
                parquetRead({
                    file: arrayBuffer,
                    onComplete: (data) => {
                        // hyparquet returns data as array of rows or column vectors
                        // Normalize parsed data into standardized JS objects
                        const records = this.transformParquetData(data);
                        resolve(records);
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Transform raw hyparquet output into standard OHLCV JSON structure
     */
    transformParquetData(data) {
        if (!data || data.length === 0) return [];
        
        // If data comes in array-of-arrays or matrix format from hyparquet
        if (Array.isArray(data[0])) {
            return data.map(row => ({
                symbol: String(row[0] || ''),
                date: String(row[1] || ''),
                open: Number(row[2] || 0),
                high: Number(row[3] || 0),
                low: Number(row[4] || 0),
                close: Number(row[5] || 0),
                volume: Number(row[6] || 0)
            }));
        }

        // If data comes as array of objects with standard key names
        return data.map(item => ({
            symbol: String(item.symbol || item.Symbol || item.ticker || ''),
            date: String(item.date || item.Date || item.time || item.timestamp || ''),
            open: Number(item.open || item.Open || 0),
            high: Number(item.high || item.High || 0),
            low: Number(item.low || item.Low || 0),
            close: Number(item.close || item.Close || 0),
            volume: Number(item.volume || item.Volume || 0)
        }));
    }

    /**
     * Load year data with permanent IndexedDB caching and daily current-year check
     */
    async getYearData(year) {
        const currentYear = new Date().getFullYear();
        const yearInt = parseInt(year, 10);

        // Check runtime memory cache first
        if (this.memoryCache.has(yearInt)) {
            return this.memoryCache.get(yearInt);
        }

        // Check IndexedDB
        let cachedRecords = await this.getCachedYear(yearInt);

        if (yearInt === currentYear) {
            const today = this.getTodayDateString();
            const lastCheckedKey = `eod_last_checked_${yearInt}`;
            const lastChecked = localStorage.getItem(lastCheckedKey);

            // Fetch from R2 only if never cached or if it's a new day
            if (!cachedRecords || lastChecked !== today) {
                try {
                    console.log(`Current year (${yearInt}) re-validation triggered for date: ${today}`);
                    cachedRecords = await this.fetchAndParseParquet(yearInt);
                    await this.setCachedYear(yearInt, cachedRecords);
                    localStorage.setItem(lastCheckedKey, today);
                } catch (err) {
                    console.warn(`Failed to fetch latest ${yearInt}.parquet from R2, falling back to local cache if available:`, err);
                    if (!cachedRecords) throw err;
                }
            }
        } else {
            // Historical years: download once and persist indefinitely
            if (!cachedRecords) {
                cachedRecords = await this.fetchAndParseParquet(yearInt);
                await this.setCachedYear(yearInt, cachedRecords);
            }
        }

        this.memoryCache.set(yearInt, cachedRecords);
        return cachedRecords;
    }

    /**
     * Query stock data for specific symbol across a list or range of years
     */
    async getStockData(symbol, startYear = 2023, endYear = new Date().getFullYear()) {
        const targetSymbol = symbol.trim().toUpperCase();
        let combinedRecords = [];

        for (let y = startYear; y <= endYear; y++) {
            try {
                const yearData = await this.getYearData(y);
                const filtered = yearData.filter(row => row.symbol.toUpperCase() === targetSymbol);
                combinedRecords.push(...filtered);
            } catch (e) {
                console.error(`Error loading data for year ${y}:`, e);
            }
        }

        // Sort chronologically by date
        combinedRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
        return combinedRecords;
    }
}

export const dataEngine = new DataEngine();