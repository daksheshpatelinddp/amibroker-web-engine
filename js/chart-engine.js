/**
 * AmiBroker Web Workstation - Chart Engine
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

        this.container.style.backgroundColor = '#131722';

        this.chart = LightweightCharts.createChart(this.container, {
            width: this.container.clientWidth || window.innerWidth,
            height: Math.max(this.container.clientHeight, 350),
            layout: {
                background: { type: 'solid', color: '#131722' },
                textColor: '#d1d4dc',
            },
            grid: {
                vertLines: { color: '#1f2937' },
                horzLines: { color: '#1f2937' },
            },
            timeScale: {
                borderColor: '#374151',
                timeVisible: true,
            },
        });

        const resizeObserver = new ResizeObserver(entries => {
            if (!entries || entries.length === 0) return;
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) {
                this.chart.applyOptions({ width, height });
            }
        });
        resizeObserver.observe(this.container);
    }

    renderAFLOutput(aflResult) {
        if (!aflResult || !aflResult.success) return;

        // Clean existing series
        this.seriesMap.forEach(s => {
            try { this.chart.removeSeries(s); } catch(e){}
        });
        this.seriesMap.clear();

        const { plots, time, rawData } = aflResult;

        // 1. Always Render Base Candlesticks
        if (rawData && rawData.length > 0) {
            const candleSeries = this.chart.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350',
            });

            const formattedCandles = rawData.map(d => ({
                time: d.time,
                open: parseFloat(d.open),
                high: parseFloat(d.high),
                low: parseFloat(d.low),
                close: parseFloat(d.close)
            }));

            candleSeries.setData(formattedCandles);
            this.seriesMap.set('main_candles', candleSeries);
        }

        // 2. Render AFL Plot Instructions
        plots.forEach((p, idx) => {
            const style = (p.style || 'line').toLowerCase();

            if (style === 'line' || style === 'dashed') {
                const lineSeries = this.chart.addLineSeries({
                    color: p.color || '#2962FF',
                    lineWidth: 2,
                    title: p.name,
                });

                const lineData = [];
                for (let i = 0; i < time.length; i++) {
                    const val = p.series[i];
                    if (val !== null && val !== undefined && !isNaN(val)) {
                        lineData.push({ time: time[i], value: parseFloat(val) });
                    }
                }

                if (lineData.length > 0) {
                    lineSeries.setData(lineData);
                    this.seriesMap.set(`plot_${idx}`, lineSeries);
                }
            } else if (style === 'histogram') {
                const histSeries = this.chart.addHistogramSeries({
                    color: p.color || '#26a69a',
                    priceScaleId: p.overlay ? '' : 'volume_pane',
                });

                const histData = [];
                for (let i = 0; i < time.length; i++) {
                    const val = p.series[i];
                    if (val !== null && val !== undefined && !isNaN(val)) {
                        histData.push({ time: time[i], value: parseFloat(val) });
                    }
                }

                if (histData.length > 0) {
                    histSeries.setData(histData);
                    this.seriesMap.set(`plot_${idx}`, histSeries);
                }
            }
        });

        this.chart.timeScale().fitContent();
    }
}

window.chartEngine = new ChartEngine('main-chart');