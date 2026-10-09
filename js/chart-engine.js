class ChartEngine {
    constructor() {
        this.chart = null;
        this.candlestickSeries = null;
        this.container = null;
        this.resizeObserver = null;
    }

    init() {
        this.container = document.getElementById('main-chart-pane');
        if (!this.container) {
            console.error('Chart container #main-chart-pane not found.');
            return;
        }

        // Clean container before creating instance
        this.container.innerHTML = '';

        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || (window.innerHeight - 80);

        // Initialize TradingView Lightweight Charts v5
        this.chart = LightweightCharts.createChart(this.container, {
            width: width,
            height: height,
            layout: {
                background: { type: 'solid', color: '#020617' },
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: '#1e293b' },
                horzLines: { color: '#1e293b' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#1e293b',
            },
            timeScale: {
                borderColor: '#1e293b',
                timeVisible: true,
                secondsVisible: false,
            },
        });

        // Add Candlestick Series using v5 Series API
        if (typeof this.chart.addSeries === 'function') {
            this.candlestickSeries = this.chart.addSeries(LightweightCharts.CandlestickSeries, {
                upColor: '#22c55e',
                downColor: '#ef4444',
                borderVisible: false,
                wickUpColor: '#22c55e',
                wickDownColor: '#ef4444',
            });
        } else {
            this.candlestickSeries = this.chart.addCandlestickSeries({
                upColor: '#22c55e',
                downColor: '#ef4444',
                borderVisible: false,
                wickUpColor: '#22c55e',
                wickDownColor: '#ef4444',
            });
        }

        this.setupResizeObserver();
    }

    setupResizeObserver() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        this.resizeObserver = new ResizeObserver(entries => {
            if (!entries || entries.length === 0 || !this.chart) return;
            const entry = entries[0];
            const width = Math.floor(entry.contentRect.width);
            const height = Math.floor(entry.contentRect.height);

            if (width > 0 && height > 0) {
                this.chart.applyOptions({ width: width, height: height });
            }
        });

        this.resizeObserver.observe(this.container);
    }

    renderCandlestickData(records) {
        if (!this.chart) {
            this.init();
        }

        if (!records || !Array.isArray(records) || records.length === 0) {
            console.warn('No records provided to renderCandlestickData');
            return;
        }

        // Format and sort price data for Lightweight Charts
        const formattedData = records
            .map(row => {
                let timeVal = row.date;
                if (typeof timeVal === 'string' && timeVal.includes('T')) {
                    timeVal = timeVal.split('T')[0];
                }
                return {
                    time: timeVal,
                    open: Number(row.open),
                    high: Number(row.high),
                    low: Number(row.low),
                    close: Number(row.close)
                };
            })
            .filter(row => row.time && !isNaN(row.open) && !isNaN(row.close))
            .sort((a, b) => new Date(a.time) - new Date(b.time));

        // Deduplicate timestamps
        const uniqueData = [];
        const seenDates = new Set();
        for (const item of formattedData) {
            if (!seenDates.has(item.time)) {
                seenDates.add(item.time);
                uniqueData.push(item);
            }
        }

        if (this.candlestickSeries) {
            this.candlestickSeries.setData(uniqueData);
            this.chart.timeScale().fitContent();
        }
    }
}

export const chartEngine = new ChartEngine();