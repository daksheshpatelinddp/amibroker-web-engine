class ChartEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.chart = null;
        this.candleSeries = null;
        this.volumeSeries = null;
        this.isInitialized = false;
    }

    init() {
        if (!this.container || this.isInitialized) return;

        // Create Lightweight Chart instance
        this.chart = LightweightCharts.createChart(this.container, {
            width: this.container.clientWidth || 800,
            height: this.container.clientHeight || 500,
            layout: {
                background: { color: '#12151e' },
                textColor: '#d1d4dc',
            },
            grid: {
                vertLines: { color: '#1f2434' },
                horzLines: { color: '#1f2434' },
            },
            timeScale: {
                borderColor: '#2e354f',
                timeVisible: true,
            },
        });

        // Candlestick Series
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#089981',
            downColor: '#f23645',
            borderVisible: false,
            wickUpColor: '#089981',
            wickDownColor: '#f23645',
        });

        // Load dummy historical dataset to establish baseline view
        this.loadSampleData();

        // Handle Window Resize
        window.addEventListener('resize', () => this.resize());
        this.isInitialized = true;
    }

    resize() {
        if (this.chart && this.container) {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            if (width > 0 && height > 0) {
                this.chart.applyOptions({ width, height });
            }
        }
    }

    loadSampleData() {
        const sampleData = [
            { time: '2026-01-02', open: 2400.0, high: 2425.0, low: 2390.0, close: 2415.5 },
            { time: '2026-01-05', open: 2415.5, high: 2440.0, low: 2410.0, close: 2435.0 },
            { time: '2026-01-06', open: 2435.0, high: 2450.0, low: 2420.0, close: 2428.0 },
            { time: '2026-01-07', open: 2428.0, high: 2465.0, low: 2425.0, close: 2460.0 },
            { time: '2026-01-08', open: 2460.0, high: 2480.0, low: 2450.0, close: 2472.5 },
        ];
        this.candleSeries.setData(sampleData);
        this.chart.timeScale().fitContent();
    }
}

// Global Instance
window.chartEngine = new ChartEngine('chartContainer');