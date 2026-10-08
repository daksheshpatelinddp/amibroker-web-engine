import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';
import { sheetManager } from './sheet-manager.js';
import { studyRegistry } from './study-registry.js';
import { aflEngine } from './afl-engine.js';

class Application {
    constructor() {
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            console.log('Initializing AmiBroker Web Workstation...');
            
            // Step 1: Initialize hyparquet & IndexedDB engine
            await dataEngine.init();

            // Step 2: Initialize Chart & Sheet Engines
            chartEngine.init();
            sheetManager.init();

            // Step 3: Register event listeners for Workstation Controls
            this.setupUIListeners();

            this.initialized = true;
            console.log('AmiBroker Web Workstation initialized successfully.');

            // Load default symbol for active sheet
            await this.loadActiveSymbol('RELIANCE');
        } catch (error) {
            console.error('Failed to initialize AmiBroker Workstation:', error);
        }
    }

    setupUIListeners() {
        const symbolInput = document.getElementById('symbol-input');
        if (symbolInput) {
            symbolInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    const symbol = e.target.value.trim().toUpperCase();
                    if (symbol) {
                        await this.loadActiveSymbol(symbol);
                    }
                }
            });
        }
    }

    async loadActiveSymbol(symbol) {
        try {
            console.log(`Loading data for symbol: ${symbol}...`);
            const data = await dataEngine.getStockData(symbol, 2023, 2026);
            if (data && data.length > 0) {
                chartEngine.renderCandlestickData(data);
                console.log(`Successfully loaded ${data.length} records for ${symbol}`);
            } else {
                console.warn(`No price data found for symbol: ${symbol}`);
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