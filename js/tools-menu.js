// The "Tools" menu in the top bar. Everything formula-related is reached from here.
import { el, openModal } from './ui.js';
import { AFL_REFERENCE } from './afl-reference.js';
import { host } from './host.js';

const ITEMS = [
  { icon: '📝', label: 'Formula Editor…', hint: 'Write, open, edit and save AFL', run: async () => (await import('./formula-editor.js')).openFormulaEditor() },
  { icon: '📚', label: 'Formula Library…', hint: 'Built-in charts & indicators + your own', run: async () => (await import('./formula-library.js')).openLibrary({ mode: 'manage' }) },
  { icon: '✨', label: 'AI Formula Assistant…', hint: 'Describe it in plain English', run: async () => (await import('./ai-assistant.js')).openAIAssistant() },
  { sep: true },
  { icon: '🔎', label: 'Analysis: Scan · Explore · Backtest · Optimize…', hint: 'Run any formula over many symbols', run: async () => (await import('./analysis.js')).openAnalysis() },
  { icon: '🗂', label: 'Symbols · Categories · Watchlists…', hint: 'Groups, sectors, watchlists, favorites; import TXT / TLS', run: async () => (await import('./categories-ui.js')).openCategories() },
  { icon: '⏱', label: 'Intraday data…', hint: 'Server address, 1/5/15/30/45 min and hourly frames (editable)', run: async () => (await import('./intraday-ui.js')).openIntradaySettings(() => host.refreshTimeframes()) },
  { icon: '🕯', label: 'Price style…', hint: 'Candles, OHLC bars, line or area for Price formulas', run: async () => openPriceStyle() },
  { sep: true },
  { icon: '❓', label: 'AFL Reference', hint: 'Functions you can use', run: () => openReference() },
];

function openPriceStyle() {
  const ws = host.ws(), sheet = ws.active();
  openModal('Price style', (b, close) => {
    b.appendChild(el('div', 'text-[11px] text-slate-400', 'Used by every formula that draws price with GetPriceStyle() (Price, Ichimoku, Plot Foreign...).'));
    [['candle', 'Candlesticks'], ['bar', 'OHLC bars'], ['line', 'Close line'], ['area', 'Area']].forEach(([k, label]) => {
      const x = el('button', (sheet.priceStyle || 'candle') === k ? 'w-full px-3 py-2 rounded bg-sky-600 text-white text-xs' : 'w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 text-xs', label);
      x.type = 'button'; x.onclick = () => { ws.setPriceStyle(sheet.id, k); host.relayout(); close(); }; b.appendChild(x);
    });
  }, { stack: true });
}

export function openReference() {
  openModal('AFL quick reference', (b) => {
    const pre = el('pre', 'text-[10.5px] leading-4 text-slate-300 whitespace-pre-wrap break-words');
    pre.textContent = AFL_REFERENCE.trim();
    b.appendChild(pre);
  }, { stack: true });
}

export function initToolsMenu(rootId = 'tools-root') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const btn = el('button', 'px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-semibold', 'Tools ▾');
  btn.type = 'button'; btn.id = 'btn-tools';
  const menu = el('div', 'hidden absolute left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded shadow-xl z-50 py-1');
  menu.id = 'tools-menu';

  const hide = () => menu.classList.add('hidden');
  for (const it of ITEMS) {
    if (it.sep) { menu.appendChild(el('div', 'my-1 border-t border-slate-700')); continue; }
    const row = el('button', `w-full text-left px-3 py-2 flex items-start space-x-2 ${it.disabled ? 'opacity-50' : 'active:bg-slate-700'}`);
    row.type = 'button'; row.disabled = !!it.disabled;
    row.appendChild(el('span', 'text-sm leading-4', it.icon));
    const txt = el('span', 'block');
    txt.appendChild(el('span', 'block text-xs text-slate-100', it.label));
    txt.appendChild(el('span', 'block text-[10px] text-slate-400', it.hint));
    row.appendChild(txt);
    row.onclick = async () => {
      hide();
      try { await it.run(); } catch (e) { console.error(e); alert('Could not open: ' + (e.message || e)); }
    };
    menu.appendChild(row);
  }
  btn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); };
  document.addEventListener('pointerdown', (e) => { if (!root.contains(e.target)) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  root.appendChild(btn); root.appendChild(menu);
  import('./categories-ui.js').then((m) => m.initFavoriteStar()).catch((e) => console.warn('Favorite star failed', e));
}
