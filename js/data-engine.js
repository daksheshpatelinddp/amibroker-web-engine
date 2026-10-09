import { parquetReadObjects } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.4.0/+esm';

class DataEngine {
    constructor() {
        this.baseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
        this.dbName = 'AmiBroker_Parquet_CacheDB';
        this.dbVersion = 1;
        this.storeName = 'parquet_years';
        this.db = null;
        this.memoryCache = new Map();
        this.availableSymbols = new Set();
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
                const records = request.result ? request.result.records : null;
                if (records) {
                    this.extractSymbols(records);
                }
                resolve(records);
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

    extractSymbols(records) {
        if (!records || !Array.isArray(records)) return;
        for (let i = 0; i < records.length; i++) {
            if (records[i].symbol) {
                const cleanSym = String(records[i].symbol).split('.')[0].toUpperCase();
                this.availableSymbols.add(cleanSym);
            }
        }
    }

    async fetchAndParseParquet(year) {
        const url = `${this.baseUrl}/${year}.parquet`;
        console.log(`Fetching Parquet file from R2: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        try {
            // Using parquetReadObjects which is stable in hyparquet 1.4.0
            const rawObjects = await parquetReadObjects({ file: arrayBuffer });
            const records = this.transformParquetData(rawObjects);
            this.extractSymbols(records);
            return records;
        } catch (err) {
            console.error(`Error parsing ${year}.parquet:`, err);
            throw err;
        }
    }

    transformParquetData(data) {
        if (!data || !Array.isArray(data) || data.length === 0) return [];
        
        return data.map(row => {
            // Normalize Date string YYYY-MM-DD
            let dateStr = row.date || row.Date || row.time || row.Timestamp || '';
            if (dateStr instanceof Date) {
                dateStr = dateStr.toISOString().split('T')[0];
            } else {
                dateStr = String(dateStr).split('T')[0];
            }

            return {
                symbol: String(row.symbol || row.Symbol || row.ticker || row.Ticker || ''),
                date: dateStr,
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
            const cached = this.memoryCache.get(yearInt);
            this.extractSymbols(cached);
            return cached;
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
        this.extractSymbols(cachedRecords);
        return cachedRecords;
    }

    async getStockData(symbol, startYear = 2023, endYear = new Date().getFullYear()) {
        const targetSymbol = symbol.trim().toUpperCase();
        let combinedRecords = [];

        for (let y = startYear; y <= endYear; y++) {
            try {
                const yearData = await this.getYearData(y);
                const filtered = yearData.filter(row => {
                    const sym = String(row.symbol).toUpperCase();
                    return sym === targetSymbol || sym === `${targetSymbol}.NS` || sym === `${targetSymbol}.BO`;
                });
                combinedRecords.push(...filtered);
            } catch (e) {
                console.error(`Error loading data for year ${y}:`, e);
            }
        }

        // Deduplicate and sort chronologically
        const seenDates = new Set();
        const uniqueRecords = [];

        for (const row of combinedRecords) {
            if (row.date && !seenDates.has(row.date)) {
                seenDates.add(row.date);
                uniqueRecords.push(row);
            }
        }

        uniqueRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
        return uniqueRecords;
    }

    getSymbolList() {
        return Array.from(this.availableSymbols).sort();
    }
}

export const dataEngine = new DataEngine();