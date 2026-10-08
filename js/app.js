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
        console.log('Initializing AmiBroker Web Workstation...');
        
        // Step 1: Initialize Data Engine (DuckDB + R2 Parquet files)
        await this.dataEngine.init();

        // Step 2: Populate symbol selector / autocomplete with 3,000+ equities
        const symbols = this.dataEngine.getSymbols();
        this.populateSymbolDropdown(symbols);

        // Step 3: Load default stock chart (e.g., RELIANCE or first symbol)
        const defaultSymbol = symbols.includes('RELIANCE') ? 'RELIANCE' : symbols[0];
        if (defaultSymbol) {
            await this.loadSymbolData(defaultSymbol);
        }

        this.setupEventListeners();
    }

    populateSymbolDropdown(symbols) {
        const symbolInput = document.getElementById('symbol-input') || document.getElementById('symbol-select');
        const datalist = document.getElementById('symbol-list');

        if (datalist) {
            datalist.innerHTML = '';
            symbols.forEach(sym => {
                const opt = document.createElement('option');
                opt.value = sym;
                datalist.appendChild(opt);
            });
        }
    }

    async loadSymbolData(symbol) {
        const data = await this.dataEngine.getOHLCV(symbol);
        if (data && data.length > 0) {
            this.chartEngine.plotOHLCV(data, symbol);
        } else {
            console.warn(`No chart data returned for symbol: ${symbol}`);
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
    app.init().catch(err => console.error('App init failed:', err));
});