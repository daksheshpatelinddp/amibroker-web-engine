// js/chart-engine.js
import { createChart } from 'https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.mjs';

class ChartEngine {
  constructor() {
    this.chart = null;
    this.candlestickSeries = null;
    this.volumeSeries = null;
    this.sma20Series = null;
    this.ema50Series = null;
    this.container = null;
  }

  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    // Chart dimensions calculation for mobile
    const rect = this.container.getBoundingClientRect();

    this.chart = createChart(this.container, {
      width: rect.width || window.innerWidth,
      height: rect.height || (window.innerHeight - 240),
      layout: {
        background: { color: '#090d16' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#334155' },
      timeScale: { borderColor: '#334155', timeVisible: true },
    });

    this.candlestickSeries = this.chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    this.volumeSeries = this.chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    this.sma20Series = this.chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      title: 'SMA 20',
    });

    this.ema50Series = this.chart.addLineSeries({
      color: '#f97316',
      lineWidth: 2,
      title: 'EMA 50',
    });

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        this.chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(this.container);
  }

  calculateSMA(data, period) {
    const smaData = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      smaData.push({ time: data[i].time, value: sum / period });
    }
    return smaData;
  }

  calculateEMA(data, period) {
    const emaData = [];
    const k = 2 / (period + 1);
    let prevEma = 0;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        prevEma += data[i].close;
        if (i === period - 2) prevEma /= (period - 1);
        continue;
      }
      if (i === period - 1) {
        prevEma = (prevEma * (period - 1) + data[i].close) / period;
        emaData.push({ time: data[i].time, value: prevEma });
        continue;
      }
      const currentEma = data[i].close * k + prevEma * (1 - k);
      emaData.push({ time: data[i].time, value: currentEma });
      prevEma = currentEma;
    }
    return emaData;
  }

  updateData(data) {
    if (!data || data.length === 0) return;

    this.candlestickSeries.setData(data);

    const volumeData = data.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
    }));
    this.volumeSeries.setData(volumeData);

    this.sma20Series.setData(this.calculateSMA(data, 20));
    this.ema50Series.setData(this.calculateEMA(data, 50));

    this.chart.timeScale().fitContent();
  }
}

export const chartEngine = new ChartEngine();