class BacktestEngine {
  constructor() {
    this.equityCanvas = document.getElementById('canvas-equity');
    if (this.equityCanvas) {
      this.ctx = this.equityCanvas.getContext('2d');
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    }
  }

  resizeCanvas() {
    if (!this.equityCanvas) return;
    const rect = this.equityCanvas.parentElement.getBoundingClientRect();
    this.equityCanvas.width = rect.width * window.devicePixelRatio;
    this.equityCanvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  generatePriceHistory(count = 250) {
    const data = { open: [], high: [], low: [], close: [], dates: [] };
    let price = 1000;
    const date = new Date('2025-01-01');

    for (let i = 0; i < count; i++) {
      date.setDate(date.getDate() + 1);
      const open = price + (Math.random() - 0.49) * 12;
      const high = open + Math.random() * 10;
      const low = open - Math.random() * 10;
      const close = low + Math.random() * (high - low);
      
      data.dates.push(date.toISOString().split('T')[0]);
      data.open.push(open);
      data.high.push(high);
      data.low.push(low);
      data.close.push(close);
      price = close;
    }
    return data;
  }

  execute(config) {
    const data = this.generatePriceHistory();
    const trades = [];
    const equityCurve = [];
    let capital = config.initialCapital;
    let position = null;

    const calculateEMA = (period) => {
      const k = 2 / (period + 1);
      const ema = [data.close[0]];
      for (let i = 1; i < data.close.length; i++) {
        ema.push(data.close[i] * k + ema[i - 1] * (1 - k));
      }
      return ema;
    };

    const fastEMA = calculateEMA(10);
    const slowEMA = calculateEMA(30);

    for (let i = 1; i < data.close.length; i++) {
      const price = data.close[i];
      const buySignal = fastEMA[i] > slowEMA[i] && fastEMA[i-1] <= slowEMA[i-1];
      const sellSignal = fastEMA[i] < slowEMA[i] && fastEMA[i-1] >= slowEMA[i-1];

      if (position && sellSignal) {
        const exitPrice = price * (1 - config.slippage / 100);
        const pnl = (exitPrice - position.entryPrice) * position.qty;
        capital += position.qty * exitPrice;
        
        trades.push({
          id: trades.length + 1,
          type: 'LONG',
          entryDate: data.dates[position.entryIdx],
          entryPrice: position.entryPrice,
          exitDate: data.dates[i],
          exitPrice: exitPrice,
          bars: i - position.entryIdx,
          pnl: pnl,
          roi: ((exitPrice - position.entryPrice) / position.entryPrice) * 100
        });

        position = null;
      } else if (!position && buySignal) {
        const entryPrice = price * (1 + config.slippage / 100);
        const allocatedCapital = config.posSizeType === 'all' ? capital : capital * 0.1;
        const qty = Math.floor(allocatedCapital / entryPrice);

        if (qty > 0) {
          position = { entryIdx: i, entryPrice, qty };
          capital -= qty * entryPrice;
        }
      }

      const currentEquity = capital + (position ? position.qty * price : 0);
      equityCurve.push(currentEquity);
    }

    return { trades, equityCurve, initialCapital: config.initialCapital };
  }

  renderResults(results) {
    const { trades, equityCurve, initialCapital } = results;
    const finalEquity = equityCurve[equityCurve.length - 1];
    const netReturn = ((finalEquity - initialCapital) / initialCapital) * 100;
    const wins = trades.filter(t => t.pnl > 0);
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    
    let peak = -Infinity, maxDd = 0;
    equityCurve.forEach(eq => {
      if (eq > peak) peak = eq;
      const dd = ((peak - eq) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    });

    const grossProfit = wins.reduce((a, b) => a + b.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((a, b) => a + b.pnl, 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : grossProfit > 0 ? 99.9 : 0;

    document.getElementById('m-return').innerText = `${netReturn >= 0 ? '+' : ''}${netReturn.toFixed(2)}%`;
    document.getElementById('m-return').className = `val ${netReturn >= 0 ? 'win' : 'loss'}`;
    document.getElementById('m-winrate').innerText = `${winRate.toFixed(1)}%`;
    document.getElementById('m-drawdown').innerText = `-${maxDd.toFixed(2)}%`;
    document.getElementById('m-pf').innerText = profitFactor.toFixed(2);
    document.getElementById('m-trades').innerText = trades.length;

    // Draw Equity Line
    if (this.equityCanvas) {
      const w = this.equityCanvas.parentElement.clientWidth;
      const h = this.equityCanvas.parentElement.clientHeight;
      this.ctx.clearRect(0, 0, w, h);

      const minEq = Math.min(...equityCurve);
      const maxEq = Math.max(...equityCurve);
      const range = maxEq - minEq || 1;

      this.ctx.strokeStyle = netReturn >= 0 ? '#00c853' : '#ff3d00';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();

      equityCurve.forEach((eq, i) => {
        const x = (i / (equityCurve.length - 1)) * w;
        const y = h - ((eq - minEq) / range) * (h - 20) - 10;
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      });
      this.ctx.stroke();
    }

    // Trade Table Render
    const tbody = document.getElementById('trade-rows');
    tbody.innerHTML = trades.map(t => `
      <tr>
        <td>${t.id}</td>
        <td style="color:#007acc; font-weight:bold;">${t.type}</td>
        <td>${t.entryDate}</td>
        <td>${t.entryPrice.toFixed(2)}</td>
        <td>${t.exitDate}</td>
        <td>${t.exitPrice.toFixed(2)}</td>
        <td>${t.bars}</td>
        <td class="${t.pnl >= 0 ? 'win' : 'loss'}">${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</td>
        <td class="${t.roi >= 0 ? 'win' : 'loss'}">${t.roi >= 0 ? '+' : ''}${t.roi.toFixed(2)}%</td>
      </tr>
    `).join('');
  }
}

let backtestEngine;
document.addEventListener('DOMContentLoaded', () => {
  backtestEngine = new BacktestEngine();
});

function runBacktest() {
  const config = {
    initialCapital: parseFloat(document.getElementById('init-cap').value),
    posSizeType: document.getElementById('pos-size-type').value,
    strategy: document.getElementById('strat-type').value,
    slippage: parseFloat(document.getElementById('slippage').value)
  };
  const results = backtestEngine.execute(config);
  backtestEngine.renderResults(results);
}