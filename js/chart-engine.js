// js/chart-engine.js

export class ChartPane {
  constructor(paneId, containerElement) {
    this.paneId = paneId;
    this.container = containerElement;
    this.chart = null;
    this.candlestickSeries = null;
    this.seriesMap = new Map();

    this.init();
  }

  init() {
    const LWC = window.LightweightCharts || window.lightweightCharts;
    if (!LWC) {
      console.error('LightweightCharts library not loaded!');
      return;
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || 300;

    this.chart = LWC.createChart(this.container, {
      width: width,
      height: height,
      layout: { background: { type: 'solid', color: '#131722' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: 'rgba(42, 46, 57, 0.3)' }, horzLines: { color: 'rgba(42, 46, 57, 0.3)' } },
      crosshair: { mode: LWC.CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(197, 203, 206, 0.8)', visible: true },
      timeScale: { borderColor: 'rgba(197, 203, 206, 0.8)', timeVisible: true, secondsVisible: false },
    });

    this.setupResizeObserver();
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
    }
  }

  resize() {
    if (!this.container || !this.chart) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || 300;
    if (width > 0 && height > 0) {
      this.chart.resize(width, height);
    }
  }

  setCandlestickData(studyId, data) {
    if (!this.candlestickSeries) {
      this.candlestickSeries = this.chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
    }

    const formatted = data.map(d => ({
      time: d.time, open: Number(d.open), high: Number(d.high), low: Number(d.low), close: Number(d.close),
    })).sort((a, b) => (a.time > b.time ? 1 : -1));

    this.candlestickSeries.setData(formatted);
    this.seriesMap.set(studyId, this.candlestickSeries);
    this.chart.timeScale().fitContent();
    this.resize();
  }

  plotLineStudy(studyId, data, options = {}) {
    let series = this.seriesMap.get(studyId);
    if (!series) {
      series = this.chart.addLineSeries({
        color: options.color || '#2196F3', lineWidth: options.lineWidth || 2, title: options.title || '', priceLineVisible: false,
      });
      this.seriesMap.set(studyId, series);
    }

    const formatted = data.map(d => ({ time: d.time, value: Number(d.value) })).sort((a, b) => (a.time > b.time ? 1 : -1));
    series.setData(formatted);
  }

  plotHistogramStudy(studyId, data, options = {}) {
    let series = this.seriesMap.get(studyId);
    if (!series) {
      series = this.chart.addHistogramSeries({
        color: options.color || '#26a69a', priceFormat: { type: 'volume' },
      });
      this.seriesMap.set(studyId, series);
    }

    const formatted = data.map(d => ({
      time: d.time, value: Number(d.value), color: d.color || options.color || '#26a69a',
    })).sort((a, b) => (a.time > b.time ? 1 : -1));

    series.setData(formatted);
  }
}

export class SheetWorkstation {
  constructor(sheetId, containerElement) {
    this.sheetId = sheetId;
    this.container = containerElement;
    this.panes = new Map();
    this.isSyncing = false;
  }

  addPane(paneId, heightPx = 300) {
    const paneWrapper = document.createElement('div');
    paneWrapper.id = `pane_wrapper_${paneId}`;
    paneWrapper.style.height = `${heightPx}px`;
    paneWrapper.style.position = 'relative';
    paneWrapper.style.width = '100%';
    paneWrapper.style.marginBottom = '6px';

    this.container.appendChild(paneWrapper);

    const pane = new ChartPane(paneId, paneWrapper);
    this.panes.set(paneId, pane);
    this.synchronizePanes();
    return pane;
  }

  synchronizePanes() {
    const paneList = Array.from(this.panes.values());
    if (paneList.length <= 1) return;

    paneList.forEach(masterPane => {
      masterPane.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (this.isSyncing || !range) return;
        this.isSyncing = true;
        paneList.forEach(slavePane => {
          if (slavePane !== masterPane) {
            slavePane.chart.timeScale().setVisibleLogicalRange(range);
          }
        });
        this.isSyncing = false;
      });
    });
  }

  resizeAll() {
    requestAnimationFrame(() => {
      this.panes.forEach(pane => pane.resize());
    });
  }
}