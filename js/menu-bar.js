// The menu bar under the logo (File · Edit · View · Insert · Format · Symbol · Analysis · Tools · Window),
// laid out like AmiBroker's, with the items this web app can really do. Dropdowns open under the tapped word;
// a ▸ item opens its list right below it. Nothing here owns state: every item calls the module that does the work.
import { el, openModal, toast, BTN } from './ui.js';
import { host } from './host.js';
import { TYPES as DRAW_TYPES, GROUPS as DRAW_GROUPS } from './drawing-types.js';
import { DATABASES, ACTIVE_DB } from './config.js';
import { paneTitle } from './workspace.js';
import { INTERVALS } from './timeframe.js';
import { formulaStore } from './formula-store.js';

const lazy = (path, fn) => async (...a) => { const m = await import(path); return m[fn](...a); };
const NAV_KEY = 'chart_nav_visible';
const readNav = () => { try { return localStorage.getItem(NAV_KEY) !== '0'; } catch (e) { return true; } };

function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function buildMenus(api) {
  const { app, engine, nav } = api, ws = () => app.ws, sheet = () => app.ws.active();
  const dr = () => app.drawings, tf = () => document.getElementById('tf-select');
  const noDraw = () => !dr();
  const setFrame = (id) => { const s = tf(); if (!s) return; s.value = id; s.dispatchEvent(new Event('change')); };
  const frame = () => sheet().interval || 'D';
  const bars = () => engine.barCount || 0;
  const goHistory = (n) => { if (!nav) return; const total = bars(); nav.setRange(Math.max(0, total - n), total + 4); };
  const symbolInfo = () => {
    const a = engine.arrays, n = bars(), sym = sheet().symbol;
    openModal('Symbol information', (b) => {
      const rows = [['Symbol', sym], ['Database', (DATABASES[ACTIVE_DB] || {}).name || ACTIVE_DB], ['Time frame', INTERVALS[frame()] || frame()], ['Bars', n.toLocaleString()]];
      if (n) { rows.push(['First bar', String(a.t[0])], ['Last bar', String(a.t[n - 1])], ['Last Open / High / Low / Close', [a.o, a.h, a.l, a.c].map((x) => (+x[n - 1]).toFixed(2)).join(' / ')], ['Last volume', Math.round(a.v[n - 1]).toLocaleString()]); }
      const t = el('div', 'space-y-1'); rows.forEach(([k, v]) => { const r = el('div', 'flex justify-between space-x-3 text-xs'); r.appendChild(el('span', 'text-slate-400', k)); r.appendChild(el('span', 'text-slate-100 text-right break-all', v)); t.appendChild(r); }); b.appendChild(t);
    }, { stack: true });
  };
  const exportCsv = () => {
    const a = engine.arrays, n = bars(); if (!n) { toast('No data on the chart.'); return; }
    const out = ['Date,Open,High,Low,Close,Volume']; for (let i = 0; i < n; i++) out.push([a.t[i], a.o[i], a.h[i], a.l[i], a.c[i], a.v[i]].join(','));
    download(`${sheet().symbol}-${frame()}.csv`, out.join('\n'), 'text/csv'); toast('CSV saved');
  };
  const saveImage = () => {
    try {
      const shot = engine.chart.takeScreenshot(), d = dr();
      if (d && d.canvas && !d.isHidden()) { const g = shot.getContext('2d'); g.drawImage(d.canvas, 0, 0, shot.width, shot.height); }
      shot.toBlob((blob) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${sheet().symbol}-chart.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); toast('Chart image saved'); });
    } catch (e) { toast('Could not make the image: ' + (e.message || e)); }
  };
  const drawingItems = () => DRAW_GROUPS.map((g) => ({ label: g, sub: DRAW_TYPES.filter((t) => t.group === g).map((t) => ({ label: `${t.icon}  ${t.name}`, run: () => dr().pickTool(t.id), disabled: noDraw })) }));
  const dbItems = () => Object.values(DATABASES).map((d) => ({ label: d.name, checked: () => d.id === ACTIVE_DB, run: () => { if (d.id !== ACTIVE_DB) host.switchDb(d.id); } }));
  const intraday = () => {
    const s = tf(); const list = s ? [...s.options].filter((o) => !/^(D|W|M|Q|Y|__.*)$/.test(o.value)) : [];
    return [...list.map((o) => ({ label: o.title || o.textContent, checked: () => frame() === o.value, run: () => setFrame(o.value) })),
      '-', { label: 'Custom…', run: () => setFrame('__custom') }, { label: 'Edit the list…', run: () => setFrame('__manage') }];
  };
  const paneItems = () => [{ label: 'Add indicator / formula pane…', run: async () => (await import('./pane-ui.js')).openAddPane(ws(), sheet(), () => app.relayout()) }, '-',
    ...sheet().panes.map((p) => ({ label: `Edit: ${paneTitle(p)}`, run: async () => (await import('./pane-ui.js')).openPaneEditor(ws(), sheet(), p.id, () => app.relayout()) }))];
  const sheetItems = () => ws().sheets.map((s) => ({ label: `${s.name} · ${s.symbol}`, checked: () => ws().active().id === s.id, run: () => app.sheetManager.select(s.id) }));

  return [
    { label: 'File', items: () => [
      { label: 'New sheet', run: () => app.sheetManager.add() },
      { label: 'Formula library…', run: () => import('./formula-library.js').then((m) => m.openLibrary({ mode: 'manage' })) },
      { label: 'Sync data between devices…', run: () => import('./sync-ui.js').then((m) => m.openSync()) },
      { label: 'Open database', sub: dbItems() },
      { label: 'Database settings (intraday server)…', run: lazy('./intraday-ui.js', 'openIntradaySettings') },
      '-',
      { label: 'Import symbols / watchlists (TXT, TLS)…', run: () => import('./categories-ui.js').then((m) => m.openCategories({ type: 'watchlists' })) },
      { label: 'Export chart data (CSV)', run: exportCsv },
      { label: 'Save chart as image (PNG)', run: saveImage },
      { label: 'Print…', run: () => window.print() },
      '-',
      { label: 'My formulas', sub: (() => { const l = formulaStore.all().filter((f) => !f.builtin).slice(0, 25); return l.length ? l.map((f) => ({ label: f.name, run: () => import('./formula-editor.js').then((m) => m.openFormulaEditor({ formulaId: f.id })) })) : [{ label: '(none yet)', disabled: () => true }]; })() },
    ] },
    { label: 'Edit', items: () => [
      { label: 'Cut', hint: 'Ctrl+X', run: () => { dr().copy(); dr().remove(); }, disabled: noDraw },
      { label: 'Copy', hint: 'Ctrl+C', run: () => dr().copy(), disabled: noDraw },
      { label: 'Paste', hint: 'Ctrl+V', run: () => dr().paste(), disabled: noDraw },
      { label: 'Delete', hint: 'Del', run: () => dr().remove(), disabled: noDraw },
      { label: 'Delete all drawings of this symbol', run: () => dr().deleteAll(), disabled: noDraw },
      '-',
      { label: 'Properties (Study ID…)', hint: 'Alt+Enter', run: () => dr().properties_(), disabled: noDraw },
    ] },
    { label: 'View', items: () => [
      { label: 'Crosshair', checked: () => !!engine.crosshairOn, run: () => nav && nav.cross.click() },
      { label: 'Price chart style', sub: [['candle', 'Candlesticks'], ['bar', 'OHLC bars'], ['line', 'Close line'], ['area', 'Area']].map(([k, t]) => ({ label: t, checked: () => (sheet().priceStyle || 'candle') === k, run: () => { ws().setPriceStyle(sheet().id, k); app.relayout(); } })) },
      { label: 'Logarithmic scale', checked: () => !!sheet().logScale, run: () => { ws().setLogScale(sheet().id, !sheet().logScale); app.relayout(); } },
      '-',
      ...['D', 'W', 'M', 'Q', 'Y'].map((k) => ({ label: INTERVALS[k], checked: () => frame() === k, run: () => setFrame(k) })),
      { label: 'Intraday', sub: intraday() },
      '-',
      { label: 'Zoom', sub: [{ label: 'Zoom in', run: () => nav && nav.zoom(0.75) }, { label: 'Zoom out', run: () => nav && nav.zoom(1 / 0.75) }, { label: 'Fit all data', run: () => engine.fitAll() }] },
      { label: 'History (show last…)', sub: [['1 month', 21], ['2 months', 45], ['6 months', 125], ['1 year', 250], ['3 years', 750], ['5 years', 1250]].map(([t, n]) => ({ label: t, hint: `${n} bars`, run: () => goHistory(n) })).concat([{ label: 'All data', run: () => engine.fitAll() }, { label: 'Go to the latest bar', run: () => engine.goLatest() }]) },
      { label: 'Pane', sub: paneItems() },
      { label: 'Toolbars', sub: [
        { label: 'Drawing tools', checked: () => !!dr() && dr().panelOpen(), run: () => dr() && dr().showPanel(!dr().panelOpen()) },
        { label: 'Scroll bar and zoom strip', checked: () => readNav(), run: () => { const on = !readNav(); try { localStorage.setItem(NAV_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } document.getElementById('chart-nav').classList.toggle('hidden', !on); window.dispatchEvent(new Event('resize')); } },
      ] },
      '-',
      { label: 'Refresh', run: () => app.loadActiveSymbol(sheet().symbol) },
      { label: 'Refresh all (reload data of every symbol)', run: () => { app.barCache.clear(); app.loadActiveSymbol(sheet().symbol); } },
    ] },
    { label: 'Insert', items: () => [
      { label: 'Indicator / formula pane…', run: async () => (await import('./pane-ui.js')).openAddPane(ws(), sheet(), () => app.relayout()) },
      '-', ...drawingItems(),
    ] },
    { label: 'Format', items: () => [
      { label: 'Thick line', checked: () => !!dr() && dr().currentStyle().width >= 3, run: () => dr().format({ width: dr().currentStyle().width >= 3 ? 1 : 3 }), disabled: noDraw },
      { label: 'Dotted line', checked: () => !!dr() && dr().currentStyle().dash === 'dotted', run: () => dr().format({ dash: dr().currentStyle().dash === 'dotted' ? 'solid' : 'dotted' }), disabled: noDraw },
      { label: 'Snap to Open / High / Low / Close', checked: () => !!dr() && dr().isMagnet(), run: () => dr().toggleMagnet(), disabled: noDraw },
      { label: 'Hide drawings', checked: () => !!dr() && dr().isHidden(), run: () => dr().toggleHidden(), disabled: noDraw },
      '-',
      { label: 'Colour, width, text, levels… (Properties)', run: () => dr().properties_(), disabled: noDraw },
    ] },
    { label: 'Symbol', items: () => [
      { label: 'Quick find', hint: 'F3', run: () => { const i = document.getElementById('symbol-input'); if (i) { i.focus(); i.select(); } } },
      { label: 'Find…', run: () => { const i = document.getElementById('symbol-input'); if (i) { i.focus(); i.select(); } } },
      { label: 'Information…', run: symbolInfo },
      '-',
      { label: 'Favourites', sub: [
        { label: 'Add / remove the symbol on screen', run: () => { const b = document.getElementById('btn-fav'); if (b) b.click(); } },
        { label: 'Open the favourites list…', run: () => import('./categories-ui.js').then((m) => m.openCategories({ type: 'favorites' })) },
      ] },
      { label: 'Watchlists…', run: () => import('./categories-ui.js').then((m) => m.openCategories({ type: 'watchlists' })) },
      { label: 'Categories…', run: () => import('./categories-ui.js').then((m) => m.openCategories({ type: 'sectors' })) },
      { label: 'Indexes…', run: () => import('./categories-ui.js').then((m) => m.openCategories({ type: 'indexes' })) },
    ] },
    { label: 'Analysis', items: () => [
      { label: 'New analysis… (Scan · Explore · Backtest · Optimize · Walk-Forward)', run: lazy('./analysis.js', 'openAnalysis') },
      { label: 'Formula editor…', run: () => import('./formula-editor.js').then((m) => m.openFormulaEditor()) },
      { label: 'AFL code wizard (AI assistant)…', run: () => import('./ai-assistant.js').then((m) => m.openAIAssistant()) },
      '-',
      { label: 'Analysis settings…', run: () => import('./analysis-settings-ui.js').then((m) => m.openAnalysisSettings()) },
      { label: 'AFL reference', run: () => import('./tools-menu.js').then((m) => m.openReference()) },
    ] },
    { label: 'Tools', items: () => [
      { label: 'Preferences (analysis settings)…', run: () => import('./analysis-settings-ui.js').then((m) => m.openAnalysisSettings()) },
      { label: 'Intraday data…', run: lazy('./intraday-ui.js', 'openIntradaySettings') },
    ] },
    { label: 'Window', items: () => [
      { label: 'New sheet', run: () => app.sheetManager.add() },
      { label: 'Rename this sheet…', run: () => app.sheetManager.rename(sheet().id) },
      { label: 'Close this sheet', run: () => { if (ws().sheets.length > 1) app.sheetManager.remove(sheet().id); else toast('This is the only sheet.'); } },
      '-', ...sheetItems(),
    ] },
  ];
}

export function initMenuBar(rootId, api) {
  const root = document.getElementById(rootId); if (!root) return;
  const menus = buildMenus(api); let panel = null, openBtn = null;
  import('./sync-ui.js').then((m) => m.newDeviceHint()).catch(() => { /* a hint only */ });
  const close = () => { if (panel) panel.remove(); panel = null; if (openBtn) openBtn.classList.remove('bg-slate-700'); openBtn = null; };
  const rowOf = (it, depth, done) => {
    const dis = typeof it.disabled === 'function' ? it.disabled() : !!it.disabled;
    const r = el('button', 'w-full text-left py-2 pr-3 flex items-center justify-between space-x-3 text-xs ' + (dis ? 'text-slate-600' : 'text-slate-100 active:bg-slate-700'));
    r.type = 'button'; r.style.paddingLeft = `${12 + depth * 14}px`; r.disabled = dis;
    const left = el('span', 'flex items-center space-x-2 min-w-0'); const chk = el('span', 'w-3 text-sky-400 shrink-0', it.checked && it.checked() ? '✓' : ''); left.appendChild(chk); left.appendChild(el('span', 'truncate', it.label)); r.appendChild(left);
    r.appendChild(el('span', 'text-[10px] text-slate-500 shrink-0', it.sub ? '▸' : (it.hint || '')));
    return r;
  };
  const fill = (box, items, depth) => {
    for (const it of items) {
      if (it === '-') { box.appendChild(el('div', 'my-1 border-t border-slate-700')); continue; }
      const r = rowOf(it, depth); box.appendChild(r);
      if (it.sub) {
        const subBox = el('div', 'hidden bg-slate-900/60'); fill(subBox, it.sub, depth + 1); box.appendChild(subBox);
        r.onclick = () => { const open = subBox.classList.toggle('hidden'); r.lastChild.textContent = open ? '▸' : '▾'; };
      } else r.onclick = async () => { close(); try { await it.run(); } catch (e) { console.error(e); toast('Could not do that: ' + (e.message || e)); } };
    }
  };
  menus.forEach((m) => {
    const b = el('button', 'px-3 py-1.5 text-[12px] text-slate-200 rounded active:bg-slate-700 shrink-0', m.label); b.type = 'button'; b.dataset.menu = m.label;
    b.onclick = (e) => {
      e.stopPropagation(); const same = openBtn === b; close(); if (same) return;
      openBtn = b; b.classList.add('bg-slate-700');
      panel = el('div', 'fixed z-[70] bg-slate-800 border border-slate-700 rounded shadow-xl py-1 overflow-y-auto'); panel.dataset.menuPanel = m.label;
      let items = []; try { items = m.items(); } catch (err) { console.error(err); }
      fill(panel, items, 0); document.body.appendChild(panel);
      const r = b.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 8);
      panel.style.width = `${w}px`; panel.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - w - 4))}px`; panel.style.top = `${r.bottom + 2}px`; panel.style.maxHeight = `${window.innerHeight - r.bottom - 10}px`;
    };
    root.appendChild(b);
  });
  document.addEventListener('pointerdown', (e) => { if (panel && !panel.contains(e.target) && !root.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')) return;
    if (e.key === 'F3') { e.preventDefault(); const i = document.getElementById('symbol-input'); if (i) { i.focus(); i.select(); } }
  });
  window.addEventListener('resize', close);
  if (!readNav()) { const n = document.getElementById('chart-nav'); if (n) n.classList.add('hidden'); }
}
