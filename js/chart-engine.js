/**
 * AmiBroker Web Workstation - Chart Renderer
 * Bridges AFL Engine execution outputs to TradingView Lightweight Charts.
 */

class ChartEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.chart = null;
        this.seriesMap = new Map();
        this.initChart();
    }

    initChart() {
        if (!this.container) return;

        this.chart = LightweightCharts.createChart(this.container, {
            width: this.container.clientWidth,
            height: this.container.clientHeight || 450,
            layout: {
                backgroundColor: '#131722',
                textColor: '#d1d4dc',
            },
            grid: {
                vertLines: { color: '#2B2B43' },
                horzLines: { color: '#2B2B43' },
            },
            timeScale: {
                borderColor: '#485c7b',
                timeVisible: true,
            },
        });

        window.addEventListener('resize', () => {
            this.chart.applyOptions({
                width: this.container.clientWidth,
                height: this.container.clientHeight || 450,
            });
        });
    }

    renderAFLOutput(aflResult) {
        if (!aflResult || !aflResult.success) return;

        // Clear existing series
        this.seriesMap.forEach(s => this.chart.removeSeries(s));
        this.seriesMap.clear();

        const { plots, time, rawData } = aflResult;

        // Default OHLC Candlestick Rendering
        const candleSeries = this.chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });
        candleSeries.setData(rawData);
        this.seriesMap.set('main_candles', candleSeries);

        // Render AFL Plot Outputs
        plots.forEach((p, idx) => {
            if (p.style === 'line') {
                const lineSeries = this.chart.addLineSeries({
                    color: p.color || '#2962FF',
                    lineWidth: 2,
                    title: p.name,
                });

                const formattedData = time.map((t, i) => ({
                    time: t,
                    value: p.series[i]
                })).filter(d => d.value !== null && !isNaN(d.value));

                lineSeries.setData(formattedData);
                this.seriesMap.set(`plot_${idx}`, lineSeries);
            } else if (p.style === 'histogram') {
                const histSeries = this.chart.addHistogramSeries({
                    color: p.color || '#26a69a',
                    priceFormat: { type: 'volume' },
                    priceScaleId: p.overlay ? '' : 'volume_pane',
                });

                const formattedData = time.map((t, i) => ({
                    time: t,
                    value: p.series[i]
                })).filter(d => d.value !== null && !isNaN(d.value));

                histSeries.setData(formattedData);
                this.seriesMap.set(`plot_${idx}`, histSeries);
            }
        });
    }
}

window.chartEngine = new ChartEngine('main-chart');