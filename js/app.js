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
            this.updateStatusBadge('Initializing Engine...', 'warning');

            // Initialize IndexedDB
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
            await this.loadActiveSymbol('RELIANCE');
        } catch (error) {
            console.error('Failed to initialize AmiBroker Workstation:', error);
            this.updateStatusBadge('Initialization Failed', 'error');
        }
    }

    updateStatusBadge(text, state) {
        const statusBadges = document.querySelectorAll('.status-badge, #engine-status, header span');
        statusBadges.forEach(badge => {
            if (badge && badge.textContent.includes('Engine')) {
                badge.textContent = `• ${text}`;
                if (state === 'success') {
                    badge.style.color = '#22c55e';
                } else if (state === 'error') {
                    badge.style.color = '#ef4444';
                } else {
                    badge.style.color = '#eab308';
                }
            }
        });
    }

    setupUIListeners() {
        const symbolInput = document.getElementById('symbol-input') || document.querySelector('select');
        if (symbolInput) {
            symbolInput.addEventListener('change', async (e) => {
                const symbol = e.target.value.trim().toUpperCase();
                if (symbol) {
                    await this.loadActiveSymbol(symbol);
                }
            });
        }
    }

    async loadActiveSymbol(symbol) {
        try {
            const data = await dataEngine.getStockData(symbol, 2023, 2026);
            if (data && data.length > 0) {
                if (chartEngine && typeof chartEngine.renderCandlestickData === 'function') {
                    chartEngine.renderCandlestickData(data);
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