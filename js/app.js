import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';
import { SheetManager } from './sheet-manager.js';
import { RangeEngine } from './range-engine.js';
import { Workspace } from './workspace.js';
import { openAddPane, openPaneEditor } from './pane-ui.js';
import { DATABASES, ACTIVE_DB } from './config.js';
import { host } from './host.js';
import { initToolsMenu } from './tools-menu.js';
import { formulaStore } from './formula-store.js';

// Indian-style short numbers for the header line: 1.2K, 3.4L (lakh), 5.6Cr (crore)
function fmtQty(n) {
    if (!Number.isFinite(n)) return '-';
    const a = Math.abs(n);
    if (a >= 1e7) return (n / 1e7).toFixed(2) + 'Cr';
    if (a >= 1e5) return (n / 1e5).toFixed(2) + 'L';
    if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
}
const fmtPrice = (n) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-');

class Application {
    constructor() {
        this.initialized = false;
        this.symbols = [];
        try { this.symbols = JSON.parse(localStorage.getItem('symbol_list') || '[]'); } catch (e) {}
        this.ws = new Workspace();          // sheets, panes, overlays (saved in the browser)
        this.barCache = new Map();          // symbol -> rows, so switching sheets is instant
        this.currentRows = [];
        this.loadToken = 0;                 // ignores answers that arrive after you already moved on
    }

    async init() {
        if (this.initialized) return;
        this.setStatus('Initializing Engine...', 'warning');
        dataEngine.baseUrl = DATABASES[ACTIVE_DB].baseUrl; // last-resort engine uses the same folder
        dataEngine.onProgress = (m) => this.setCacheText(m);
        // On a phone there is no console: surface any error in the footer
        window.addEventListener('error', (e) => this.setCacheText('ERR: ' + e.message));
        window.addEventListener('unhandledrejection', (e) => this.setCacheText('ERR: ' + (e.reason && e.reason.message || e.reason)));

        // UI first: a chart/sheet problem must never block data loading
        try { chartEngine.init(); } catch (e) { console.error('Chart init failed:', e); }
        try {
            this.sheetManager = new SheetManager('sheet-bar', this.ws, {
                onSelect: (sheet) => this.openSheet(sheet),
                onAdd: (sheet) => this.openSheet(sheet),
                onRemove: (newActive) => { if (newActive) this.openSheet(newActive); },
            });
            this.sheetManager.init();
        } catch (e) { console.error('Sheet init failed:', e); }
        this.setupUIListeners();

        // Tools menu + the bridge the formula windows use to reach the chart
        Object.assign(host, {
            relayout: () => this.relayout(),
            addFormulaPane: (id) => { this.ws.addPane(this.ws.active().id, 'afl', { formulaId: id }); this.relayout(); },
            newFormulaSheet: (id) => {
                const sheet = this.ws.addFormulaSheet(id);
                if (this.sheetManager) this.sheetManager.render();
                this.openSheet(sheet);
            },
            getBars: () => chartEngine.arrays,
            symbol: () => this.ws.active().symbol,
        });
        try { initToolsMenu('tools-root'); } catch (e) { console.error('Tools menu failed:', e); }
        chartEngine.onFormulaErrors = (paneId, errors) => {
            const pane = this.ws.active().panes.find((p) => p.id === paneId);
            const f = pane && formulaStore.get(pane.params.formulaId);
            this.setCacheText(`Formula "${f ? f.name : '?'}": ${errors[0]}`);
        };

        chartEngine.onHover = (i) => this.updateHeader(i);
        chartEngine.onPaneClick = (paneId) => openPaneEditor(this.ws, this.ws.active(), paneId, () => this.relayout());
        const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
        on('btn-fit', () => chartEngine.fitAll());
        on('btn-latest', () => chartEngine.goLatest());
        on('btn-add-pane', () => openAddPane(this.ws, this.ws.active(), () => this.relayout()));
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
        await this.openSheet(this.ws.active());
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

    // Backup engine (DuckDB-WASM): its code is downloaded only if the main engine fails
    ensureDuck() {
        if (!this.duckReady) {
            this.duckReady = import('./duck-engine.js').then(({ DuckEngine }) => {
                this.duck = new DuckEngine(DATABASES[ACTIVE_DB]);
                this.duck.onProgress = (m) => this.setCacheText(m);
                const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('DuckDB start timed out (60s)')), 60000));
                return Promise.race([this.duck.init(), timeout]);
            }).then(() => true);
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

    // Switch to a sheet: show its symbol (from memory if already loaded)
    async openSheet(sheet) {
        const box = document.getElementById('symbol-input');
        if (box) box.value = sheet.symbol;
        await this.loadActiveSymbol(sheet.symbol);
    }

    // Draw the active sheet's panes for the given rows
    display(rows, { keepRange = false } = {}) {
        this.currentRows = rows;
        try {
            chartEngine.render(this.ws.active(), rows, { keepRange });
        } catch (e) {
            console.error('Chart draw failed:', e);
            this.setCacheText('Chart error: ' + (e.message || e));
        }
        this.updateHeader(null);
    }

    // Only the pane layout changed (add/remove pane, moving average): redraw, keep the zoom
    relayout() {
        if (this.currentRows.length) this.display(this.currentRows, { keepRange: true });
        else this.updateHeader(null);
    }

    // The symbol bar above the chart: name, last price and change; follows the crosshair
    updateHeader(index) {
        const sheet = this.ws.active();
        const set = (id, text) => { const e = document.getElementById(id); if (e) e.textContent = text; };
        set('sym-title', sheet.symbol);
        const n = chartEngine.barCount;
        const i = (index === null || index === undefined) ? n - 1 : index;
        const bar = chartEngine.barAt(i);
        if (!bar) { set('sym-price', ''); set('sym-change', ''); set('sym-ohlc', ''); return; }
        set('sym-price', fmtPrice(bar.close));
        const ch = document.getElementById('sym-change');
        if (ch) {
            if (Number.isFinite(bar.prevClose) && bar.prevClose > 0) {
                const pct = (bar.close / bar.prevClose - 1) * 100;
                ch.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
                ch.style.color = pct >= 0 ? '#22c55e' : '#ef4444';
            } else { ch.textContent = ''; }
        }
        const deliv = Number.isFinite(bar.delivery)
            ? ` D ${fmtQty(bar.delivery)}${bar.volume > 0 ? ` (${(bar.delivery / bar.volume * 100).toFixed(0)}%)` : ''}` : '';
        set('sym-ohlc', `${bar.date}  O ${fmtPrice(bar.open)}  H ${fmtPrice(bar.high)}  L ${fmtPrice(bar.low)}  C ${fmtPrice(bar.close)}  V ${fmtQty(bar.volume)}${deliv}`);
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
            const token = ++this.loadToken;
            this.ws.setSymbol(this.ws.active().id, symbol);   // also moves linked sheets
            const hit = this.barCache.get(symbol);
            if (hit) {                                         // opened before in this visit
                this.display(hit);
                this.setCacheText(`${symbol}: ${hit.length} bars (kept in memory)`);
                return;
            }
            this.updateHeader(null);
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
                    (partial) => { if (partial.length && token === this.loadToken) this.display(partial); }
                );
                source = 'hyparquet';
                this.refreshSymbolList();
            }

            if (data.length > 0) {
                this.barCache.set(symbol, data);
                if (this.barCache.size > 30) this.barCache.delete(this.barCache.keys().next().value);
            }
            if (token !== this.loadToken) return;              // you already opened something else
            const box = document.getElementById('symbol-input');
            if (box && document.activeElement !== box) box.value = symbol;
            if (problems.length) note += ` | ${problems.join(' || ')}`;
            if (data.length === 0) {
                this.setCacheText(`No rows for ${symbol} (${source})${note}`);
                this.showDiag(problems.join(' || '));
                return;
            }
            this.display(data);
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
