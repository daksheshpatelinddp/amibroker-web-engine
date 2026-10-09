import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';
import { sheetManager } from './sheet-manager.js';

class Application {
    constructor() {
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        this.setStatus('Initializing Engine...', 'warning');
        dataEngine.onProgress = (m) => this.setCacheText(m);
        // On a phone there is no console: surface any error in the footer
        window.addEventListener('error', (e) => this.setCacheText('ERR: ' + e.message));
        window.addEventListener('unhandledrejection', (e) => this.setCacheText('ERR: ' + (e.reason && e.reason.message || e.reason)));

        // UI first: a chart/sheet problem must never block data loading
        try { chartEngine.init(); } catch (e) { console.error('Chart init failed:', e); }
        try { sheetManager.init(); } catch (e) { console.error('Sheet init failed:', e); }
        this.setupUIListeners();

        try {
            await dataEngine.init(); // IndexedDB
            this.initialized = true;
            this.setStatus('Engine Ready', 'success');
        } catch (e) {
            console.error('IndexedDB init failed:', e);
            this.setStatus('Initialization Failed', 'error');
            return;
        }

        await this.loadActiveSymbol('RELIANCE');
    }

    setStatus(text, state) {
        const badge = document.getElementById('status-badge');
        if (!badge) return;
        badge.textContent = `\u25CF ${text}`;
        badge.style.color = state === 'success' ? '#22c55e' : state === 'error' ? '#ef4444' : '#eab308';
    }

    setCacheText(text) {
        const el = document.getElementById('cache-status');
        if (el) el.textContent = text;
    }

    setupUIListeners() {
        const select = document.getElementById('symbol-select');
        if (select) {
            select.addEventListener('change', (e) => this.loadActiveSymbol(e.target.value));
        }
    }

    async loadActiveSymbol(symbol) {
        try {
            this.setCacheText(`Loading ${symbol}...`);
            const data = await dataEngine.getStockData(
                symbol, 2023, new Date().getFullYear(),
                (partial) => { if (partial.length) chartEngine.renderCandlestickData(partial); }
            );
            console.log(`${symbol}: ${data.length} rows`);
            if (data.length === 0) {
                this.setCacheText(`No rows for ${symbol} in any year (check symbol column values)`);
                return;
            }
            chartEngine.renderCandlestickData(data);
            this.setCacheText(`Cache: IndexedDB \u2713 (${data.length} bars)`);
            const ts = document.getElementById('data-timestamp');
            if (ts) ts.textContent = `Updated: ${data[data.length - 1].date}`;
        } catch (err) {
            console.error(`Error loading symbol ${symbol}:`, err);
            this.setCacheText('Load failed - see console');
        }
    }
}

export const app = new Application();

// Module scripts are deferred, so the DOM is usually ready already
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}
