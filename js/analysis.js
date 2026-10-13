// Analysis window (AmiBroker's Analysis): Scan, Exploration, Backtest, Optimization for any formula.
import { el, openModal, toast, labeled, BTN, BTN_PRIMARY, INPUT } from './ui.js';
import { formulaStore } from './formula-store.js';
import { host } from './host.js';
import { chartEngine } from './chart-engine.js';
import { pseudoStore } from './pseudo-store.js';
import { colorToHex } from './afl-engine.js';
import { makeSession, scan, explore, backtest, optimize, buildBreadth, toCSV, METRICS } from './analysis-core.js';

const MODES = { scan: 'Scan', explore: 'Explore', backtest: 'Backtest', optimize: 'Optimize' };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : x === Infinity ? '∞' : '-');
const money = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-IN') : '-');

function table(cols, rows, { onRow = null, max = 500 } = {}) {
  const wrap = el('div', 'overflow-auto max-h-72 border border-slate-800 rounded');
  const t = el('table', 'w-full text-[11px] text-slate-200');
  const head = el('tr', 'bg-slate-800 sticky top-0');
  let sortCol = -1, asc = true, data = rows.slice();
  const body = el('tbody');
  const draw = () => {
    body.innerHTML = '';
    data.slice(0, max).forEach((r) => {
      const tr = el('tr', 'border-t border-slate-800' + (onRow ? ' active:bg-slate-700' : ''));
      r.forEach((c) => { const td = el('td', 'px-2 py-1 whitespace-nowrap', c === undefined || c === null ? '' : (typeof c === 'number' ? f2(c) : String(c))); tr.appendChild(td); });
      if (onRow) tr.onclick = () => onRow(r);
      body.appendChild(tr);
    });
  };
  cols.forEach((c, i) => {
    const th = el('th', 'px-2 py-1 text-left text-slate-400 font-semibold whitespace-nowrap', c);
    th.onclick = () => { asc = sortCol === i ? !asc : true; sortCol = i; data.sort((a, b) => { const x = a[i], y = b[i]; return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); }); draw(); };
    head.appendChild(th);
  });
  const th = el('thead'); th.appendChild(head); t.appendChild(th); t.appendChild(body); wrap.appendChild(t);
  draw();
  const box = el('div', 'space-y-1');
  box.appendChild(wrap);
  const foot = el('div', 'flex items-center justify-between text-[10px] text-slate-500');
  foot.appendChild(el('span', '', `${rows.length} row${rows.length === 1 ? '' : 's'}${rows.length > max ? ` (first ${max} shown, CSV has all)` : ''}`));
  const csv = el('button', 'underline text-sky-400', 'Download CSV'); csv.type = 'button';
  csv.onclick = () => download('analysis.csv', toCSV(cols, rows.map((r) => r.map((c) => (typeof c === 'number' ? Math.round(c * 1e6) / 1e6 : c)))));
  foot.appendChild(csv); box.appendChild(foot);
  return box;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const svgEl = (tag, attrs = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

function lineChart(series, { height = 150, fill = false, title = '' } = {}) {
  const W = 600, H = height, pad = 24;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'w-full bg-slate-950 rounded border border-slate-800' });
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (!all.length) return svg;
  const lo = Math.min(...all), hi = Math.max(...all), n = series[0].values.length, sy = (v) => H - pad / 2 - ((v - lo) / (hi - lo || 1)) * (H - pad), sx = (i) => pad + (i / Math.max(1, n - 1)) * (W - pad - 6);
  svg.appendChild(Object.assign(svgEl('text', { x: 6, y: 12, fill: '#94a3b8', 'font-size': 10 }), { textContent: title }));
  svg.appendChild(Object.assign(svgEl('text', { x: W - 6, y: 12, fill: '#64748b', 'font-size': 9, 'text-anchor': 'end' }), { textContent: `${f2(lo)} … ${f2(hi)}` }));
  for (const s of series) {
    const pts = s.values.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
    if (fill) svg.appendChild(svgEl('polygon', { points: `${sx(0)},${sy(Math.max(lo, Math.min(0, hi)))} ${pts} ${sx(n - 1)},${sy(Math.max(lo, Math.min(0, hi)))}`, fill: s.color + '33' }));
    svg.appendChild(svgEl('polyline', { points: pts, fill: 'none', stroke: s.color, 'stroke-width': 1.4 }));
  }
  return svg;
}

function scatter(name, c) {
  const W = 600, H = 220, pad = 30;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'w-full bg-slate-950 rounded border border-slate-800' });
  const pts = c.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  svg.appendChild(Object.assign(svgEl('text', { x: 6, y: 12, fill: '#94a3b8', 'font-size': 10 }), { textContent: `${name}   (x: ${c.xLabel}, y: ${c.yLabel}, ${pts.length} points)` }));
  if (!pts.length) return svg;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - pad - 8), sy = (v) => H - pad / 2 - ((v - y0) / (y1 - y0 || 1)) * (H - pad - 10);
  if (y0 < 0 && y1 > 0) svg.appendChild(svgEl('line', { x1: pad, x2: W - 8, y1: sy(0), y2: sy(0), stroke: '#334155' }));
  if (x0 < 0 && x1 > 0) svg.appendChild(svgEl('line', { y1: 16, y2: H - 8, x1: sx(0), x2: sx(0), stroke: '#334155' }));
  pts.slice(0, 3000).forEach((p) => {
    const col = colorToHex(p.color) || '#38bdf8';
    const dot = svgEl('circle', { cx: sx(p.x), cy: sy(p.y), r: 3, fill: col, 'fill-opacity': 0.8 });
    const ttl = svgEl('title'); ttl.textContent = `${p.label || ''} ${p.tip || ''} (${f2(p.x)}, ${f2(p.y)})`; dot.appendChild(ttl); svg.appendChild(dot);
  });
  return svg;
}

export function openAnalysis({ formulaId = null, mode = null } = {}) {
  openModal('Analysis', (body, close) => {
    const all = formulaStore.all();
    const fsel = el('select', INPUT + ' w-full');
    const group = (label, list) => { if (!list.length) return; const g = document.createElement('optgroup'); g.label = label; list.forEach((f) => { const o = el('option', '', f.name); o.value = f.id; g.appendChild(o); }); fsel.appendChild(g); };
    group('Systems (backtest)', all.filter((f) => f.kind === 'system'));
    group('Explorations / scans', all.filter((f) => f.kind === 'exploration'));
    group('My formulas', all.filter((f) => !f.builtin));
    group('Other formulas', all.filter((f) => f.builtin && f.kind === 'chart'));
    fsel.value = formulaId || 'b:sys-macd';
    body.appendChild(labeled('Formula', fsel));
    const edit = el('button', BTN + ' w-full', 'Edit this formula…'); edit.type = 'button';
    edit.onclick = async () => { const { openFormulaEditor } = await import('./formula-editor.js'); openFormulaEditor({ formulaId: fsel.value }); };
    body.appendChild(edit);

    // what to apply to
    const apply = el('select', INPUT + ' w-full');
    [['current', 'Current symbol only'], ['first', 'First N symbols of the database'], ['list', 'My list of symbols']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; apply.appendChild(o); });
    const nIn = el('input', INPUT + ' w-full'); nIn.type = 'number'; nIn.value = 30; nIn.min = 1; nIn.max = 3000;
    const listIn = el('input', INPUT + ' w-full'); listIn.placeholder = 'RELIANCE, TCS, INFY'; listIn.autocomplete = 'off';
    const row1 = el('div', 'grid grid-cols-2 gap-2');
    row1.appendChild(labeled('Apply to', apply)); const nWrap = labeled('N symbols / list', el('div')); nWrap.lastChild.replaceWith(nIn); row1.appendChild(nWrap);
    body.appendChild(row1);
    const toggleInputs = () => { nIn.style.display = apply.value === 'first' ? '' : 'none'; listIn.style.display = apply.value === 'list' ? '' : 'none'; };
    nWrap.appendChild(listIn); apply.onchange = toggleInputs; toggleInputs();

    const fromIn = el('input', INPUT + ' w-full'); fromIn.type = 'date';
    const toIn = el('input', INPUT + ' w-full'); toIn.type = 'date';
    const tf = el('select', INPUT + ' w-full'); [['D', 'Daily'], ['W', 'Weekly'], ['M', 'Monthly']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; tf.appendChild(o); });
    const row2 = el('div', 'grid grid-cols-3 gap-2'); row2.appendChild(labeled('From', fromIn)); row2.appendChild(labeled('To', toIn)); row2.appendChild(labeled('Time frame', tf)); body.appendChild(row2);

    // backtester settings (blank = what the formula says with SetOption / SetPositionSize)
    const adv = el('details', 'rounded border border-slate-800 p-2');
    adv.appendChild(el('summary', 'text-[11px] text-slate-400', 'Backtester settings (leave blank to use the formula\'s own)'));
    const num = (ph) => { const i = el('input', INPUT + ' w-full'); i.type = 'number'; i.placeholder = ph; i.step = 'any'; return i; };
    const sEq = num('Initial equity'), sMax = num('Max open positions'), sCom = num('Commission amount'), sSize = num('Position size');
    const sComMode = el('select', INPUT + ' w-full'); [['', 'Commission: formula'], ['0', 'None'], ['1', '% of trade value'], ['2', '₹ per trade'], ['3', '₹ per share']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; sComMode.appendChild(o); });
    const sSizeType = el('select', INPUT + ' w-full'); [['', 'Size type: formula'], ['2', '% of equity'], ['1', '₹ value'], ['4', 'Shares']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; sSizeType.appendChild(o); });
    const g2 = el('div', 'grid grid-cols-2 gap-2 pt-2'); [sEq, sMax, sComMode, sCom, sSizeType, sSize].forEach((x) => g2.appendChild(x)); adv.appendChild(g2);
    const metric = el('select', INPUT + ' w-full'); Object.entries(METRICS).forEach(([k, v]) => { const o = el('option', '', v[0]); o.value = k; metric.appendChild(o); });
    adv.appendChild(labeled('Optimize for', metric));
    const lastN = num('Signals in last N bars (scan)'); lastN.value = 1; adv.appendChild(labeled('Scan: signals within the last N bars', lastN));
    body.appendChild(adv);

    // buttons
    const btns = el('div', 'grid grid-cols-4 gap-2');
    const progress = el('div', 'text-[11px] text-slate-400 min-h-[16px]');
    const out = el('div', 'space-y-2');
    const cancel = { stop: false };
    const buttons = {};
    for (const [m, label] of Object.entries(MODES)) { const b = el('button', m === 'backtest' ? BTN_PRIMARY : BTN, label); b.type = 'button'; buttons[m] = b; btns.appendChild(b); }
    body.appendChild(btns); body.appendChild(progress);
    const stopBtn = el('button', BTN + ' hidden', 'Stop'); stopBtn.type = 'button'; stopBtn.onclick = () => { cancel.stop = true; }; body.appendChild(stopBtn);
    body.appendChild(out);

    const bre = el('button', BTN + ' w-full', 'Build market breadth (for ADLine, TRIN, STIX...)'); bre.type = 'button'; body.appendChild(bre);

    const symbolsToUse = () => {
      if (apply.value === 'current') return [host.symbol()];
      if (apply.value === 'list') return listIn.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
      return host.symbols().slice(0, Math.max(1, Number(nIn.value) || 30));
    };
    const overrides = () => {
      const o = {}, n = (v) => (v === '' ? null : Number(v));
      if (n(sEq.value) !== null) o.initialEquity = n(sEq.value);
      if (n(sMax.value) !== null) o.maxOpenPositions = n(sMax.value);
      if (sComMode.value !== '') o.commissionMode = Number(sComMode.value);
      if (n(sCom.value) !== null) o.commissionAmount = n(sCom.value);
      if (sSizeType.value !== '' || n(sSize.value) !== null) o.positionSize = { type: Number(sSizeType.value || 2), size: n(sSize.value) ?? 100 };
      return o;
    };
    const setBusy = (b) => { Object.values(buttons).forEach((x) => { x.disabled = b; x.classList.toggle('opacity-50', b); }); bre.disabled = b; stopBtn.classList.toggle('hidden', !b); };
    const onProgress = (i, n, s) => { progress.textContent = n ? `${i} / ${n}  ${s}` : ''; };

    const run = async (mode) => {
      const f = formulaStore.get(fsel.value); if (!f) { toast('Choose a formula'); return; }
      const symbols = symbolsToUse(); if (!symbols.length) { toast('No symbols to analyse'); return; }
      cancel.stop = false; out.innerHTML = ''; setBusy(true);
      const session = makeSession((s) => host.loadBars(s), tf.value);
      const common = { code: f.code, symbols, session, from: fromIn.value || null, to: toIn.value || null, onProgress, cancel };
      try {
        if (mode === 'scan') {
          const r = await scan({ ...common, lastBars: Math.max(1, Number(lastN.value) || 1) });
          showErrors(r.errors);
          if (!r.rows.length) out.appendChild(el('div', 'text-xs text-slate-400', 'No signals. A scan needs Buy / Sell / Short / Cover rules in the formula (or use Explore for Filter + AddColumn).'));
          else out.appendChild(table(['Symbol', 'Date', 'Signal', 'Close'], r.rows.map((x) => [x.symbol, x.date, x.signal, x.close]), { onRow: (row) => host.openSymbol && host.openSymbol(row[0]) }));
        } else if (mode === 'explore') {
          const r = await explore(common);
          showErrors(r.errors);
          if (!r.rows.length && !Object.keys(r.xy).length) out.appendChild(el('div', 'text-xs text-slate-400', 'Nothing passed the Filter. An exploration needs Filter = condition; and AddColumn(...).'));
          else out.appendChild(table(['Symbol', 'Date', ...r.columns], r.rows.map((x) => [x.symbol, x.date, ...r.columns.map((c) => x.values[c])]), { onRow: (row) => host.openSymbol && host.openSymbol(row[0]) }));
          for (const [name, c] of Object.entries(r.xy)) out.appendChild(scatter(name, c));
        } else if (mode === 'backtest') {
          const r = await backtest({ ...common, overrides: overrides() });
          showErrors(r.errors);
          if (r.stats) showBacktest(r, f, symbols.length);
          else out.appendChild(el('div', 'text-xs text-slate-400', 'The formula produced no trades. A backtest needs Buy and Sell (and optionally Short / Cover) rules, or PositionScore with backtestRotational.'));
        } else if (mode === 'optimize') {
          const r = await optimize({ ...common, overrides: overrides(), metric: metric.value, maxCombos: 3000 });
          showErrors(r.errors);
          if (r.rows.length) {
            const names = r.optParams.map((p) => p.name);
            out.appendChild(el('div', 'text-[11px] text-slate-400', `${r.rows.length} combinations, best first (sorted by ${METRICS[metric.value][0]}). Tap a row to run a backtest with those values.`));
            out.appendChild(table([...names, 'Net profit', 'CAGR %', 'Max DD %', 'Sharpe', 'Win %', 'Trades', 'PF'], r.rows.map((x) => [...names.map((n) => x.values[n]), x.stats.netProfit, x.stats.cagr, x.stats.maxDrawdownPct, x.stats.sharpe, x.stats.winPct, x.stats.trades, x.stats.profitFactor]),
              { onRow: async (row) => {
                const vals = {}; names.forEach((n, i) => { vals[n] = row[i]; });
                setBusy(true); out.innerHTML = '';
                const b = await backtest({ ...common, optValues: vals, overrides: overrides() });
                setBusy(false); showErrors(b.errors); if (b.stats) { out.appendChild(el('div', 'text-[11px] text-sky-300', 'Backtest with ' + JSON.stringify(vals))); showBacktest(b, f, symbols.length); }
              } }));
          }
        }
      } catch (e) { console.error(e); out.appendChild(el('div', 'text-xs text-red-300', 'Analysis failed: ' + (e.message || e))); }
      setBusy(false); onProgress(0, 0, '');
    };
    function showErrors(errors) {
      if (!errors || !errors.length) return;
      const box = el('div', 'p-2 rounded border border-amber-800 bg-amber-950/30 text-[11px] text-amber-200 max-h-24 overflow-auto');
      errors.slice(0, 8).forEach((e) => box.appendChild(el('div', '', e))); if (errors.length > 8) box.appendChild(el('div', '', `... and ${errors.length - 8} more`));
      out.appendChild(box);
    }
    function showBacktest(r, f, nSyms) {
      const s = r.stats;
      pseudoStore.setEquity(r.equityCurve); chartEngine.lastBacktestFormula = f.code;
      const grid = el('div', 'grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]');
      const kv = (k, v) => { grid.appendChild(el('div', 'text-slate-400', k)); grid.appendChild(el('div', 'text-slate-100 text-right', v)); };
      kv('Initial capital', money(s.initialCapital)); kv('Ending capital', money(s.endingCapital));
      kv('Net profit', `${money(s.netProfit)}  (${f2(s.netProfitPct)}%)`); kv('CAGR', f2(s.cagr) + '%');
      kv('Exposure', f2(s.exposure) + '%'); kv('Max drawdown', `${money(s.maxDrawdown)}  (${f2(s.maxDrawdownPct)}%)`);
      kv('Sharpe / Sortino', `${f2(s.sharpe)} / ${f2(s.sortino)}`); kv('CAR / MaxDD', f2(s.carMdd));
      kv('Profit factor', f2(s.profitFactor)); kv('Recovery factor', f2(s.recoveryFactor));
      kv('Trades', `${s.trades}  (${s.winners} win / ${s.losers} loss)`); kv('Win rate', f2(s.winPct) + '%');
      kv('Avg trade', `${money(s.avgProfit)}  (${f2(s.avgProfitPct)}%)`); kv('Avg win / avg loss', `${f2(s.avgWinPct)}% / ${f2(s.avgLossPct)}%`);
      kv('Largest win / loss', `${money(s.largestWin)} / ${money(s.largestLoss)}`); kv('Avg bars held', f2(s.avgBars));
      kv('Max consecutive wins / losses', `${s.maxConsecWins} / ${s.maxConsecLosses}`); kv('Commission paid', money(s.commissionPaid));
      const card = el('div', 'rounded border border-slate-800 p-2'); card.appendChild(grid); out.appendChild(card);
      const eq = r.equityCurve.map((p) => p.equity); let pk = -Infinity; const dd = eq.map((v) => { pk = Math.max(pk, v); return (v / pk - 1) * 100; });
      out.appendChild(lineChart([{ values: eq, color: '#38bdf8' }], { title: `Portfolio equity (${nSyms} symbol${nSyms === 1 ? '' : 's'})`, fill: true }));
      out.appendChild(lineChart([{ values: dd, color: '#ef4444' }], { title: 'Drawdown %', height: 90, fill: true }));
      const open = el('button', BTN + ' w-full', 'Open equity on a chart (symbol ~~~EQUITY)'); open.type = 'button';
      open.onclick = () => { close(); host.openSymbol('~~~EQUITY'); };
      out.appendChild(open);
      out.appendChild(el('div', 'text-[11px] text-slate-400 pt-1', 'Trades (tap a column to sort)'));
      out.appendChild(table(['Symbol', 'Trade', 'Entry date', 'Entry', 'Exit date', 'Exit', 'Shares', 'Profit', '% Profit', 'Bars', 'Exit by', 'MAE %', 'MFE %'],
        r.trades.map((t) => [t.symbol, t.trade, t.entryDate, t.entryPrice, t.exitDate, t.exitPrice, t.shares, t.profit, t.pctProfit, t.bars, t.open ? 'open' : t.reason, t.mae, t.mfe]), { onRow: (row) => host.openSymbol && host.openSymbol(row[0]) }));
    }

    Object.entries(buttons).forEach(([m, b]) => { b.onclick = () => run(m); });
    bre.onclick = async () => {
      const symbols = symbolsToUse(); cancel.stop = false; setBusy(true); out.innerHTML = '';
      const session = makeSession((s) => host.loadBars(s), 'D');
      try {
        const syms = apply.value === 'current' ? host.symbols().slice(0, 100) : symbols;
        const br = await buildBreadth({ symbols: syms, session, onProgress, cancel });
        pseudoStore.setBreadth(br.dates, br.adv, br.dec, br.unch, br.advV, br.decV);
        out.appendChild(el('div', 'text-xs text-emerald-300', `Breadth saved from ${syms.length} symbols over ${br.dates.length} days. ADLine, TRIN, STIX, Breadth Thrust ... now work. (Run again with more symbols for a broader market view.)`));
        host.relayout();
      } catch (e) { out.appendChild(el('div', 'text-xs text-red-300', 'Breadth failed: ' + e.message)); }
      setBusy(false); onProgress(0, 0, '');
    };
    if (mode && buttons[mode]) { /* user chose a mode from the menu: nothing is auto-run, they press the button */ }
  }, { big: true });
}
