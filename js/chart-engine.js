// js/chart-engine.js
class ChartEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.chart = null;
        this.candlestickSeries = null;
        this.volumeSeries = null;
        this.smaSeries = null;
        
        this.initChart();
    }

    initChart() {
        if (!this.container) return;

        this.chart = LightweightCharts.createChart(this.container, {
            width: this.container.clientWidth || 600,
            height: this.container.clientHeight || 400,
            layout: {
                backgroundColor: '#131722',
                textColor: '#d1d4dc',
            },
            grid: {
                vertLines: { color: '#1f293d' },
                horzLines: { color: '#1f293d' },
            },
            timeScale: {
                borderColor: '#2B2B43',
                timeVisible: true,
            },
        });

        this.candlestickSeries = this.chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        this.volumeSeries = this.chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: '',
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        this.smaSeries = this.chart.addLineSeries({
            color: '#2962FF',
            lineWidth: 2,
            title: 'SMA 20',
        });

        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        if (this.chart && this.container) {
            this.chart.applyOptions({
                width: this.container.clientWidth,
                height: this.container.clientHeight,
            });
        }
    }

    calculateSMA(data, period = 20) {
        const sma = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) continue;
            let sum = 0;
            for (let j = 0; j < period; j++) sum += data[i - j].close;
            sma.push({ time: data[i].time, value: sum / period });
        }
        return sma;
    }

    render(data) {
        if (!data || data.length === 0) return;

        const candles = data.map(d => ({
            time: d.time, open: d.open, high: d.high, low: d.low, close: d.close
        }));

        const volumes = data.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? '#26a69a80' : '#ef535080'
        }));

        const sma20 = this.calculateSMA(data, 20);

        this.candlestickSeries.setData(candles);
        this.volumeSeries.setData(volumes);
        this.smaSeries.setData(sma20);

        this.handleResize();
        this.chart.timeScale().fitContent();
    }
}

window.chartEngine = new ChartEngine('chart-container');