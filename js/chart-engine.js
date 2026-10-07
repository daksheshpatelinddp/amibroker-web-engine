// js/chart-engine.js

export class ChartEngine {
  constructor(containerId) {
    this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!this.container) {
      console.error(`ChartEngine: Container element '${containerId}' not found.`);
      return;
    }

    this.chart = null;
    this.candlestickSeries = null;
    this.indicatorSeriesMap = new Map();
    this.resizeObserver = null;

    this.initChart();
  }

  initChart() {
    // Measure current container dimensions with fallback defaults
    const width = this.container.clientWidth || this.container.parentElement?.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || this.container.parentElement?.clientHeight || 400;

    // Create TradingView Lightweight Chart instance
    this.chart = LightweightCharts.createChart(this.container, {
      width: width,
      height: height,
      layout: {
        background: { type: 'solid', color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
        visible: true,
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add Candlestick Series
    this.candlestickSeries = this.chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Setup auto-resizing observer
    this.setupResizeObserver();

    // Trigger immediate delayed resize to handle mobile modal/drawer rendering passes
    requestAnimationFrame(() => this.resize());
    setTimeout(() => this.resize(), 100);
  }

  setupResizeObserver() {
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0 && this.chart) {
            this.chart.resize(width, height);
          }
        }
      });
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', () => this.resize());
    }
  }

  resize() {
    if (!this.container || !this.chart) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || 400;
    if (width > 0 && height > 0) {
      this.chart.resize(width, height);
    }
  }

  setCandleData(data) {
    if (!this.candlestickSeries || !Array.isArray(data)) return;
    
    // Format and sort data chronologically for TradingView Lightweight Charts
    const formattedData = data.map(item => ({
      time: item.time, // Expects 'YYYY-MM-DD' or UNIX timestamp in seconds
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
    })).sort((a, b) => (a.time > b.time ? 1 : -1));

    this.candlestickSeries.setData(formattedData);
    this.chart.timeScale().fitContent();
    this.resize();
  }

  clearIndicators() {
    this.indicatorSeriesMap.forEach((series) => {
      try {
        this.chart.removeSeries(series);
      } catch (e) {
        console.warn('Error removing indicator series:', e);
      }
    });
    this.indicatorSeriesMap.clear();
  }

  plotIndicator(id, data, options = {}) {
    if (!this.chart || !Array.isArray(data)) return;

    // Remove old plot instance with the same ID if existing
    if (this.indicatorSeriesMap.has(id)) {
      this.chart.removeSeries(this.indicatorSeriesMap.get(id));
      this.indicatorSeriesMap.delete(id);
    }

    const defaultOptions = {
      color: '#2196F3',
      lineWidth: 2,
      priceLineVisible: false,
      ...options,
    };

    const lineSeries = this.chart.addLineSeries(defaultOptions);
    const formattedData = data.map(item => ({
      time: item.time,
      value: Number(item.value),
    })).sort((a, b) => (a.time > b.time ? 1 : -1));

    lineSeries.setData(formattedData);
    this.indicatorSeriesMap.set(id, lineSeries);
  }
}