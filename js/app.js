import { DataEngine } from './data-engine.js';
import { ChartEngine } from './chart-engine.js';
import { SheetManager } from './sheet-manager.js';
import { CategoryManager } from './category-manager.js';
import { AFLEngine } from './afl-engine.js';

class App {
    constructor() {
        this.dataEngine = new DataEngine();
        this.chartEngine = new ChartEngine('chart-container');
        this.sheetManager = new SheetManager();
        this.categoryManager = new CategoryManager();
        this.aflEngine = new AFLEngine();
    }

    async init() {
        this.setupStatusListeners();

        // Step 1: Initialize Data Engine (DuckDB + R2 Download)
        await this.dataEngine.init();

        // Step 2: Populate symbol selector / autocomplete
        const symbols = this.dataEngine.getSymbols();
        this.populateSymbolDropdown(symbols);

        // Step 3: Load initial default symbol (e.g., RELIANCE)
        const defaultSymbol = symbols.includes('RELIANCE') ? 'RELIANCE' : symbols[0];
        if (defaultSymbol) {
            await this.loadSymbolData(defaultSymbol);
        }

        this.setupEventListeners();
    }

    setupStatusListeners() {
        const r2StatusEl = document.getElementById('r2-cache-status');
        const statusPill = document.getElementById('status-pill');

        window.addEventListener('r2-cache-update', (e) => {
            if (r2StatusEl) r2StatusEl.textContent = `R2 Cache: ${e.detail.message}`;
        });

        window.addEventListener('engine-status-update', (e) => {
            if (statusPill) {
                statusPill.className = `px-2 py-0.5 rounded text-xs border ${e.detail.statusClass}`;
                statusPill.textContent = e.detail.text;
            }
        });
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

    setupEventListeners() {
        const symbolInput = document.getElementById('symbol-input');
        if (symbolInput) {
            symbolInput.addEventListener('change', async (e) => {
                const selectedSymbol = e.target.value.trim().toUpperCase();
                if (selectedSymbol) {
                    await this.loadSymbolData(selectedSymbol);
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init().catch(err => console.error('App launch error:', err));
});