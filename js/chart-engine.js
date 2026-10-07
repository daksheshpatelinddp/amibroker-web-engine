// js/chart-engine.js
import { createChart } from 'https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.mjs';

class ChartEngine {
  constructor() {
    this.chart = null;
    this.candlestickSeries = null;
    this.volumeSeries = null;
    this.dynamicPlotSeries = [];
    this.container = null;
  }

  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    const rect = this.container.getBoundingClientRect();

    this.chart = createChart(this.container, {
      width: rect.width || window.innerWidth,
      height: rect.height || (window.innerHeight - 48),
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

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        this.chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(this.container);
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

    this.chart.timeScale().fitContent();
  }

  renderAFLPlots(plots) {
    // Clear dynamic indicator plots
    this.dynamicPlotSeries.forEach(series => {
      try {
        this.chart.removeSeries(series);
      } catch (e) {
        console.warn('Series removal warning:', e);
      }
    });
    this.dynamicPlotSeries = [];

    // Draw AFL lines
    plots.forEach(plot => {
      if (!plot.data || plot.data.length === 0) return;
      if (plot.style === 'candle') return;

      const lineSeries = this.chart.addLineSeries({
        color: plot.color || '#3b82f6',
        lineWidth: 2,
        title: plot.title || 'AFL Indicator',
      });

      lineSeries.setData(plot.data);
      this.dynamicPlotSeries.push(lineSeries);
    });
  }
}

export const chartEngine = new ChartEngine();