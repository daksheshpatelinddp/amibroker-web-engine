// js/chart-engine.js

class ChartEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.chart = null;
        this.candlestickSeries = null;
        this.volumeSeries = null;
        this.smaSeries = null;
        this.emaSeries = null;
        
        this.initChart();
        this.handleResize();
    }

    initChart() {
        if (!this.container) return;

        this.chart = LightweightCharts.createChart(this.container, {
            width: this.container.clientWidth || 800,
            height: this.container.clientHeight || 400,
            layout: {
                backgroundColor: '#131722',
                textColor: '#d1d4dc',
            },
            grid: {
                vertLines: { color: '#1f293d' },
                horzLines: { color: '#1f293d' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#2B2B43',
            },
            timeScale: {
                borderColor: '#2B2B43',
                timeVisible: true,
                secondsVisible: false,
            },
        });

        // 1. Candlestick Main Series
        this.candlestickSeries = this.chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        // 2. Volume Series (Overlay at bottom 20% of chart)
        this.volumeSeries = this.chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
        });

        // 3. Technical Overlay Indicators (20 SMA, 50 EMA)
        this.smaSeries = this.chart.addLineSeries({
            color: '#2962FF',
            lineWidth: 2,
            title: 'SMA 20',
        });

        this.emaSeries = this.chart.addLineSeries({
            color: '#FF6D00',
            lineWidth: 2,
            title: 'EMA 50',
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

    calculateSMA(data, period) {
        const smaData = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) continue;
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
            }
            smaData.push({
                time: data[i].time,
                value: sum / period,
            });
        }
        return smaData;
    }

    calculateEMA(data, period) {
        const emaData = [];
        const k = 2 / (period + 1);
        let prevEma = 0;

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) continue;
            
            if (emaData.length === 0) {
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += data[i - j].close;
                }
                prevEma = sum / period;
                emaData.push({ time: data[i].time, value: prevEma });
            } else {
                const currentEma = (data[i].close * k) + (prevEma * (1 - k));
                emaData.push({ time: data[i].time, value: currentEma });
                prevEma = currentEma;
            }
        }
        return emaData;
    }

    render(data) {
        if (!data || data.length === 0) return;

        // Prepare Candlesticks
        const candleData = data.map(d => ({
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        }));

        // Prepare Volume
        const volumeData = data.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? '#26a69a80' : '#ef535080',
        }));

        // Compute Indicators
        const sma20 = this.calculateSMA(data, 20);
        const ema50 = this.calculateEMA(data, 50);

        // Update Series
        this.candlestickSeries.setData(candleData);
        this.volumeSeries.setData(volumeData);
        this.smaSeries.setData(sma20);
        this.emaSeries.setData(ema50);

        // Auto-fit contents and trigger dimension recalculation
        this.handleResize();
        this.chart.timeScale().fitContent();
    }
}

window.chartEngine = new ChartEngine('chart-container');