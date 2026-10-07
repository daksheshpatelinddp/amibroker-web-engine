// js/chart-engine.js

export class ChartPane {
  constructor(paneId, containerElement, options = {}) {
    this.paneId = paneId; // e.g. "sheet1_pane_price"
    this.container = containerElement;
    this.chart = null;
    this.seriesMap = new Map(); // Maps studyId -> series instance
    this.options = options;

    this.init();
  }

  init() {
    const width = this.container.clientWidth || this.container.parentElement?.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || 300;

    this.chart = LightweightCharts.createChart(this.container, {
      width: width,
      height: height,
      layout: {
        background: { type: 'solid', color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.4)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.4)' },
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

  // Primary Candlestick Plotting
  setCandlestickData(studyId, data) {
    let series = this.seriesMap.get(studyId);
    if (!series) {
      series = this.chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });
      this.seriesMap.set(studyId, series);
    }

    const formatted = data.map(d => ({
      time: d.time,
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
    })).sort((a, b) => (a.time > b.time ? 1 : -1));

    series.setData(formatted);
    this.chart.timeScale().fitContent();
    this.resize();
  }

  // Indicator Line Plotting
  plotLineStudy(studyId, data, options = {}) {
    let series = this.seriesMap.get(studyId);
    if (!series) {
      series = this.chart.addLineSeries({
        color: options.color || '#2196F3',
        lineWidth: options.lineWidth || 2,
        title: options.title || studyId,
        priceLineVisible: false,
      });
      this.seriesMap.set(studyId, series);
    }

    const formatted = data.map(d => ({
      time: d.time,
      value: Number(d.value),
    })).sort((a, b) => (a.time > b.time ? 1 : -1));

    series.setData(formatted);
  }

  // Histogram (Volume / MACD) Plotting
  plotHistogramStudy(studyId, data, options = {}) {
    let series = this.seriesMap.get(studyId);
    if (!series) {
      series = this.chart.addHistogramSeries({
        color: options.color || '#26a69a',
        priceFormat: options.priceFormat || { type: 'volume' },
        priceScaleId: options.priceScaleId || '',
      });
      this.seriesMap.set(studyId, series);
    }

    const formatted = data.map(d => ({
      time: d.time,
      value: Number(d.value),
      color: d.color || options.color || '#26a69a',
    })).sort((a, b) => (a.time > b.time ? 1 : -1));

    series.setData(formatted);
  }

  clearStudies() {
    this.seriesMap.forEach((series) => {
      try {
        this.chart.removeSeries(series);
      } catch (e) {
        console.warn('Series cleanup error:', e);
      }
    });
    this.seriesMap.clear();
  }
}

/**
 * Orchestrates multi-pane synchronization within a sheet
 */
export class SheetWorkstation {
  constructor(sheetId, containerElement) {
    this.sheetId = sheetId;
    this.container = containerElement;
    this.panes = new Map(); // paneId -> ChartPane
    this.isSyncing = false;
  }

  addPane(paneId, heightPx = 300) {
    const paneWrapper = document.createElement('div');
    paneWrapper.id = `pane_wrapper_${paneId}`;
    paneWrapper.className = 'chart-pane-wrapper';
    paneWrapper.style.height = `${heightPx}px`;
    paneWrapper.style.position = 'relative';
    paneWrapper.style.width = '100%';
    paneWrapper.style.marginBottom = '4px';

    this.container.appendChild(paneWrapper);

    const pane = new ChartPane(paneId, paneWrapper);
    this.panes.set(paneId, pane);

    this.synchronizePanes();
    return pane;
  }

  removePane(paneId) {
    const pane = this.panes.get(paneId);
    if (pane) {
      pane.clearStudies();
      const elem = document.getElementById(`pane_wrapper_${paneId}`);
      if (elem) elem.remove();
      this.panes.delete(paneId);
    }
  }

  // Crosshair and TimeScale Sync across stacked panes
  synchronizePanes() {
    const paneList = Array.from(this.panes.values());
    if (paneList.length <= 1) return;

    paneList.forEach(masterPane => {
      // Sync TimeScale logical ranges
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

      // Sync Crosshairs
      masterPane.chart.subscribeCrosshairMove(param => {
        if (this.isSyncing) return;
        this.isSyncing = true;
        paneList.forEach(slavePane => {
          if (slavePane !== masterPane) {
            if (!param.time || param.point === undefined || param.point.x < 0 || param.point.y < 0) {
              slavePane.chart.clearCrosshairPosition();
            } else {
              slavePane.chart.setCrosshairPosition(0, param.time, slavePane.candlestickSeries || slavePane.seriesMap.values().next().value);
            }
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