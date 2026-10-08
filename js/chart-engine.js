export class ChartEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.candlestickSeries = null;
    this.resizeObserver = null;
  }

  initChart() {
    if (!this.container) return;

    // Clear previous elements
    this.container.innerHTML = "";

    const chartOptions = {
      layout: {
        background: { color: "#020617" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: "#334155",
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
      },
      width: this.container.clientWidth || 800,
      height: this.container.clientHeight || 400,
    };

    if (window.LightweightCharts) {
      this.chart = window.LightweightCharts.createChart(this.container, chartOptions);
      this.candlestickSeries = this.chart.addCandlestickSeries({
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });

      this.setupResizeObserver();
    } else {
      console.error("[ChartEngine] LightweightCharts library not found on window object.");
    }
  }

  setData(data) {
    if (this.candlestickSeries) {
      this.candlestickSeries.setData(data);
    }
  }

  setupResizeObserver() {
    if (this.resizeObserver) this.resizeObserver.disconnect();

    this.resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (this.chart && width > 0 && height > 0) {
        this.chart.applyOptions({ width, height });
      }
    });

    this.resizeObserver.observe(this.container);
  }
}