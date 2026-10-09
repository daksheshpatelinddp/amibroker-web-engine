import { parquetReadObjects } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.4.0/+esm';

class DataEngine {
    constructor() {
        this.baseUrl = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';
        this.dbName = 'AmiBroker_Parquet_CacheDB';
        this.dbVersion = 1;
        this.storeName = 'parquet_years';
        this.db = null;
        this.memoryCache = new Map();
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

        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        console.log(`Downloaded ${year}.parquet (${(arrayBuffer.byteLength / 1048576).toFixed(2)} MB)`);

        // parquetRead is async: errors reject the returned promise, so we must await it.
        // parquetReadObjects resolves with an array of row objects { colName: value }.
        const rows = await parquetReadObjects({ file: arrayBuffer });
        console.log(`Parsed ${rows.length} rows from ${year}.parquet. Sample:`, rows[0]);
        return this.transformParquetData(rows);
    }

    toDateString(v) {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === 'bigint') v = Number(v);
        if (typeof v === 'number') {
            const ms = v < 1e11 ? v * 1000 : v; // seconds or milliseconds
            return new Date(ms).toISOString().slice(0, 10);
        }
        return String(v ?? '').slice(0, 10);
    }

    transformParquetData(data) {
        if (!Array.isArray(data) || data.length === 0) return [];
        return data.map(row => ({
            symbol: String(row.symbol ?? row.Symbol ?? row.ticker ?? row.Ticker ?? ''),
            date: this.toDateString(row.date ?? row.Date ?? row.time ?? row.Timestamp),
            open: Number(row.open ?? row.Open ?? 0),
            high: Number(row.high ?? row.High ?? 0),
            low: Number(row.low ?? row.Low ?? 0),
            close: Number(row.close ?? row.Close ?? 0),
            volume: Number(row.volume ?? row.Volume ?? 0)
        }));
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

    async getStockData(symbol, startYear = 2023, endYear = new Date().getFullYear()) {
        const strip = (x) => x.toUpperCase().replace(/\.(NS|BO)$/, '');
        const targetSymbol = strip(symbol.trim());
        let combinedRecords = [];

        for (let y = startYear; y <= endYear; y++) {
            try {
                const yearData = await this.getYearData(y);
                const filtered = yearData.filter(row => strip(row.symbol) === targetSymbol);
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