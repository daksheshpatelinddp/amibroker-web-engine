class AmiCanvasRenderer {
  constructor() {
    this.visibleBars = 80;
    this.endIdx = 0;
    this.crosshairX = -1;

    this.initCanvases();
    this.bindEvents();
    this.generateMockData(200);
  }

  initCanvases() {
    this.canvases = {
      price: document.getElementById('canvas-price'),
      volume: document.getElementById('canvas-volume'),
      indicator: document.getElementById('canvas-indicator')
    };
    this.ctxs = {
      price: this.canvases.price.getContext('2d'),
      volume: this.canvases.volume.getContext('2d'),
      indicator: this.canvases.indicator.getContext('2d')
    };
    this.resize();
  }

  resize() {
    Object.keys(this.canvases).forEach(key => {
      const canvas = this.canvases[key];
      if (!canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      this.ctxs[key].scale(window.devicePixelRatio, window.devicePixelRatio);
    });
    this.render();
  }

  generateMockData(count) {
    const dates = [], open = [], high = [], low = [], close = [], volume = [], rsi = [];
    let p = 2400;
    const now = new Date();

    for (let i = 0; i < count; i++) {
      const d = new Date(now.getTime() - (count - i) * 86400000);
      const o = p + (Math.random() - 0.48) * 20;
      const h = o + Math.random() * 15;
      const l = o - Math.random() * 15;
      const c = l + Math.random() * (h - l);
      const v = Math.floor(Math.random() * 500000) + 100000;

      dates.push(d.toISOString().split('T')[0]);
      open.push(o); high.push(h); low.push(l); close.push(c); volume.push(v);
      rsi.push(30 + Math.random() * 40);
      p = c;
    }

    this.data = { dates, open, high, low, close, volume, rsi };
    this.endIdx = count - 1;
    this.render();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    const container = document.getElementById('chart-workspace');
    if (!container) return;

    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      this.crosshairX = e.clientX - rect.left;
      this.render();
    });

    container.addEventListener('mouseleave', () => {
      this.crosshairX = -1;
      this.render();
    });
  }

  render() {
    if (!this.data || !this.canvases.price) return;

    const startIdx = Math.max(0, this.endIdx - this.visibleBars + 1);
    const count = this.endIdx - startIdx + 1;
    const width = this.canvases.price.parentElement.clientWidth;
    const barWidth = width / count;

    Object.values(this.ctxs).forEach(ctx => ctx.clearRect(0, 0, width, 1000));

    // Render Price Candlesticks
    const pHeight = this.canvases.price.parentElement.clientHeight;
    const pCtx = this.ctxs.price;
    let minP = Infinity, maxP = -Infinity;
    for (let i = startIdx; i <= this.endIdx; i++) {
      if (this.data.low[i] < minP) minP = this.data.low[i];
      if (this.data.high[i] > maxP) maxP = this.data.high[i];
    }
    const pRange = maxP - minP || 1;

    for (let i = startIdx; i <= this.endIdx; i++) {
      const idx = i - startIdx;
      const x = idx * barWidth + barWidth / 2;
      const isUp = this.data.close[i] >= this.data.open[i];

      const yHigh = pHeight - ((this.data.high[i] - minP) / pRange) * (pHeight - 20) - 10;
      const yLow = pHeight - ((this.data.low[i] - minP) / pRange) * (pHeight - 20) - 10;
      const yOpen = pHeight - ((this.data.open[i] - minP) / pRange) * (pHeight - 20) - 10;
      const yClose = pHeight - ((this.data.close[i] - minP) / pRange) * (pHeight - 20) - 10;

      pCtx.strokeStyle = isUp ? '#00c853' : '#ff3d00';
      pCtx.beginPath();
      pCtx.moveTo(x, yHigh);
      pCtx.lineTo(x, yLow);
      pCtx.stroke();

      pCtx.fillStyle = isUp ? '#00c853' : '#ff3d00';
      const bodyY = Math.min(yOpen, yClose);
      const bodyH = Math.max(1, Math.abs(yClose - yOpen));
      pCtx.fillRect(x - barWidth * 0.35, bodyY, barWidth * 0.7, bodyH);
    }

    // Render Volume
    const vHeight = this.canvases.volume.parentElement.clientHeight;
    const vCtx = this.ctxs.volume;
    let maxV = 0;
    for (let i = startIdx; i <= this.endIdx; i++) {
      if (this.data.volume[i] > maxV) maxV = this.data.volume[i];
    }

    for (let i = startIdx; i <= this.endIdx; i++) {
      const idx = i - startIdx;
      const x = idx * barWidth + barWidth / 2;
      const vH = (this.data.volume[i] / maxV) * (vHeight - 10);
      const isUp = this.data.close[i] >= this.data.open[i];
      vCtx.fillStyle = isUp ? 'rgba(0, 200, 83, 0.4)' : 'rgba(255, 61, 0, 0.4)';
      vCtx.fillRect(x - barWidth * 0.35, vHeight - vH, barWidth * 0.7, vH);
    }

    // Render RSI Indicator Line
    const rHeight = this.canvases.indicator.parentElement.clientHeight;
    const rCtx = this.ctxs.indicator;
    rCtx.strokeStyle = '#007acc';
    rCtx.lineWidth = 1.5;
    rCtx.beginPath();

    for (let i = startIdx; i <= this.endIdx; i++) {
      const idx = i - startIdx;
      const x = idx * barWidth + barWidth / 2;
      const yRsi = rHeight - (this.data.rsi[i] / 100) * (rHeight - 10) - 5;
      if (i === startIdx) rCtx.moveTo(x, yRsi);
      else rCtx.lineTo(x, yRsi);
    }
    rCtx.stroke();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.chartRenderer = new AmiCanvasRenderer();
});