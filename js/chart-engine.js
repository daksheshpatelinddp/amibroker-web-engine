/**
 * app.js
 * Core Application Controller for AmiBroker Web
 */

import { SheetManager } from './sheet-manager.js';
import { ChartEngine } from './chart-engine.js';
import { DataEngine } from './data-engine.js';

export class App {
    constructor() {
        this.currentSymbol = 'RELIANCE';
        this.dataEngine = new DataEngine();
        this.chartEngine = new ChartEngine('chart-container');
        this.sheetManager = new SheetManager(this);
        
        window.app = this;
        this.init();
    }

    async init() {
        await this.dataEngine.init();
        this.renderSymbolHeader();
        
        const activeSheet = this.sheetManager.getActiveSheet();
        this.renderActiveSheet(activeSheet);
    }

    renderSymbolHeader() {
        const headerEl = document.getElementById('symbol-header');
        if (!headerEl) return;

        headerEl.innerHTML = `
            <div class="symbol-info-banner">
                <div class="symbol-title-group">
                    <span id="active-symbol-name" class="symbol-highlight">${this.currentSymbol}</span>
                    <span class="exchange-tag">NSE / BSE</span>
                </div>
                <div class="symbol-quick-metrics">
                    <span>O: <strong id="m-open">--</strong></span>
                    <span>H: <strong id="m-high">--</strong></span>
                    <span>L: <strong id="m-low">--</strong></span>
                    <span>C: <strong id="m-close">--</strong></span>
                    <span>Vol: <strong id="m-vol">--</strong></span>
                </div>
                <div class="symbol-search-box">
                    <input type="text" id="symbol-search-input" placeholder="Search Symbol (e.g. TCS, INFY)..." />
                </div>
            </div>
        `;

        const searchInput = headerEl.querySelector('#symbol-search-input');
        searchInput.addEventListener('change', (e) => {
            this.changeSymbol(e.target.value.toUpperCase());
        });
    }

    async changeSymbol(symbol) {
        if (!symbol) return;
        this.currentSymbol = symbol;
        const symEl = document.getElementById('active-symbol-name');
        if (symEl) symEl.textContent = symbol;

        const activeSheet = this.sheetManager.getActiveSheet();
        this.renderActiveSheet(activeSheet);
    }

    async renderActiveSheet(sheet) {
        const records = await this.dataEngine.getHistoricalData(this.currentSymbol, sheet.timeframe);
        this.chartEngine.renderSheet(sheet, records);
        this.updateMetrics(records);
    }

    updateMetrics(records) {
        if (!records || records.length === 0) return;
        const latest = records[records.length - 1];
        
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setVal('m-open', latest.open);
        setVal('m-high', latest.high);
        setVal('m-low', latest.low);
        setVal('m-close', latest.close);
        setVal('m-vol', latest.volume ? latest.volume.toLocaleString() : '--');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});