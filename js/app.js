import { DataEngine } from './data-engine.js';
import { ChartEngine } from './chart-engine.js';

class App {
    constructor() {
        this.dataEngine = new DataEngine();
        this.chartEngine = new ChartEngine('chart-container');
    }

    async init() {
        const statusBadge = document.querySelector('.bg-yellow-500\\/10, [class*="Initializing"]')?.parentElement || document.body;

        const updateStatus = (text) => {
            const statusEl = document.getElementById('r2-status') || document.querySelector('#status-pill span');
            if (statusEl) statusEl.textContent = text;
            console.log(`[Status]: ${text}`);
        };

        // Step 1: Initialize Data Engine (Pass callback to update UI)
        await this.dataEngine.init(updateStatus);

        // Hide or update Initializing badge
        const initBadge = document.querySelector('span:contains("Initializing")');
        const statusPill = document.getElementById('engine-status-pill');
        if (statusPill) {
            statusPill.className = 'px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            statusPill.textContent = 'Engine Ready';
        }

        // Step 2: Populate symbols
        const symbols = this.dataEngine.getSymbols();
        this.populateSymbolDropdown(symbols);

        // Step 3: Load default stock chart
        const defaultSymbol = symbols.includes('RELIANCE') ? 'RELIANCE' : symbols[0];
        if (defaultSymbol) {
            await this.loadSymbolData(defaultSymbol);
        }
    }

    populateSymbolDropdown(symbols) {
        const datalist = document.getElementById('symbol-list');
        if (datalist) {
            datalist.innerHTML = symbols.map(sym => `<option value="${sym}">`).join('');
        }
    }

    async loadSymbolData(symbol) {
        const data = await this.dataEngine.getOHLCV(symbol);
        if (data && data.length > 0) {
            this.chartEngine.plotOHLCV(data, symbol);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init().catch(err => console.error('App init failed:', err));
});