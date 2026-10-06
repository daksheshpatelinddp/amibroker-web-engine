/**
 * AmiBroker Web Workstation - Data Engine
 */
class DataEngine {
    constructor(r2BucketBaseUrl) {
        // Base Cloudflare R2 public URL
        this.baseUrl = r2BucketBaseUrl || "https://your-r2-bucket.r2.dev";
    }

    /**
     * Sanitizes symbol name for R2 file path lookup
     * Example: "RELIANCE.NS" -> "RELIANCE"
     */
    cleanSymbolKey(symbol) {
        if (!symbol) return "";
        return symbol.toUpperCase().replace(/\.(NS|BO)$/i, "").trim();
    }

    /**
     * Fetches Parquet/JSON historical data from Cloudflare R2
     */
    async fetchHistoricalData(symbol) {
        const cleanKey = this.cleanSymbolKey(symbol);
        const fileUrl = `${this.baseUrl}/${cleanKey}.parquet`; // or .json depending on your storage structure

        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to load data for ${cleanKey} (Status: ${response.status})`);
            }
            
            // If returning JSON from R2
            const data = await response.json();
            return data;
        } catch (err) {
            console.warn(`[DataEngine] Could not fetch ${cleanKey} from R2, generating local fallback:`, err);
            return this.generateFallbackData(symbol);
        }
    }

    /**
     * Synthetic data fallback if R2 file is pending
     */
    generateFallbackData(symbol) {
        let data = [];
        let baseTime = new Date(2025, 0, 1).getTime() / 1000;
        let price = 1000 + (symbol.length * 50);

        for (let i = 0; i < 250; i++) {
            let change = (Math.random() - 0.48) * (price * 0.02);
            let open = price;
            let close = price + change;
            let high = Math.max(open, close) + Math.random() * (price * 0.008);
            let low = Math.min(open, close) - Math.random() * (price * 0.008);
            let volume = Math.floor(Math.random() * 100000) + 20000;

            let timeString = new Date((baseTime + i * 86400) * 1000).toISOString().split('T')[0];

            data.push({ time: timeString, open, high, low, close, volume });
            price = close;
        }
        return data;
    }
}

window.dataEngine = new DataEngine();