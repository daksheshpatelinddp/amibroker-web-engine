// js/chart-engine.js
import { createChart } from 'https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.mjs';

class ChartEngine {
  constructor() {
    this.chart = null;
    this.candlestickSeries = null;
    this.volumeSeries = null;
    this.sma20Series = null;
    this.ema50Series = null;
    this.container = null;
  }

  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.chart = createChart(this.container, {
      width: this.container.clientWidth,
      height: this.container.clientHeight || 450,
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#2B2B43' },
      timeScale: { borderColor: '#2B2B43', timeVisible: true },
    });

    // Add Candlestick Series
    this.candlestickSeries = this.chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Add Volume Histogram Series
    this.volumeSeries = this.chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Add 20 SMA Line
    this.sma20Series = this.chart.addLineSeries({
      color: '#2962FF',
      lineWidth: 2,
      title: 'SMA 20',
    });

    // Add 50 EMA Line
    this.ema50Series = this.chart.addLineSeries({
      color: '#FF6D00',
      lineWidth: 2,
      title: 'EMA 50',
    });

    window.addEventListener('resize', () => {
      if (this.container && this.chart) {
        this.chart.applyOptions({
          width: this.container.clientWidth,
          height: this.container.clientHeight,
        });
      }
    });
  }

  calculateSMA(data, period) {
    const smaData = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      smaData.push({ time: data[i].time, value: sum / period });
    }
    return smaData;
  }

  calculateEMA(data, period) {
    const emaData = [];
    const k = 2 / (period + 1);
    let prevEma = 0;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        prevEma += data[i].close;
        if (i === period - 2) prevEma /= period - 1;
        continue;
      }
      if (i === period - 1) {
        prevEma = (prevEma * (period - 1) + data[i].close) / period;
        emaData.push({ time: data[i].time, value: prevEma });
        continue;
      }
      const currentEma = data[i].close * k + prevEma * (1 - k);
      emaData.push({ time: data[i].time, value: currentEma });
      prevEma = currentEma;
    }
    return emaData;
  }

  updateData(data) {
    if (!data || data.length === 0) return;

    // Set Candlesticks
    this.candlestickSeries.setData(data);

    // Set Volume
    const volumeData = data.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? '#26a69a88' : '#ef535088',
    }));
    this.volumeSeries.setData(volumeData);

    // Set Moving Averages
    this.sma20Series.setData(this.calculateSMA(data, 20));
    this.ema50Series.setData(this.calculateEMA(data, 50));

    this.chart.timeScale().fitContent();
  }
}

export const chartEngine = new ChartEngine();