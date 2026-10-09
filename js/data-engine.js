import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.4.0/+esm';

class DataEngine {
    constructor() {
        this.baseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
        this.dbName = 'AmiBroker_Parquet_CacheDB';
        this.dbVersion = 1;
        this.storeName = 'parquet_years';
        this.db = null;
        this.memoryCache = new Map();
        this.cachedSymbolList = null;
    }

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

    getTodayDateString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

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
                const rows = [];
                parquetRead({
                    file: arrayBuffer,
                    onRowGroup: (rowGroup) => {
                        if (rowGroup) {
                            rows.push(...rowGroup);
                        }
                    },
                    onComplete: (data) => {
                        const sourceData = (data && data.length > 0) ? data : rows;
                        const records = this.transformParquetData(sourceData);
                        resolve(records);
                    }
                });
            } catch (err) {
                console.error(`Error parsing ${year}.parquet:`, err);
                reject(err);
            }
        });
    }

    transformParquetData(data) {
        if (!data || !Array.isArray(data) || data.length === 0) return [];
        
        return data.map(row => {
            if (Array.isArray(row)) {
                return {
                    symbol: String(row[0] || ''),
                    date: String(row[1] || ''),
                    open: Number(row[2] || 0),
                    high: Number(row[3] || 0),
                    low: Number(row[4] || 0),
                    close: Number(row[5] || 0),
                    volume: Number(row[6] || 0)
                };
            }
            return {
                symbol: String(row.symbol || row.Symbol || row.ticker || row.Ticker || ''),
                date: String(row.date || row.Date || row.time || row.Timestamp || ''),
                open: Number(row.open || row.Open || 0),
                high: Number(row.high || row.High || 0),
                low: Number(row.low || row.Low || 0),
                close: Number(row.close || row.Close || 0),
                volume: Number(row.volume || row.Volume || 0)
            };
        });
    }

    async getYearData(year) {
        const currentYear = new Date().getFullYear();
        const yearInt = parseInt(year, 10);

        if (this.memoryCache.has(yearInt)) {
            return this.memoryCache.get(yearInt);
        }

        let cachedRecords = await this.getCachedYear(yearInt);

        if (yearInt === currentYear) {
            const today = this.getTodayDateString();
            const lastCheckedKey = `eod_last_checked_${yearInt}`;
            const lastChecked = localStorage.getItem(lastCheckedKey);

            if (!cachedRecords || lastChecked !== today) {
                try {
                    console.log(`Revalidating current year (${yearInt}) for date: ${today}`);
                    cachedRecords = await this.fetchAndParseParquet(yearInt);
                    await this.setCachedYear(yearInt, cachedRecords);
                    localStorage.setItem(lastCheckedKey, today);
                } catch (err) {
                    console.warn(`Fallback to local cache for ${yearInt}:`, err);
                    if (!cachedRecords) throw err;
                }
            }
        } else {
            if (!cachedRecords) {
                cachedRecords = await this.fetchAndParseParquet(yearInt);
                await this.setCachedYear(yearInt, cachedRecords);
            }
        }

        this.memoryCache.set(yearInt, cachedRecords);
        return cachedRecords;
    }

    /**
     * Extracts all unique symbols across cached years without full download
     */
    async getAllSymbols() {
        if (this.cachedSymbolList && this.cachedSymbolList.length > 0) {
            return this.cachedSymbolList;
        }

        const symbolSet = new Set();
        const currentYear = new Date().getFullYear();

        // Check the most recent year first to get the active ticker list
        try {
            const latestData = await this.getYearData(currentYear);
            if (latestData && latestData.length > 0) {
                for (let i = 0; i < latestData.length; i++) {
                    if (latestData[i].symbol) {
                        symbolSet.add(latestData[i].symbol.toUpperCase());
                    }
                }
            }
        } catch (e) {
            console.warn('Could not fetch current year for symbol list:', e);
        }

        this.cachedSymbolList = Array.from(symbolSet).sort();
        return this.cachedSymbolList;
    }

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

        combinedRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
        return combinedRecords;
    }
}

export const dataEngine = new DataEngine();