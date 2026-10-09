import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';
import { sheetManager } from './sheet-manager.js';
import { DuckEngine } from './duck-engine.js';
import { RangeEngine } from './range-engine.js';
import { DATABASES, ACTIVE_DB } from './config.js';

class Application {
    constructor() {
        this.initialized = false;
        this.symbols = [];
        try { this.symbols = JSON.parse(localStorage.getItem('symbol_list') || '[]'); } catch (e) {}
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
        // Tap the footer message to read the whole text (useful for errors)
        const footerMsg = document.getElementById('cache-status');
        if (footerMsg) footerMsg.addEventListener('click', () => alert(this.fullStatus || ''));

        try {
            await dataEngine.init(); // IndexedDB
            this.initialized = true;
            this.setStatus('Engine Ready', 'success');
        } catch (e) {
            console.error('IndexedDB init failed:', e);
            this.setStatus('Initialization Failed', 'error');
            return;
        }

        this.startRange();
        const box = document.getElementById('symbol-input');
        if (box) box.value = 'RELIANCE';
        await this.loadActiveSymbol('RELIANCE');
    }

    // Main engine: reads one symbol with parallel range requests (fast, small download)
    startRange() {
        this.range = new RangeEngine(DATABASES[ACTIVE_DB]);
        this.range.onProgress = (m) => this.setCacheText(m);
        this.rangeReady = this.range.init().then(() => true).catch((e) => {
            console.error('Range engine unavailable:', e);
            this.rangeError = e.message || String(e);
            return false;
        });
    }

    // Backup engine (DuckDB-WASM): only started if the main engine fails
    ensureDuck() {
        if (!this.duckReady) {
            this.duck = new DuckEngine(DATABASES[ACTIVE_DB]);
            this.duck.onProgress = (m) => this.setCacheText(m);
            const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('DuckDB start timed out (60s)')), 60000));
            this.duckReady = Promise.race([this.duck.init(), timeout]).then(() => true);
        }
        return this.duckReady;
    }

    loadSymbolListOnce(engine) {
        if (this.symbolsRequested) return;
        this.symbolsRequested = true;
        engine.getSymbols().then((list) => {
            if (list.length) {
                this.symbols = list;
                try { localStorage.setItem('symbol_list', JSON.stringify(list)); } catch (e) {}
            }
        }).catch((e) => { this.symbolsRequested = false; console.warn('Symbol list failed', e); });
    }

    // Shows a readable, selectable error box (no console needed on a phone)
    showDiag(text) {
        let box = document.getElementById('diag-box');
        if (!text) { if (box) box.remove(); return; }
        if (!box) {
            box = document.createElement('div');
            box.id = 'diag-box';
            box.className = 'fixed left-2 right-2 bottom-8 z-50 bg-slate-900 border border-amber-500/60 rounded p-2 text-[10px] text-amber-200 select-text max-h-56 overflow-auto';
            document.body.appendChild(box);
        }
        box.innerHTML = '';
        const close = document.createElement('button');
        close.textContent = '\u00D7 close';
        close.className = 'float-right px-2 text-slate-300';
        close.onclick = () => box.remove();
        const pre = document.createElement('div');
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordBreak = 'break-word';
        pre.textContent = text.replace(/ \|\| /g, '\n');
        box.appendChild(close);
        box.appendChild(pre);
    }

    setStatus(text, state) {
        const badge = document.getElementById('status-badge');
        if (!badge) return;
        badge.textContent = `\u25CF ${text}`;
        badge.style.color = state === 'success' ? '#22c55e' : state === 'error' ? '#ef4444' : '#eab308';
    }

    setCacheText(text) {
        this.fullStatus = text;
        const el = document.getElementById('cache-status');
        if (el) el.textContent = text;
    }

    setupUIListeners() {
        const input = document.getElementById('symbol-input');
        const list = document.getElementById('symbol-suggest');
        if (!input || !list) return;

        const hide = () => list.classList.add('hidden');

        const choose = (sym) => {
            input.value = sym;
            input.blur();
            hide();
            this.loadActiveSymbol(sym);
        };

        const showMatches = () => {
            const q = input.value.trim().toUpperCase();
            if (!q || this.symbols.length === 0) { hide(); return; }
            const starts = [], contains = [];
            for (const sym of this.symbols) {
                const u = sym.toUpperCase();
                if (u.startsWith(q)) starts.push(sym);
                else if (u.includes(q)) contains.push(sym);
                if (starts.length >= 50) break;
            }
            const matches = starts.concat(contains).slice(0, 50);
            list.innerHTML = '';
            if (matches.length === 0) {
                const li = document.createElement('li');
                li.className = 'px-3 py-2 text-slate-500';
                li.textContent = 'No match';
                list.appendChild(li);
            } else {
                for (const sym of matches) {
                    const li = document.createElement('li');
                    li.className = 'px-3 py-2 text-slate-200 border-b border-slate-700/50 active:bg-slate-700';
                    li.textContent = sym;
                    // pointerdown fires before the input blurs, so the tap is never lost
                    li.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(sym); });
                    list.appendChild(li);
                }
            }
            list.classList.remove('hidden');
        };

        input.addEventListener('input', showMatches);
        input.addEventListener('focus', () => { input.select(); showMatches(); });
        input.addEventListener('blur', () => setTimeout(hide, 150));
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const q = input.value.trim().toUpperCase();
            if (!q) return;
            // exact match first, otherwise first suggestion, otherwise try as typed
            const exact = this.symbols.find(s => s.toUpperCase() === q);
            const first = this.symbols.find(s => s.toUpperCase().startsWith(q));
            choose(exact || first || q);
        });
    }

    refreshSymbolList() {
        const all = dataEngine.getAllSymbols();
        if (all.length > 0) {
            this.symbols = all;
            try { localStorage.setItem('symbol_list', JSON.stringify(all)); } catch (e) {}
        }
    }

    async loadActiveSymbol(symbol) {
        try {
            const t0 = performance.now();
            this.setCacheText(`Loading ${symbol}...`);
            let data = null, source = '', note = '';
            const problems = [];

            // 1) main engine: parallel range requests
            if (this.rangeReady && await this.rangeReady) {
                try {
                    data = await this.range.getBars(symbol);
                    source = 'Range';
                    const st = this.range.lastStats;
                    note = ` (${st.years - st.cached} of ${st.years} years from network, ${st.cached} cached, ${st.requests} requests, ${(st.bytes / 1048576).toFixed(1)} MB)`;
                    this.loadSymbolListOnce(this.range);
                } catch (e) {
                    console.error('Range engine failed:', e);
                    problems.push(`Range engine: ${e.message || e}`);
                }
            } else if (this.rangeError) {
                problems.push(`Range engine off: ${this.rangeError}`);
            }

            // 2) backup: DuckDB
            if (!data) {
                try {
                    await this.ensureDuck();
                    data = await this.duck.getBars(symbol);
                    source = 'DuckDB';
                    if (this.duck.lastNote) problems.push(this.duck.lastNote);
                    this.loadSymbolListOnce(this.duck);
                } catch (e) {
                    console.error('DuckDB failed:', e);
                    problems.push(`DuckDB: ${e.message || e}`);
                    data = null;
                }
            }

            // 3) last resort: download whole files with hyparquet (slow)
            if (!data) {
                data = await dataEngine.getStockData(
                    symbol, 2023, new Date().getFullYear(),
                    (partial) => { if (partial.length) chartEngine.renderCandlestickData(partial); }
                );
                source = 'hyparquet';
                this.refreshSymbolList();
            }

            const box = document.getElementById('symbol-input');
            if (box && document.activeElement !== box) box.value = symbol;
            if (problems.length) note += ` | ${problems.join(' || ')}`;
            if (data.length === 0) {
                this.setCacheText(`No rows for ${symbol} (${source})${note}`);
                this.showDiag(problems.join(' || '));
                return;
            }
            chartEngine.renderCandlestickData(data);
            this.showDiag(problems.join(' || '));
            const secs = ((performance.now() - t0) / 1000).toFixed(1);
            this.setCacheText(`${source}: ${data.length} bars in ${secs}s${note}`);
            const ts = document.getElementById('data-timestamp');
            if (ts) ts.textContent = `Updated: ${data[data.length - 1].date}`;
        } catch (err) {
            console.error(`Error loading symbol ${symbol}:`, err);
            this.setCacheText('Load failed: ' + (err.message || err));
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
