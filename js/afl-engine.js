// js/afl-engine.js

class AFLEngine {
  constructor() {
    this.variables = {};
  }

  // Simple moving average calculation on price array
  calculateSMA(prices, period) {
    const result = new Array(prices.length).fill(null);
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += prices[i - j];
      }
      result[i] = sum / period;
    }
    return result;
  }

  // Exponential moving average calculation on price array
  calculateEMA(prices, period) {
    const result = new Array(prices.length).fill(null);
    const k = 2 / (period + 1);
    let prevEma = 0;

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        prevEma += prices[i];
        if (i === period - 2) prevEma /= (period - 1);
        continue;
      }
      if (i === period - 1) {
        prevEma = (prevEma * (period - 1) + prices[i]) / period;
        result[i] = prevEma;
        continue;
      }
      const currentEma = prices[i] * k + prevEma * (1 - k);
      result[i] = currentEma;
      prevEma = currentEma;
    }
    return result;
  }

  // Execute AFL script string against loaded symbol price bars
  execute(code, symbolData) {
    if (!symbolData || symbolData.length === 0) return { plots: [], errors: ['No data loaded'] };

    const dates = symbolData.map(d => d.time);
    const opens = symbolData.map(d => d.open);
    const highs = symbolData.map(d => d.high);
    const lows = symbolData.map(d => d.low);
    const closes = symbolData.map(d => d.close);
    const volumes = symbolData.map(d => d.volume);

    // Context environment available inside AFL expressions
    const env = {
      Open: opens,
      High: highs,
      Low: lows,
      Close: closes,
      Volume: volumes,
      MA: (array, period) => this.calculateSMA(array, period),
      EMA: (array, period) => this.calculateEMA(array, period)
    };

    const plots = [];
    const errors = [];

    // Parse AFL script line by line
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Strip comments
      if (line.startsWith('//') || line === '') continue;
      if (line.endsWith(';')) line = line.slice(0, -1).trim();

      // Check for Plot() function calls
      if (line.startsWith('Plot(')) {
        try {
          const content = line.substring(line.indexOf('(') + 1, line.lastIndexOf(')'));
          const args = content.split(',').map(arg => arg.trim().replace(/^["']|["']$/g, ''));

          const arrayExpr = args[0];
          const title = args[1] || 'Plot';
          const color = args[2] || '#3b82f6';
          const style = args[3] || 'line';

          let dataValues = [];

          if (arrayExpr === 'Close') {
            dataValues = closes;
          } else if (arrayExpr === 'Open') {
            dataValues = opens;
          } else if (arrayExpr === 'High') {
            dataValues = highs;
          } else if (arrayExpr === 'Low') {
            dataValues = lows;
          } else if (arrayExpr === 'Volume') {
            dataValues = volumes;
          } else {
            // Evaluate function call like MA(Close, 20) or EMA(Close, 50)
            const maMatch = arrayExpr.match(/(MA|EMA)\s*\(\s*(Close\vert{}Open\vert{}High\vert{}Low)\s*,\s*(\d+)\s*\)/i);
            if (maMatch) {
              const funcName = maMatch[1].toUpperCase();
              const sourceArray = env[maMatch[2]];
              const period = parseInt(maMatch[3], 10);
              dataValues = env[funcName](sourceArray, period);
            } else {
              dataValues = closes;
            }
          }

          // Format plotted output for TradingView Lightweight Charts
          const seriesData = dates.map((time, idx) => ({
            time: time,
            value: dataValues[idx]
          })).filter(item => item.value !== null && !isNaN(item.value));

          plots.push({
            title: title,
            color: color,
            style: style,
            data: seriesData
          });
        } catch (err) {
          errors.push(`Line ${i + 1}: Error parsing Plot expression - ${err.message}`);
        }
      }
    }

    return { plots, errors };
  }
}

export const aflEngine = new AFLEngine();