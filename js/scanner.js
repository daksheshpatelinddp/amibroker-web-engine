// Scanner & Exploration Grid Engine
class ScannerEngine {
  constructor() {
    this.watchlist = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC"];
  }

  // Run exploration scanner across selected watchlist
  async runExploration(rules) {
    const results = [];
    console.log("Starting Market Exploration Scan...");

    for (const symbol of this.watchlist) {
      // 1. Generate or fetch symbol price data
      const data = this.generateSampleData(symbol);
      
      // 2. Compute vectors via AFL Engine
      const fastMA = window.aflEngine.EMA(data.close, 10);
      const slowMA = window.aflEngine.EMA(data.close, 30);
      const rsi = window.aflEngine.RSI(data.close, 14);
      const buyVector = window.aflEngine.Cross(fastMA, slowMA);

      // Check last bar signal match
      const lastIdx = data.close.length - 1;
      const isMatch = buyVector[lastIdx] === 1 || rsi[lastIdx] < 35;

      if (isMatch) {
        results.push({
          symbol: symbol,
          date: data.dates[lastIdx],
          close: data.close[lastIdx].toFixed(2),
          change: (((data.close[lastIdx] - data.close[lastIdx - 1]) / data.close[lastIdx - 1]) * 100).toFixed(2),
          rsi: rsi[lastIdx].toFixed(2),
          signal: buyVector[lastIdx] === 1 ? 'BULLISH CROSS' : 'OVERSOLD'
        });
      }
    }

    return results;
  }

  generateSampleData(symbol) {
    const dates = [], close = [];
    let price = 500 + Math.random() * 1500;
    const now = new Date();

    for (let i = 0; i < 100; i++) {
      const d = new Date(now.getTime() - (100 - i) * 86400000);
      price += (Math.random() - 0.48) * 15;
      dates.push(d.toISOString().split('T')[0]);
      close.push(price);
    }
    return { dates, close: new Float32Array(close) };
  }
}

window.scannerEngine = new ScannerEngine();