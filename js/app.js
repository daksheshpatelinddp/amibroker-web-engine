import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';
import { sheetManager } from './sheet-manager.js';

class Application {
    constructor() {
        this.initialized = false;
        this.currentSymbol = 'RELIANCE';
    }

    async init() {
        if (this.initialized) return;

        try {
            this.updateStatusBadge('Initializing Engine...', 'warning');

            // Initialize IndexedDB Engine
            await dataEngine.init();

            // Initialize Charting & Sheet UI
            if (chartEngine && typeof chartEngine.init === 'function') {
                chartEngine.init();
            }
            if (sheetManager && typeof sheetManager.init === 'function') {
                sheetManager.init();
            }

            this.setupUIListeners();
            this.initialized = true;

            this.updateStatusBadge('Engine Ready', 'success');

            // Load default symbol
            await this.loadActiveSymbol(this.currentSymbol);

            // Populate all ~3,000 symbols asynchronously into the search datalist
            this.populateSymbolList();

        } catch (error) {
            console.error('Failed to initialize AmiBroker Workstation:', error);
            this.updateStatusBadge('Initialization Failed', 'error');
        }
    }

    async populateSymbolList() {
        try {
            const datalist = document.getElementById('symbol-list');
            if (!datalist) return;

            const symbols = await dataEngine.getAllSymbols();
            if (symbols && symbols.length > 0) {
                datalist.innerHTML = '';
                const fragment = document.createDocumentFragment();
                
                symbols.forEach(sym => {
                    const opt = document.createElement('option');
                    opt.value = sym;
                    fragment.appendChild(opt);
                });

                datalist.appendChild(fragment);
                console.log(`Populated search datalist with ${symbols.length} symbols.`);
            }
        } catch (e) {
            console.error('Failed to populate symbol list:', e);
        }
    }

    updateStatusBadge(text, state) {
        const statusBadges = document.querySelectorAll('.status-badge, #engine-status');
        statusBadges.forEach(badge => {
            if (badge) {
                badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${state === 'success' ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse"></span> • ${text}`;
                if (state === 'success') {
                    badge.className = 'status-badge text-[11px] font-medium text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40 flex items-center gap-1.5';
                } else if (state === 'error') {
                    badge.className = 'status-badge text-[11px] font-medium text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-800/40 flex items-center gap-1.5';
                } else {
                    badge.className = 'status-badge text-[11px] font-medium text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 flex items-center gap-1.5';
                }
            }
        });
    }

    setupUIListeners() {
        const symbolInput = document.getElementById('symbol-input');
        if (symbolInput) {
            const triggerLoad = async () => {
                const val = symbolInput.value.trim().toUpperCase();
                if (val && val !== this.currentSymbol) {
                    this.currentSymbol = val;
                    await this.loadActiveSymbol(val);
                }
            };

            // Trigger when picking from datalist dropdown or pressing Enter
            symbolInput.addEventListener('change', triggerLoad);
            symbolInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    symbolInput.blur();
                    await triggerLoad();
                }
            });
        }
    }

    async loadActiveSymbol(symbol) {
        try {
            const cacheStatusEl = document.getElementById('cache-status');
            if (cacheStatusEl) cacheStatusEl.innerHTML = `<span>Loading ${symbol}...</span>`;

            const data = await dataEngine.getStockData(symbol, 2023, 2026);
            if (data && data.length > 0) {
                if (chartEngine && typeof chartEngine.renderCandlestickData === 'function') {
                    chartEngine.renderCandlestickData(data);
                }
                
                if (cacheStatusEl) {
                    cacheStatusEl.innerHTML = `<span>Cache: IndexedDB ✓ (${data.length} bars)</span>`;
                }

                const lastUpdatedEl = document.getElementById('last-updated');
                if (lastUpdatedEl && data[data.length - 1]) {
                    lastUpdatedEl.textContent = `Updated: ${data[data.length - 1].date}`;
                }
            } else {
                if (cacheStatusEl) cacheStatusEl.innerHTML = `<span class="text-amber-400">No data found for ${symbol}</span>`;
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