class CategoryManager {
    constructor() {
        this.currentDatabase = "NSE";
        this.activeCategoryType = "all"; // 'all', 'groups', 'sectors', 'watchlists'
        this.activeSubFilter = "ALL";

        // Category Store Schema
        this.categories = {
            groups: ["Nifty 50", "Nifty Next 50", "Nifty Bank", "Nifty IT"],
            sectors: ["Financial Services", "Information Technology", "Energy", "Automobile"],
            industries: ["Private Sector Bank", "IT Consulting", "Refineries", "Passenger Cars"],
            watchlists: ["Favorites", "Breakout Stocks", "Core Portfolio"]
        };

        // Symbol Category Database Engine
        this.symbolDatabase = {
            "HDFCBANK": {
                symbol: "HDFCBANK.NS",
                name: "HDFC Bank Ltd.",
                market: "NSE",
                groups: ["Nifty 50", "Nifty Bank"],
                sector: "Financial Services",
                industry: "Private Sector Bank",
                watchlists: ["Favorites", "Core Portfolio"]
            },
            "RELIANCE": {
                symbol: "RELIANCE.NS",
                name: "Reliance Industries Ltd.",
                market: "NSE",
                groups: ["Nifty 50"],
                sector: "Energy",
                industry: "Refineries",
                watchlists: ["Core Portfolio"]
            },
            "TCS": {
                symbol: "TCS.NS",
                name: "Tata Consultancy Services",
                market: "NSE",
                groups: ["Nifty 50", "Nifty IT"],
                sector: "Information Technology",
                industry: "IT Consulting",
                watchlists: ["Favorites"]
            },
            "INFY": {
                symbol: "INFY.NS",
                name: "Infosys Ltd.",
                market: "NSE",
                groups: ["Nifty 50", "Nifty IT"],
                sector: "Information Technology",
                industry: "IT Consulting",
                watchlists: ["Breakout Stocks"]
            },
            "ICICIBANK": {
                symbol: "ICICIBANK.NS",
                name: "ICICI Bank Ltd.",
                market: "NSE",
                groups: ["Nifty 50", "Nifty Bank"],
                sector: "Financial Services",
                industry: "Private Sector Bank",
                watchlists: []
            }
        };
    }

    getSymbolsForCurrentFilter() {
        const results = [];
        for (const [key, item] of Object.entries(this.symbolDatabase)) {
            if (item.market !== this.currentDatabase && this.currentDatabase !== "ALL") {
                // Filter by selected database (e.g., NSE vs BSE)
            }

            if (this.activeCategoryType === "all") {
                results.push(item);
            } else if (this.activeCategoryType === "groups") {
                if (this.activeSubFilter === "ALL" || item.groups.includes(this.activeSubFilter)) {
                    results.push(item);
                }
            } else if (this.activeCategoryType === "sectors") {
                if (this.activeSubFilter === "ALL" || item.sector === this.activeSubFilter) {
                    results.push(item);
                }
            } else if (this.activeCategoryType === "watchlists") {
                if (item.watchlists.includes(this.activeSubFilter)) {
                    results.push(item);
                }
            }
        }
        return results;
    }

    addWatchlist(name) {
        if (name && !this.categories.watchlists.includes(name)) {
            this.categories.watchlists.push(name);
            return true;
        }
        return false;
    }

    toggleFavorite(tickerKey) {
        const item = this.symbolDatabase[tickerKey];
        if (!item) return false;

        const favIdx = item.watchlists.indexOf("Favorites");
        if (favIdx > -1) {
            item.watchlists.splice(favIdx, 1);
            return false; // Removed from favorites
        } else {
            item.watchlists.push("Favorites");
            return true; // Added to favorites
        }
    }

    isFavorite(tickerKey) {
        const item = this.symbolDatabase[tickerKey];
        return item ? item.watchlists.includes("Favorites") : false;
    }
}

window.categoryManager = new CategoryManager();