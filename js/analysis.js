// Analysis window (AmiBroker's Analysis): Scan, Explore, Backtest (portfolio / individual), Optimize, Walk-Forward, with Apply to / Filter,
// Range, Settings, Projects and Results / Report / Charts / Info tabs. The engine is in analysis-core.js (no DOM).
import { el, openModal, toast, labeled, BTN, BTN_PRIMARY, INPUT } from './ui.js';
import { formulaStore } from './formula-store.js';
import { host } from './host.js';
import { chartEngine } from './chart-engine.js';
import { pseudoStore } from './pseudo-store.js';
import { categoryStore, TYPES } from './category-store.js';
import { makeSession, scan, explore, backtest, optimize, walkForward, buildBreadth, resolveSymbols, toCSV, METRICS } from './analysis-core.js';
import { monteCarlo } from './bt-report.js';
import { loadSettings } from './analysis-settings.js';
import { loadConfig as loadIntradayConfig, saveConfig as saveIntradayConfig, frameId, frameName, frameMinutes, isIntraday } from './intraday.js';
import { openCustomFrame } from './intraday-ui.js';
import { esc, f2, money, svgLine, svgScatter, svgHeat, svgMonteCarlo, monthlyHtml, mcTableHtml, statsHtml, chartsFor, reportHtml } from './report-charts.js';

const MODES = { scan: 'Scan', explore: 'Explore', backtest: 'Backtest', optimize: 'Optimize', walk: 'Walk-Forward' };
const LAST_KEY = 'aa_last_v1', PROJ_KEY = 'aa_projects_v1';
const ls = () => { try { return localStorage; } catch (e) { return null; } };
const readJson = (k, d) => { try { return JSON.parse(ls().getItem(k)) || d; } catch (e) { return d; } };
const writeJson = (k, v) => { try { ls().setItem(k, JSON.stringify(v)); } catch (e) {} };

function ensureCss() {
  if (document.getElementById('aa-css')) return;
  const s = document.createElement('style'); s.id = 'aa-css';
  s.textContent = '.rt{border-collapse:collapse;width:100%;font-size:11px;color:#e2e8f0}.rt th,.rt td{border:1px solid #1e293b;padding:2px 6px;text-align:right;white-space:nowrap}.rt th{background:#1e293b;color:#94a3b8;font-weight:600}.rt td:first-child,.rt th:first-child{text-align:left}';
  document.head.appendChild(s);
}
function download(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const cellText = (c) => (c && typeof c === 'object' ? c.text : c === undefined || c === null ? '' : typeof c === 'number' ? f2(c) : String(c));
const cellVal = (c) => (c && typeof c === 'object' ? c.v : c);

/** Sortable result list. Cells are values or {text, v, fg, bg}. Rows can be tapped (onRow). */
function table(cols, rows, { onRow = null, max = 500, extraRows = [], csvName = 'analysis.csv' } = {}) {
  const wrap = el('div', 'overflow-auto max-h-80 border border-slate-800 rounded');
  const t = el('table', 'w-full text-[11px] text-slate-200'), head = el('tr', 'bg-slate-800 sticky top-0');
  let sortCol = -1, asc = true; const data = rows.slice(), body = el('tbody');
  const draw = () => {
    body.innerHTML = '';
    data.slice(0, max).forEach((r) => {
      const tr = el('tr', 'border-t border-slate-800' + (onRow ? ' active:bg-slate-700' : ''));
      r.forEach((c) => { const td = el('td', 'px-2 py-1 whitespace-nowrap', cellText(c)); if (c && typeof c === 'object') { if (c.fg) td.style.color = c.fg; if (c.bg) td.style.background = c.bg; } tr.appendChild(td); });
      if (onRow) tr.onclick = () => onRow(r.map(cellVal));
      body.appendChild(tr);
    });
    extraRows.forEach((r) => { const tr = el('tr', 'border-t border-slate-700 bg-slate-900 font-semibold'); r.forEach((c) => tr.appendChild(el('td', 'px-2 py-1 whitespace-nowrap', c))); body.appendChild(tr); });
  };
  cols.forEach((c, i) => {
    const th = el('th', 'px-2 py-1 text-left text-slate-400 font-semibold whitespace-nowrap', c);
    th.onclick = () => { asc = sortCol === i ? !asc : true; sortCol = i; data.sort((a, b) => { const x = cellVal(a[i]), y = cellVal(b[i]); return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); }); draw(); };
    head.appendChild(th);
  });
  const th = el('thead'); th.appendChild(head); t.appendChild(th); t.appendChild(body); wrap.appendChild(t); draw();
  const box = el('div', 'space-y-1'); box.appendChild(wrap);
  const foot = el('div', 'flex items-center justify-between text-[10px] text-slate-500');
  foot.appendChild(el('span', '', `${rows.length} row${rows.length === 1 ? '' : 's'}${rows.length > max ? ` (first ${max} shown, CSV has all)` : ''}`));
  const csv = el('button', 'underline text-sky-400', 'Download CSV'); csv.type = 'button';
  csv.onclick = () => download(csvName, toCSV(cols, rows.map((r) => r.map(cellText))));
  foot.appendChild(csv); box.appendChild(foot); return box;
}
const html = (s, cls = '') => { const d = el('div', cls); d.innerHTML = s; return d; };

// ------------------------------------------------------------------ Filter dialog
function openFilter(filter, onOk) {
  const st = categoryStore(), all = host.symbols();
  const f = { include: [...(filter.include || [])], exclude: [...(filter.exclude || [])], names: filter.names || '', typed: filter.typed || '', limit: filter.limit || 0 };
  openModal('Filter: which symbols', (b, close) => {
    b.appendChild(el('div', 'text-[11px] text-slate-400', 'Include: only symbols in the ticked lists (nothing ticked = all). Exclude: symbols in the ticked lists are removed. Make lists in Tools > Symbols · Categories · Watchlists.'));
    const section = (title, arr) => {
      const box = el('div', 'space-y-1'); box.appendChild(el('div', 'text-xs font-semibold text-slate-200', `${title} (${arr.length} ticked)`));
      for (const t of TYPES) {
        const opts = st.options(all, { withEmpty: false, types: [t.id] }); if (!opts.length || t.id === 'all') continue;
        const d = document.createElement('details'); d.className = 'rounded border border-slate-800'; const sm = el('summary', 'px-2 py-1 text-[11px] text-slate-300', `${t.label} (${opts.length})`); d.appendChild(sm);
        const list = el('div', 'max-h-40 overflow-y-auto'); opts.forEach((o) => {
          const row = el('label', 'flex items-center space-x-2 px-2 py-1 border-t border-slate-800'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = arr.includes(o.key);
          c.onchange = () => { const i = arr.indexOf(o.key); if (c.checked && i < 0) arr.push(o.key); if (!c.checked && i >= 0) arr.splice(i, 1); sm.parentNode.parentNode.firstChild.textContent = `${title} (${arr.length} ticked)`; };
          row.appendChild(c); row.appendChild(el('span', 'text-xs text-slate-200', `${o.name} (${o.count})`)); list.appendChild(row);
        });
        d.appendChild(list); if (opts.some((o) => arr.includes(o.key))) d.open = true; box.appendChild(d);
      }
      if (box.childNodes.length === 1) box.appendChild(el('div', 'text-[11px] text-slate-500', 'No lists with symbols yet.'));
      return box;
    };
    b.appendChild(section('Include', f.include)); b.appendChild(section('Exclude', f.exclude));
    const nm = el('input', INPUT + ' w-full'); nm.placeholder = 'e.g. RELI*, *BANK'; nm.value = f.names; nm.onchange = () => { f.names = nm.value; };
    const ty = el('input', INPUT + ' w-full'); ty.placeholder = 'extra symbols: TCS, INFY'; ty.value = f.typed; ty.onchange = () => { f.typed = ty.value; };
    const li = el('input', INPUT + ' w-full'); li.type = 'number'; li.min = 0; li.value = f.limit; li.onchange = () => { f.limit = Number(li.value) || 0; };
    b.appendChild(labeled('Only names matching (* and ? allowed)', nm)); b.appendChild(labeled('Also add these symbols', ty)); b.appendChild(labeled('Limit to the first N (0 = no limit)', li));
    const info = el('div', 'text-[11px] text-emerald-300'); b.appendChild(info);
    const upd = () => { f.names = nm.value; f.typed = ty.value; f.limit = Number(li.value) || 0; info.textContent = `${resolveSymbols({ apply: 'filter', all, filter: f, store: st }).symbols.length} symbols match`; };
    [nm, ty, li].forEach((x) => { x.oninput = upd; }); b.addEventListener('change', upd); upd();
    const row = el('div', 'flex space-x-2'); const ok = el('button', BTN_PRIMARY + ' flex-1', 'OK'); ok.type = 'button'; ok.onclick = () => { upd(); onOk(f); close.force(); };
    const clr = el('button', BTN, 'Clear'); clr.type = 'button'; clr.onclick = () => { onOk({ include: [], exclude: [], names: '', typed: '', limit: 0 }); close.force(); };
    row.appendChild(ok); row.appendChild(clr); b.appendChild(row);
  }, { big: true, stack: true });
}

// ------------------------------------------------------------------ Projects (like AmiBroker's .apx files)
function openProjects(getState, applyState) {
  openModal('Analysis projects', (b, close) => {
    b.appendChild(el('div', 'text-[11px] text-slate-400', 'A project remembers the formula, Apply to / Filter, range, time frame and settings, like AmiBroker\'s .apx file.'));
    const list = el('div', 'space-y-1'), draw = () => {
      list.innerHTML = ''; const all = readJson(PROJ_KEY, {});
      Object.keys(all).sort().forEach((name) => {
        const r = el('div', 'flex items-center space-x-1'); const o = el('button', BTN + ' flex-1 text-left', name); o.type = 'button'; o.onclick = () => { applyState(all[name]); toast(`Loaded "${name}"`); close.force(); };
        const x = el('button', 'px-2 text-slate-500', '✕'); x.type = 'button'; x.onclick = () => { if (confirm(`Delete project "${name}"?`)) { delete all[name]; writeJson(PROJ_KEY, all); draw(); } };
        const ex = el('button', 'px-2 text-sky-400 text-[11px]', 'export'); ex.type = 'button'; ex.onclick = () => download(`${name}.analysis.json`, JSON.stringify(all[name], null, 1), 'application/json');
        r.appendChild(o); r.appendChild(ex); r.appendChild(x); list.appendChild(r);
      });
      if (!list.childNodes.length) list.appendChild(el('div', 'text-[11px] text-slate-500 py-2', 'No saved projects yet.'));
    };
    draw(); b.appendChild(list);
    const nm = el('input', INPUT + ' w-full'); nm.placeholder = 'Name for the current setup';
    const row = el('div', 'flex space-x-2'); const sv = el('button', BTN_PRIMARY + ' flex-1', 'Save current'); sv.type = 'button';
    sv.onclick = () => { const n = nm.value.trim(); if (!n) { toast('Type a name'); return; } const all = readJson(PROJ_KEY, {}); all[n] = getState(); writeJson(PROJ_KEY, all); nm.value = ''; draw(); toast('Saved'); };
    const im = el('button', BTN, 'Import…'); im.type = 'button';
    im.onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { try { const f = i.files[0], d = JSON.parse(await f.text()); const all = readJson(PROJ_KEY, {}); all[f.name.replace(/\.analysis\.json$|\.json$/, '')] = d; writeJson(PROJ_KEY, all); draw(); } catch (e) { toast('Not a project file'); } }; i.click(); };
    row.appendChild(sv); row.appendChild(im); b.appendChild(nm); b.appendChild(row);
  }, { stack: true });
}

// ------------------------------------------------------------------ main window
export function openAnalysis({ formulaId = null } = {}) {
  ensureCss();
  openModal('Analysis', (body, close) => {
    const last = readJson(LAST_KEY, {});
    const st = { apply: last.apply || 'current', filter: last.filter || { include: [], exclude: [], names: '', typed: '', limit: 0 }, range: last.range || { mode: 'all', n: 1, from: '', to: '' }, tf: last.tf || 'D', bt: last.bt || 'portfolio', formulaId: formulaId || last.formulaId || 'b:sys-macd' };
    let S = loadSettings();

    // ---- formula
    const all = formulaStore.all(), fsel = el('select', INPUT + ' w-full');
    const group = (label, list) => { if (!list.length) return; const g = document.createElement('optgroup'); g.label = label; list.forEach((f) => { const o = el('option', '', f.name); o.value = f.id; g.appendChild(o); }); fsel.appendChild(g); };
    group('Systems (backtest)', all.filter((f) => f.kind === 'system')); group('Explorations / scans', all.filter((f) => f.kind === 'exploration'));
    group('My formulas', all.filter((f) => !f.builtin)); group('Other formulas', all.filter((f) => f.builtin && f.kind === 'chart'));
    fsel.value = all.some((f) => f.id === st.formulaId) ? st.formulaId : 'b:sys-macd';
    const edit = el('button', BTN + ' !px-2', 'Edit'); edit.type = 'button'; edit.onclick = async () => { const { openFormulaEditor } = await import('./formula-editor.js'); openFormulaEditor({ formulaId: fsel.value }); };
    const frow = el('div', 'flex space-x-2 items-end'); const fw = labeled('Formula', fsel); fw.classList.add('flex-1'); frow.appendChild(fw); frow.appendChild(edit); body.appendChild(frow);

    // ---- apply to / filter / range / time frame
    const apply = el('select', INPUT + ' w-full'); [['all', 'All symbols'], ['current', 'Current symbol'], ['filter', 'Filter…']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; apply.appendChild(o); }); apply.value = st.apply;
    const fbtn = el('button', BTN + ' !px-2', 'Filter…'); fbtn.type = 'button'; const info = el('div', 'text-[10px] text-slate-400');
    const symbols = () => resolveSymbols({ apply: apply.value, current: host.symbol(), all: host.symbols(), filter: st.filter, store: categoryStore(), maxSymbols: S.general.maxSymbols });
    const refreshInfo = () => { fbtn.style.display = apply.value === 'filter' ? '' : 'none'; const r = symbols(); info.textContent = `${r.symbols.length} symbol${r.symbols.length === 1 ? '' : 's'}${r.capped ? ` (limited to ${S.general.maxSymbols}, see Settings > General)` : ''}`; };
    apply.onchange = () => { st.apply = apply.value; refreshInfo(); if (apply.value === 'filter' && !st.filter.include.length && !st.filter.exclude.length && !st.filter.names && !st.filter.typed) fbtn.click(); };
    fbtn.onclick = () => openFilter(st.filter, (f) => { st.filter = f; apply.value = 'filter'; refreshInfo(); });
    const arow = el('div', 'flex space-x-2 items-end'); const aw = labeled('Apply to', apply); aw.classList.add('flex-1'); arow.appendChild(aw); arow.appendChild(fbtn); body.appendChild(arow); body.appendChild(info);

    const rmode = el('select', INPUT + ' w-full'); [['all', 'All quotations'], ['bars', 'N recent bars'], ['days', 'N recent days'], ['dates', 'From – To dates']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; rmode.appendChild(o); }); rmode.value = st.range.mode;
    const rn = el('input', INPUT + ' w-full'); rn.type = 'number'; rn.min = 1; rn.value = st.range.n || 1;
    const rf = el('input', INPUT + ' w-full'); rf.type = 'date'; rf.value = st.range.from || ''; const rt = el('input', INPUT + ' w-full'); rt.type = 'date'; rt.value = st.range.to || '';
    const tf = el('select', INPUT + ' w-full'); const fillTf = (cur) => {
      tf.innerHTML = '';
      const ids = loadIntradayConfig().frames.map(frameId); if (isIntraday(cur) && !ids.includes(cur)) ids.push(cur);
      [['D', 'Daily'], ['W', 'Weekly'], ['M', 'Monthly'], ['Q', 'Quarterly'], ['Y', 'Yearly'], ...ids.sort((a, b) => frameMinutes(a) - frameMinutes(b)).map((id) => [id, frameName(id) + ' (intraday)']), ['__custom', 'Custom intraday…']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; tf.appendChild(o); });
      tf.value = cur;
    };
    fillTf(st.tf); let tfPrev = st.tf;
    tf.addEventListener('change', () => { if (tf.value === '__custom') { const back = tfPrev; fillTf(back); openCustomFrame((id, keep) => { if (keep) { const c = loadIntradayConfig(); saveIntradayConfig({ ...c, frames: [...new Set([...c.frames, frameMinutes(id)])] }); host.refreshTimeframes(); } tfPrev = id; fillTf(id); save(); }, back); } else tfPrev = tf.value; });
    const rbox = el('div', 'grid grid-cols-2 gap-2'); const rv = () => { rn.parentNode.style.display = ['bars', 'days'].includes(rmode.value) ? '' : 'none'; rf.parentNode.style.display = rt.parentNode.style.display = rmode.value === 'dates' ? '' : 'none'; };
    rbox.appendChild(labeled('Range', rmode)); rbox.appendChild(labeled('Time frame (periodicity)', tf)); rbox.appendChild(labeled('N', rn)); rbox.appendChild(labeled('From', rf)); rbox.appendChild(labeled('To', rt));
    rmode.onchange = rv; rv(); body.appendChild(rbox);
    const rangeNow = () => ({ mode: rmode.value, n: Number(rn.value) || 1, from: rf.value || null, to: rt.value || null });

    // ---- buttons
    const btSel = el('select', INPUT); [['portfolio', 'Portfolio backtest'], ['individual', 'Individual backtest']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; btSel.appendChild(o); }); btSel.value = st.bt;
    const buttons = {}, bgrid = el('div', 'grid grid-cols-3 gap-2');
    for (const [m, label] of Object.entries(MODES)) { const x = el('button', m === 'backtest' ? BTN_PRIMARY : BTN, label); x.type = 'button'; buttons[m] = x; bgrid.appendChild(x); }
    const setBtn = el('button', BTN, 'Settings…'); setBtn.type = 'button'; setBtn.onclick = async () => { const m = await import('./analysis-settings-ui.js'); m.openAnalysisSettings({ onSave: (s) => { S = s; refreshInfo(); } }); };
    bgrid.appendChild(setBtn); body.appendChild(bgrid);
    const row2 = el('div', 'flex space-x-2'); row2.appendChild(btSel);
    const proj = el('button', BTN, 'Projects…'); proj.type = 'button'; row2.appendChild(proj);
    const bre = el('button', BTN, 'Market breadth'); bre.type = 'button'; bre.title = 'Build advancing / declining issues for ADLine, TRIN...'; row2.appendChild(bre); body.appendChild(row2);
    const progress = el('div', 'text-[11px] text-slate-400 min-h-[16px]'); body.appendChild(progress);
    const stopBtn = el('button', BTN + ' hidden', 'Stop'); stopBtn.type = 'button'; const cancel = { stop: false }; stopBtn.onclick = () => { cancel.stop = true; }; body.appendChild(stopBtn);

    // ---- results area
    const tabsBar = el('div', 'flex space-x-1 hidden'), pane = el('div', 'space-y-2'); body.appendChild(tabsBar); body.appendChild(pane);
    let R = null, tab = 'Results';
    const save = () => writeJson(LAST_KEY, { apply: apply.value, filter: st.filter, range: rangeNow(), tf: tf.value, bt: btSel.value, formulaId: fsel.value });
    const getState = () => ({ formulaId: fsel.value, apply: apply.value, filter: st.filter, range: rangeNow(), tf: tf.value, bt: btSel.value, settings: loadSettings() });
    const applyState = (p) => {
      if (p.formulaId && all.some((f) => f.id === p.formulaId)) fsel.value = p.formulaId; st.apply = apply.value = p.apply || 'all'; st.filter = p.filter || st.filter; const r = p.range || { mode: 'all' };
      rmode.value = r.mode || 'all'; rn.value = r.n || 1; rf.value = r.from || ''; rt.value = r.to || ''; tfPrev = p.tf || 'D'; fillTf(tfPrev); btSel.value = p.bt || 'portfolio'; rv();
      if (p.settings) { import('./analysis-settings.js').then((m) => { m.saveSettings(p.settings); S = p.settings; refreshInfo(); }); } refreshInfo();
    };
    proj.onclick = () => openProjects(getState, applyState);
    refreshInfo();

    const setProgress = (i, n, s) => { progress.textContent = n ? `${i} / ${n}  ${s}` : ''; };
    const setBusy = (b) => { Object.values(buttons).forEach((x) => { x.disabled = b; x.classList.toggle('opacity-50', b); }); bre.disabled = b; stopBtn.classList.toggle('hidden', !b); };
    const errorsBox = (errors) => { if (!errors || !errors.length) return null; const box = el('div', 'p-2 rounded border border-amber-800 bg-amber-950/30 text-[11px] text-amber-200 max-h-24 overflow-auto'); errors.slice(0, 8).forEach((e) => box.appendChild(el('div', '', e))); if (errors.length > 8) box.appendChild(el('div', '', `... and ${errors.length - 8} more`)); return box; };
    const open = (sym) => host.openSymbol && host.openSymbol(sym);

    // ---- result renderers: each returns { Results, Report?, Charts?, Info }
    const infoPane = (lines, errors) => { const d = el('div', 'space-y-1 text-[11px] text-slate-300'); lines.forEach((l) => d.appendChild(el('div', '', l))); const e = errorsBox(errors); if (e) d.appendChild(e); return d; };
    const saveBtn = (syms, name) => { const u = [...new Set(syms)]; const b = el('button', BTN + ' w-full', `★ Save these ${u.length} symbols as a watchlist…`); b.type = 'button'; b.onclick = async () => { const { saveSymbolsAsWatchlist } = await import('./categories-ui.js'); await saveSymbolsAsWatchlist(u, name); }; return b; };

    function tradeListViews(r, f, nSyms) {
      const s = r.stats, mode = S.report.resultList;
      const results = el('div', 'space-y-2');
      const sum = html(`<div class="grid grid-cols-3 gap-2 text-center">${[['Net profit', `${money(s.netProfit)} (${f2(s.netProfitPct)}%)`], ['CAR / MaxDD', f2(s.carMdd)], ['Win rate', `${f2(s.winPct)}% of ${s.trades}`]].map(([k, v]) => `<div class="rounded border border-slate-800 p-1"><div class="text-[10px] text-slate-400">${k}</div><div class="text-xs text-slate-100">${v}</div></div>`).join('')}</div>`);
      results.appendChild(sum);
      if (mode === 'summary') {
        const rows = r.perSymbol ? r.perSymbol.map((p) => [p.symbol, p.stats.trades, p.stats.netProfit, p.stats.netProfitPct, p.stats.cagr, p.stats.maxDrawdownPct, p.stats.winPct, p.stats.profitFactor]) : [[`${nSyms} symbols`, s.trades, s.netProfit, s.netProfitPct, s.cagr, s.maxDrawdownPct, s.winPct, s.profitFactor]];
        results.appendChild(table(['Test', 'Trades', 'Net profit', 'Net %', 'CAGR %', 'Max DD %', 'Win %', 'PF'], rows, { onRow: (row) => r.perSymbol && open(row[0]), csvName: 'summary.csv' }));
      } else if (mode === 'detail') {
        results.appendChild(table(['Date', 'Equity', 'Cash', 'Exposure %', 'Open', 'Events'], r.equityCurve.map((c) => [c.t, c.equity, c.cash === undefined ? '' : c.cash, c.exposure, c.open, (c.events || []).join('; ')]), { csvName: 'detailed-log.csv' }));
      } else {
        results.appendChild(el('div', 'text-[11px] text-slate-400', 'Trades (tap a column to sort, tap a row to open the symbol)'));
        results.appendChild(table(['Symbol', 'Trade', 'Entry date', 'Entry', 'Exit date', 'Exit', 'Shares', 'Profit', '% Profit', 'Bars', 'Exit by', 'MAE %', 'MFE %'],
          r.trades.map((t) => [t.symbol, t.trade, t.entryDate, t.entryPrice, t.exitDate, t.exitPrice, t.shares, t.profit, t.pctProfit, t.bars, t.open ? 'open' : t.reason, t.mae, t.mfe]), { onRow: (row) => open(row[0]), csvName: 'trades.csv' }));
      }
      return results;
    }
    function reportView(r, mc) {
      const d = el('div', 'space-y-2'); d.appendChild(html(statsHtml(r.stats))); d.appendChild(el('div', 'text-xs font-semibold text-slate-200 pt-1', 'Monthly returns %')); d.appendChild(html(monthlyHtml(r.equityCurve, r.stats.initialCapital)));
      if (mc) { d.appendChild(el('div', 'text-xs font-semibold text-slate-200 pt-1', `Monte Carlo (${mc.runs} runs)`)); d.appendChild(html(svgMonteCarlo(mc))); d.appendChild(html(mcTableHtml(mc))); }
      return d;
    }
    function chartsView(r) {
      const c = chartsFor(r, { distSpacing: S.report.distSpacing }), d = el('div', 'space-y-2');
      [c.equity, c.drawdown, c.distribution, c.mae, c.mfe].forEach((x) => d.appendChild(html(x)));
      const bt = el('button', BTN + ' w-full', 'Open equity on a chart (symbol ~~~EQUITY)'); bt.type = 'button'; bt.onclick = () => { pseudoStore.setEquity(r.equityCurve); close(); host.openSymbol('~~~EQUITY'); }; d.appendChild(bt);
      return d;
    }
    const exportBtn = (r, f, mc, nSyms) => { const b = el('button', BTN + ' w-full', 'Export report (HTML)…'); b.type = 'button'; b.onclick = () => download(`${f.name.replace(/[^\w\- ]+/g, '')}-report.html`, reportHtml({ title: 'Backtest report', formulaName: f.name, code: f.code, result: r, mc, settings: S, includeTrades: S.report.includeTradeList, meta: { symbols: nSyms, range: `${rangeNow().mode}` } }), 'text/html'); return b; };

    function show(views) { R = views; if (!views[tab]) tab = 'Results'; drawTabs(); }
    function drawTabs() {
      pane.innerHTML = ''; tabsBar.innerHTML = '';
      if (!R) { tabsBar.classList.add('hidden'); return; }
      tabsBar.classList.remove('hidden');
      Object.keys(R).forEach((k) => { const t = el('button', 'px-3 py-1 rounded-t border text-[11px] ' + (k === tab ? 'bg-slate-800 border-slate-600 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'), k); t.type = 'button'; t.onclick = () => { tab = k; drawTabs(); }; tabsBar.appendChild(t); });
      const v = typeof R[tab] === 'function' ? R[tab]() : R[tab]; pane.appendChild(v);
    }

    const run = async (mode) => {
      const f = formulaStore.get(fsel.value); if (!f) { toast('Choose a formula'); return; }
      const sy = symbols(); if (!sy.symbols.length) { toast('No symbols to analyse. Choose Apply to, or add symbols to the filter.'); return; }
      if (sy.capped) toast(`Using the first ${sy.symbols.length} symbols (Settings > General > largest number of symbols)`);
      save(); cancel.stop = false; pane.innerHTML = ''; R = null; tabsBar.classList.add('hidden'); setBusy(true);
      const t0 = Date.now(), session = makeSession((s, iv) => host.loadBars(s, iv), tf.value), common = { code: f.code, symbols: sy.symbols, session, range: rangeNow(), onProgress: setProgress, cancel, settings: S };
      const infoLines = (extra = []) => [`Formula: ${f.name}`, `Action: ${MODES[mode]}`, `Symbols: ${sy.symbols.length}`, `Time frame: ${tf.value}`, `Range: ${(() => { const r = rangeNow(); return r.mode === 'all' ? 'All quotations' : r.mode === 'bars' ? 'Last ' + r.n + ' bars' : r.mode === 'days' ? 'Last ' + r.n + ' days' : 'From ' + r.from + ' to ' + r.to; })()}`, `Run time: ${((Date.now() - t0) / 1000).toFixed(1)} s`, ...extra];
      try {
        if (mode === 'scan') {
          const r = await scan({ ...common, lastBars: 1 });
          const res = r.rows.length ? (() => { const d = el('div', 'space-y-2'); d.appendChild(saveBtn(r.rows.map((x) => x.symbol), `${f.name} scan`)); d.appendChild(table(['Symbol', 'Date', 'Trade', 'Price'], r.rows.map((x) => [x.symbol, x.date, x.signal, x.price]), { onRow: (row) => open(row[0]), csvName: 'scan.csv' })); return d; })()
            : el('div', 'text-xs text-slate-400', 'No signals. A scan needs Buy / Sell / Short / Cover rules (or use Explore with Filter and AddColumn).');
          show({ Results: res, Info: infoPane(infoLines([`Signals found: ${r.rows.length}`]), r.errors) });
        } else if (mode === 'explore') {
          const r = await explore(common), t = r.table;
          const res = el('div', 'space-y-2');
          if (!t.rows.length) res.appendChild(el('div', 'text-xs text-slate-400', 'Nothing passed the Filter. An exploration needs Filter = condition; and AddColumn(...).'));
          else { res.appendChild(saveBtn(r.rows.map((x) => x.symbol), `${f.name} exploration`)); res.appendChild(table(t.head, t.rows, { extraRows: t.summary, onRow: (row) => { const k = t.head.indexOf('Ticker'); open(row[k >= 0 ? k : 0]); }, csvName: 'exploration.csv' })); }
          const views = { Results: res }; const xyNames = Object.keys(r.xy);
          if (xyNames.length) views.Charts = () => { const d = el('div', 'space-y-2'); xyNames.forEach((n) => d.appendChild(html(svgScatter(r.xy[n].points, { title: n, xLabel: r.xy[n].xLabel, yLabel: r.xy[n].yLabel })))); return d; };
          views.Info = infoPane(infoLines([`Rows: ${t.rows.length}`]), r.errors); show(views);
        } else if (mode === 'backtest') {
          const r = await backtest({ ...common, mode: btSel.value });
          if (!r.stats) { show({ Results: el('div', 'text-xs text-slate-400', 'The formula produced no trades. A backtest needs Buy and Sell (and optionally Short / Cover) rules, or PositionScore with SetBacktestMode(backtestRotational).'), Info: infoPane(infoLines(), r.errors) }); }
          else {
            pseudoStore.setEquity(r.equityCurve); chartEngine.lastBacktestFormula = f.code;
            const mc = S.monteCarlo.enable && r.trades.length > 2 ? monteCarlo({ trades: r.trades, curve: r.equityCurve, initialEquity: r.stats.initialCapital, years: r.stats.years, runs: S.monteCarlo.runs, mode: S.monteCarlo.mode, posMethod: S.monteCarlo.posMethod, posValue: S.monteCarlo.posValue, posPct: S.monteCarlo.posPct, strawLines: S.monteCarlo.strawLines }) : null;
            const res = tradeListViews(r, f, sy.symbols.length); res.appendChild(exportBtn(r, f, mc, sy.symbols.length));
            show({ Results: res, Report: () => reportView(r, mc), Charts: () => chartsView(r),
              Info: infoPane(infoLines([`Mode: ${btSel.value}`, `Symbols with data: ${r.info.symbols}`, `Bars read: ${r.info.bars}`, `Trades: ${r.trades.length}`, 'Options used:', JSON.stringify({ ...r.options, commissionTable: undefined, stops: r.options.stops.length }, null, 0)]), r.errors) });
          }
        } else if (mode === 'optimize') {
          const r = await optimize({ ...common, metric: S.optimize.target, engine: S.optimize.engine, maxEval: S.optimize.maxEval, runs: S.optimize.runs, maxCombos: 5000 });
          const views = {};
          if (!r.rows.length) views.Results = el('div', 'text-xs text-slate-400', r.errors[0] || 'No results');
          else {
            const names = r.optParams.map((p) => p.name), res = el('div', 'space-y-2');
            res.appendChild(el('div', 'text-[11px] text-slate-400', `${r.rows.length} combinations tested (${r.engine}), best first by ${METRICS[r.metric][0]}. Tap a row to run a backtest with those values.`));
            res.appendChild(table([...names, 'Net profit', 'Net %', 'CAR %', 'Max DD %', 'Trades', 'PF', 'Exposure %', 'RAR %', METRICS[r.metric][0]], r.rows.map((x) => [...names.map((n) => x.values[n]), x.stats.netProfit, x.stats.netProfitPct, x.stats.cagr, x.stats.maxDrawdownPct, x.stats.trades, x.stats.profitFactor, x.stats.exposure, x.stats.riskAdjReturn, x.stats[r.metric]]),
              { csvName: 'optimization.csv', onRow: async (row) => {
                const vals = {}; names.forEach((n, i) => { vals[n] = row[i]; }); setBusy(true);
                const b = await backtest({ ...common, optValues: vals, mode: btSel.value }); setBusy(false);
                if (b.stats) { pseudoStore.setEquity(b.equityCurve); const rr = tradeListViews(b, f, sy.symbols.length); rr.prepend(el('div', 'text-[11px] text-sky-300', 'Backtest with ' + JSON.stringify(vals))); show({ ...views, Backtest: rr, Report: () => reportView(b, null), Charts: () => chartsView(b) }); tab = 'Backtest'; drawTabs(); }
              } }));
            const best = r.rows[0]; res.appendChild(el('div', 'text-[11px] text-emerald-300', 'Best: ' + names.map((n) => `${n} = ${best.values[n]}`).join(', ') + '. Put these numbers in the formula (second argument of Optimize) to keep them.'));
            views.Results = res;
            if (r.optParams.length === 2) views.Charts = () => html(svgHeat(r.rows, r.optParams, r.metric, { title: 'Optimization map:' }));
          }
          views.Info = infoPane(infoLines([`Search: ${r.engine || ''}`, `Tested: ${r.tested || 0}`, `Target: ${METRICS[S.optimize.target][0]}`]), r.rows.length ? [] : r.errors); show(views);
        } else if (mode === 'walk') {
          const r = await walkForward({ ...common, wf: S.walkForward, metric: S.walkForward.target, engine: S.optimize.engine, maxEval: S.optimize.maxEval });
          const names = r.optParams ? r.optParams.map((p) => p.name) : [], views = {};
          if (!r.steps.length) views.Results = el('div', 'text-xs text-slate-400', r.errors[0] || 'No walk-forward steps');
          else {
            const m = S.walkForward.target, res = el('div', 'space-y-2');
            res.appendChild(el('div', 'text-[11px] text-slate-400', `Each step optimises on the in-sample period (target ${METRICS[m][0]}) and tests the best values out of sample. Equity carries over from step to step.`));
            res.appendChild(table(['Step', 'In-sample', 'Out-of-sample', ...names, `IS ${METRICS[m][0]}`, `OOS ${METRICS[m][0]}`, 'OOS net %', 'OOS trades', 'End equity'],
              r.steps.map((s) => [s.step || '-', `${s.isFrom} → ${s.isTo}`, `${s.oosFrom} → ${s.oosTo}`, ...names.map((n) => (s.values ? s.values[n] : '')), s.isStats ? s.isStats[m] : '', s.oosStats ? s.oosStats[m] : (s.error || ''), s.oosStats ? s.oosStats.netProfitPct : '', s.oosStats ? s.oosStats.trades : '', s.endEquity || '']), { csvName: 'walk-forward.csv' }));
            views.Results = res;
            if (r.stats) { pseudoStore.setEquity(r.equityCurve); views.Report = () => reportView(r, null); views.Charts = () => chartsView(r); }
          }
          views.Info = infoPane(infoLines([`Periods: ${r.segments || 0}`, 'The combined out-of-sample equity is saved as ~~~EQUITY.']), r.errors); show(views);
        }
      } catch (e) { console.error(e); pane.appendChild(el('div', 'text-xs text-red-300', 'Analysis failed: ' + (e.message || e))); }
      setBusy(false); setProgress(0, 0, '');
    };
    Object.entries(buttons).forEach(([m, b]) => { b.onclick = () => run(m); });
    bre.onclick = async () => {
      const sy = symbols().symbols; cancel.stop = false; setBusy(true); pane.innerHTML = '';
      const session = makeSession((s) => host.loadBars(s), 'D');
      try {
        const syms = apply.value === 'current' ? host.symbols().slice(0, 100) : sy, br = await buildBreadth({ symbols: syms, session, onProgress: setProgress, cancel });
        pseudoStore.setBreadth(br.dates, br.adv, br.dec, br.unch, br.advV, br.decV);
        pane.appendChild(el('div', 'text-xs text-emerald-300', `Breadth saved from ${syms.length} symbols over ${br.dates.length} days. ADLine, TRIN, STIX, Breadth Thrust ... now work. (Run again with more symbols for a broader market view.)`));
        host.relayout();
      } catch (e) { pane.appendChild(el('div', 'text-xs text-red-300', 'Breadth failed: ' + e.message)); }
      setBusy(false); setProgress(0, 0, '');
    };
  }, { big: true });
}
