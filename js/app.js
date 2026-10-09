import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';
import { sheetManager } from './sheet-manager.js';

class Application {
    constructor() {
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            this.updateStatusBadge('• Initializing...', 'warning');

            // 1. Initialize IndexedDB Cache Storage
            await dataEngine.init();

            // 2. Safely initialize Charting & Sheet UI
            if (chartEngine) {
                if (typeof chartEngine.init === 'function') {
                    chartEngine.init();
                } else if (typeof chartEngine.initChart === 'function') {
                    chartEngine.initChart();
                }
            }

            if (sheetManager && typeof sheetManager.init === 'function') {
                sheetManager.init();
            }

            this.setupUIListeners();
            this.initialized = true;

            this.updateStatusBadge('• Ready', 'success');

            // 3. Load initial symbol RELIANCE & populate search datalist
            await this.loadActiveSymbol('RELIANCE');
            this.populateSymbolDatalist();
        } catch (error) {
            console.error('Failed to initialize AmiBroker Workstation:', error);
            this.updateStatusBadge('• Init Error', 'error');
        }
    }

    updateStatusBadge(text, state) {
        const badge = document.getElementById('engine-status');
        if (badge) {
            badge.textContent = text;
            if (state === 'success') {
                badge.className = "text-xs px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 font-medium";
            } else if (state === 'error') {
                badge.className = "text-xs px-2 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800/50 font-medium";
            } else {
                badge.className = "text-xs px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/50 font-medium";
            }
        }
    }

    setupUIListeners() {
        const symbolInput = document.getElementById('symbol-search-input');
        if (symbolInput) {
            symbolInput.addEventListener('change', async (e) => {
                const symbol = e.target.value.trim().toUpperCase();
                if (symbol) {
                    await this.loadActiveSymbol(symbol);
                }
            });

            symbolInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    const symbol = e.target.value.trim().toUpperCase();
                    if (symbol) {
                        await this.loadActiveSymbol(symbol);
                        symbolInput.blur();
                    }
                }
            });
        }
    }

    populateSymbolDatalist() {
        const datalist = document.getElementById('symbols-datalist');
        if (!datalist) return;

        const symbols = dataEngine.getSymbolList();
        if (symbols && symbols.length > 0) {
            datalist.innerHTML = '';
            symbols.forEach(sym => {
                const opt = document.createElement('option');
                opt.value = sym;
                datalist.appendChild(opt);
            });
            console.log(`Populated datalist with ${symbols.length} tickers.`);
        }
    }

    async loadActiveSymbol(symbol) {
        try {
            const footerStatus = document.getElementById('footer-cache-status');
            if (footerStatus) footerStatus.innerHTML = `<span>Loading ${symbol}...</span>`;

            const data = await dataEngine.getStockData(symbol, 2023, 2026);
            if (data && data.length > 0) {
                if (chartEngine) {
                    if (typeof chartEngine.setData === 'function') {
                        chartEngine.setData(data);
                    } else if (typeof chartEngine.renderCandlestickData === 'function') {
                        chartEngine.renderCandlestickData(data);
                    }
                }

                if (footerStatus) {
                    footerStatus.innerHTML = `<span>Cache: IndexedDB ✓ (${data.length} bars)</span>`;
                }

                const lastRow = data[data.length - 1];
                const updateTime = document.getElementById('footer-update-time');
                if (updateTime && lastRow) {
                    updateTime.textContent = `Updated: ${lastRow.date}`;
                }

                this.populateSymbolDatalist();
            } else {
                if (footerStatus) {
                    footerStatus.innerHTML = `<span class="text-rose-400">No data found for ${symbol}</span>`;
                }
            }
        } catch (err) {
            console.error(`Error loading symbol ${symbol}:`, err);
        }
    }
}

export const app = new Application();

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});