/**
 * chart-engine.js
 * Multi-Pane Chart Rendering Engine with Indicator Overlays
 */

export class ChartEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.charts = [];
    }

    renderSheet(sheetData, dataRecords) {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.charts = [];

        const wrapper = document.createElement('div');
        wrapper.className = 'chart-panes-wrapper';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';

        sheetData.panes.forEach((pane) => {
            const paneContainer = document.createElement('div');
            paneContainer.className = 'chart-pane';
            paneContainer.style.height = pane.height || `${100 / sheetData.panes.length}%`;
            paneContainer.style.position = 'relative';
            paneContainer.style.flex = '1';
            paneContainer.style.borderBottom = '1px solid #2a2e39';

            const toolbar = document.createElement('div');
            toolbar.className = 'pane-toolbar';
            toolbar.innerHTML = `
                <span class="pane-title">${pane.type.toUpperCase()} ${pane.subType ? '('+pane.subType+')' : ''}</span>
                <div class="pane-actions">
                    <button class="add-overlay-btn" title="Add Moving Average / Indicator">+ MA</button>
                    ${sheetData.panes.length > 1 ? `<button class="remove-pane-btn" title="Remove Pane">&times;</button>` : ''}
                </div>
            `;

            toolbar.querySelector('.add-overlay-btn').onclick = () => {
                const period = prompt("Enter MA Period (e.g., 20 or 50):", "20");
                if (period) {
                    window.app.sheetManager.addOverlayToPane(pane.id, { type: 'SMA', period: parseInt(period), color: '#2196f3' });
                }
            };

            const removeBtn = toolbar.querySelector('.remove-pane-btn');
            if (removeBtn) {
                removeBtn.onclick = () => {
                    window.app.sheetManager.removePaneFromActiveSheet(pane.id);
                };
            }

            paneContainer.appendChild(toolbar);

            const chartCanvasArea = document.createElement('div');
            chartCanvasArea.className = 'pane-canvas';
            chartCanvasArea.style.width = '100%';
            chartCanvasArea.style.height = 'calc(100% - 28px)';
            paneContainer.appendChild(chartCanvasArea);

            wrapper.appendChild(paneContainer);

            this.renderPaneContent(chartCanvasArea, pane, dataRecords);
        });

        this.container.appendChild(wrapper);
    }

    renderPaneContent(container, pane, dataRecords) {
        if (typeof LightweightCharts === 'undefined' || !dataRecords || dataRecords.length === 0) {
            container.innerHTML = '<div style="color: #909399; padding: 20px; font-size: 12px;">No data or chart library loading...</div>';
            return;
        }

        const chart = LightweightCharts.createChart(container, {
            layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#1f293d' }, horzLines: { color: '#1f293d' } },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            timeScale: { borderColor: '#2a2e39' },
            rightPriceScale: { borderColor: '#2a2e39' }
        });

        if (pane.type === 'candlestick') {
            const series = chart.addCandlestickSeries({
                upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350'
            });
            series.setData(dataRecords.map(d => ({ time: d.date, open: d.open, high: d.high, low: d.low, close: d.close })));

            if (pane.indicators) {
                pane.indicators.forEach(ind => {
                    if (ind.type === 'SMA') {
                        const smaData = this.calculateSMA(dataRecords, ind.period);
                        const lineSeries = chart.addLineSeries({ color: ind.color || '#2962ff', lineWidth: 2 });
                        lineSeries.setData(smaData);
                    }
                });
            }
        } else if (pane.type === 'volume') {
            const series = chart.addHistogramSeries({
                color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: ''
            });
            series.setData(dataRecords.map(d => ({ time: d.date, value: d.volume, color: d.close >= d.open ? '#26a69a' : '#ef5350' })));

            if (pane.indicators) {
                pane.indicators.forEach(ind => {
                    if (ind.type === 'SMA') {
                        const smaVol = this.calculateSMA(dataRecords.map(d => ({ date: d.date, close: d.volume })), ind.period);
                        const lineSeries = chart.addLineSeries({ color: ind.color || '#ff9800', lineWidth: 2 });
                        lineSeries.setData(smaVol);
                    }
                });
            }
        } else if (pane.type === 'delivery') {
            const series = chart.addHistogramSeries({
                color: '#ab47bc', priceScaleId: ''
            });
            series.setData(dataRecords.map(d => ({ time: d.date, value: d.delivery || d.volume * 0.4 })));

            if (pane.indicators) {
                pane.indicators.forEach(ind => {
                    if (ind.type === 'SMA') {
                        const smaDel = this.calculateSMA(dataRecords.map(d => ({ date: d.date, close: d.delivery || d.volume * 0.4 })), ind.period);
                        const lineSeries = chart.addLineSeries({ color: ind.color || '#00bcd4', lineWidth: 2 });
                        lineSeries.setData(smaDel);
                    }
                });
            }
        }

        chart.timeScale().fitContent();
        this.charts.push(chart);
    }

    calculateSMA(data, period) {
        let result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) continue;
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
            }
            result.push({ time: data[i].date, value: sum / period });
        }
        return result;
    }
}