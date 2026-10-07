/**
 * AmiBroker Web Workstation - Data Engine
 */

class DataEngine {
    constructor() {
        this.r2BaseUrl = "https://your-r2-bucket-url.r2.dev";
    }

    cleanSymbolKey(symbol) {
        if (!symbol) return "RELIANCE";
        return symbol.toUpperCase().replace(/\.(NS|BO)$/i, "").trim();
    }

    async fetchHistoricalData(symbol) {
        const cleanKey = this.cleanSymbolKey(symbol);
        
        // Attempt R2 Fetch if valid URL configured
        if (this.r2BaseUrl && !this.r2BaseUrl.includes("your-r2-bucket")) {
            try {
                const response = await fetch(`${this.r2BaseUrl}/${cleanKey}.json`);
                if (response.ok) {
                    const json = await response.json();
                    if (Array.isArray(json) && json.length > 0) return json;
                }
            } catch (err) {
                console.warn("[DataEngine] R2 fetch unreachable, utilizing instant generator:", err);
            }
        }

        // Guaranteed Synchronous Local Dataset Output
        return this.generateFallbackData(cleanKey);
    }

    generateFallbackData(symbol) {
        let data = [];
        let baseTime = new Date(2025, 0, 1).getTime() / 1000;
        let price = 1000 + (symbol.length * 45);

        for (let i = 0; i < 220; i++) {
            let change = (Math.random() - 0.48) * (price * 0.025);
            let open = price;
            let close = price + change;
            let high = Math.max(open, close) + Math.random() * (price * 0.008);
            let low = Math.min(open, close) - Math.random() * (price * 0.008);
            let volume = Math.floor(Math.random() * 120000) + 25000;

            let timeString = new Date((baseTime + i * 86400) * 1000).toISOString().split('T')[0];

            data.push({ time: timeString, open, high, low, close, volume });
            price = close;
        }
        return data;
    }
}

window.dataEngine = new DataEngine();