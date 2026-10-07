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

    // Calculate concrete dimensions
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || (window.innerHeight - 48);

    this.chart = createChart(this.container, {
      width: width,
      height: height,
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

    // Handle mobile orientation / window resizes
    const handleResize = () => {
      if (this.container && this.chart) {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || (window.innerHeight - 48);
        if (w > 0 && h > 0) {
          this.chart.applyOptions({ width: w, height: h });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);
  }

  updateData(data) {
    if (!data || data.length === 0 || !this.candlestickSeries) return;

    // Direct candlestick mapping
    const candleData = data.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    this.candlestickSeries.setData(candleData);

    // Direct volume mapping
    const volumeData = data.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
    }));
    this.volumeSeries.setData(volumeData);

    // Force time scale fit
    this.chart.timeScale().fitContent();
  }

  renderAFLPlots(plots) {
    if (!this.chart) return;

    // Remove existing indicator series
    this.dynamicPlotSeries.forEach(series => {
      try {
        this.chart.removeSeries(series);
      } catch (e) {
        console.warn('Series cleanup warning:', e);
      }
    });
    this.dynamicPlotSeries = [];

    // Add new indicator lines calculated by AFL Engine
    plots.forEach(plot => {
      if (!plot.data || plot.data.length === 0 || plot.style === 'candle') return;

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