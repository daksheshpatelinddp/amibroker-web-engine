class CategoryManager {
    constructor() {
        this.activeCategoryType = 'groups'; // 'groups', 'sectors', 'industries', 'watchlists', 'favorites'
        this.activeSubFilter = 'ALL';
        
        // Default Symbol Master List
        this.masterSymbols = [
            { symbol: "HDFCBANK.NS", name: "HDFC Bank Ltd.", market: "NSE" },
            { symbol: "RELIANCE.NS", name: "Reliance Industries", market: "NSE" },
            { symbol: "TCS.NS", name: "Tata Consultancy Services", market: "NSE" },
            { symbol: "INFY.NS", name: "Infosys Ltd.", market: "NSE" },
            { symbol: "ICICIBANK.NS", name: "ICICI Bank Ltd.", market: "NSE" },
            { symbol: "SBIN.NS", name: "State Bank of India", market: "NSE" }
        ];

        // Storage Data Model
        this.data = this.loadFromStorage() || {
            groups: { "Banking": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS"] },
            sectors: { "Financial Services": ["HDFCBANK.NS", "ICICIBANK.NS"], "IT": ["TCS.NS", "INFY.NS"] },
            industries: { "Private Banks": ["HDFCBANK.NS", "ICICIBANK.NS"], "Software": ["TCS.NS", "INFY.NS"] },
            watchlists: { "Default Watchlist": ["RELIANCE.NS", "TCS.NS"] },
            favorites: ["HDFCBANK.NS", "RELIANCE.NS"]
        };
    }

    saveToStorage() {
        localStorage.setItem('amibroker_categories', JSON.stringify(this.data));
    }

    loadFromStorage() {
        const saved = localStorage.getItem('amibroker_categories');
        return saved ? JSON.parse(saved) : null;
    }

    getFolderNames(type) {
        if (type === 'favorites') return [];
        return Object.keys(this.data[type] || {});
    }

    createFolder(type, folderName) {
        if (!folderName || type === 'favorites') return false;
        if (!this.data[type][folderName]) {
            this.data[type][folderName] = [];
            this.saveToStorage();
            return true;
        }
        return false;
    }

    addSymbolToFolder(type, folderName, symbolStr) {
        const sym = symbolStr.trim().toUpperCase();
        if (!sym) return false;

        if (type === 'favorites') {
            if (!this.data.favorites.includes(sym)) {
                this.data.favorites.push(sym);
                this.saveToStorage();
            }
            return true;
        }

        if (folderName && this.data[type][folderName]) {
            if (!this.data[type][folderName].includes(sym)) {
                this.data[type][folderName].push(sym);
                this.saveToStorage();
            }
            return true;
        }
        return false;
    }

    removeSymbolFromFolder(type, folderName, sym) {
        if (type === 'favorites') {
            this.data.favorites = this.data.favorites.filter(s => s !== sym);
            this.saveToStorage();
            return;
        }

        if (folderName && this.data[type][folderName]) {
            this.data[type][folderName] = this.data[type][folderName].filter(s => s !== sym);
            this.saveToStorage();
        }
    }

    clearFolder(type, folderName) {
        if (type === 'favorites') {
            this.data.favorites = [];
            this.saveToStorage();
            return;
        }

        if (folderName && this.data[type][folderName]) {
            this.data[type][folderName] = [];
            this.saveToStorage();
        }
    }

    importTxtToFolder(type, folderName, txtContent) {
        const lines = txtContent.split(/\r?\n/);
        lines.forEach(line => {
            const sym = line.trim().toUpperCase();
            if (sym) {
                this.addSymbolToFolder(type, folderName, sym);
            }
        });
    }

    getSymbolsForCurrentFilter() {
        const type = this.activeCategoryType;
        const filter = this.activeSubFilter;

        let symbolList = [];

        if (type === 'favorites') {
            symbolList = this.data.favorites;
        } else if (filter === 'ALL') {
            const allInType = new Set();
            Object.values(this.data[type] || {}).forEach(arr => arr.forEach(s => allInType.add(s)));
            symbolList = Array.from(allInType);
        } else {
            symbolList = this.data[type][filter] || [];
        }

        return symbolList.map(sym => {
            const found = this.masterSymbols.find(m => m.symbol === sym);
            return found || { symbol: sym, name: "Imported Symbol", market: "NSE" };
        });
    }

    toggleFavorite(symbol) {
        if (this.data.favorites.includes(symbol)) {
            this.data.favorites = this.data.favorites.filter(s => s !== symbol);
        } else {
            this.data.favorites.push(symbol);
        }
        this.saveToStorage();
    }

    isFavorite(symbol) {
        return this.data.favorites.includes(symbol);
    }
}

window.categoryManager = new CategoryManager();