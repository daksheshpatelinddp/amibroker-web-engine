/**
 * js/data-engine.js
 * DuckDB-WASM integration for Cloudflare R2 Parquet files.
 * Uses IndexedDB to permanently store historical yearly Parquet buffers (2000 -> previous year),
 * completely eliminating Class B operations on R2 for historical data.
 */

class DataEngine {
    constructor() {
        this.baseUrl = "https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev";
        this.db = null;
        this.conn = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.symbolCache = new Map();
        this.startYear = 2000;
        this.currentYear = new Date().getFullYear();
        this.indexedDBName = 'AmiBrokerParquetCacheDB';
        this.storeName = 'parquet_buffers';
        this.idb = null;
        this.registeredVirtualFiles = new Set();
    }

    /**
     * Open IndexedDB instance for permanent local file storage.
     */
    async initIDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.indexedDBName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (e) => {
                this.idb = e.target.result;
                resolve(this.idb);
            };
            request.onerror = (e) => reject("Failed to open IndexedDB: " + e.target.error);
        });
    }

    /**
     * Retrieve a cached Parquet ArrayBuffer from IndexedDB.
     */
    async getCachedFile(year) {
        if (!this.idb) await this.initIDB();
        return new Promise((resolve) => {
            const tx = this.idb.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(year);
            req.onsuccess = () => resolve(req.result || null);
            req