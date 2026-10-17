// Shows backtest trades on the price chart: a Buy / Sell arrow for the trade picked in the Analysis trade list,
// or for every trade of that symbol. The pure helpers here are used by chart-engine.js; the small bar on top of the chart is built by mountTradeBar().
import { el } from './ui.js';

/** What the chart is showing: which symbol, its trades, which one is picked, and "one" or "all". */
// kind 'trades' = backtest trades; kind 'signals' = scan / exploration events [{ date, kind: buy|sell|short|cover|hit, price }] (then "trades" holds those events).
export const tradeState = { kind: 'trades', symbol: '', trades: [], index: 0, mode: 'one', focus: false, onBack: null };

const GREEN = '#22c55e', RED = '#ef4444', ORANGE = '#f97316', BLUE = '#38bdf8';
const fmt = (x) => (Number.isFinite(+x) ? String(Math.round(+x * 100) / 100) : '');
const pctText = (t) => (Number.isFinite(+t.pctProfit) ? ` ${+t.pctProfit >= 0 ? '+' : ''}${(+t.pctProfit).toFixed(1)}%` : '');

/** Index of the bar a trade date belongs to, or -1. labels = the chart's bar labels ('YYYY-MM-DD' or 'YYYY-MM-DD HH:MM'). */
export function barIndex(labels, date, isExit = false) {
  const n = labels.length; if (!n || date === undefined || date === null || date === '') return -1;
  const d = String(date), intraChart = String(labels[0]).length > 10;
  if (intraChart && d.length <= 10) {                       // a daily trade on an intraday chart: first bar of the day in, last bar of the day out
    let lo = 0, hi = n - 1, ans = -1;
    if (isExit) { const key = d + ' 24:00'; while (lo <= hi) { const m = (lo + hi) >> 1; if (String(labels[m]) <= key) { ans = m; lo = m + 1; } else hi = m - 1; } return ans >= 0 && String(labels[ans]).slice(0, 10) === d ? ans : -1; }
    while (lo <= hi) { const m = (lo + hi) >> 1; if (String(labels[m]) >= d) { ans = m; hi = m - 1; } else lo = m + 1; }
    return ans >= 0 && String(labels[ans]).slice(0, 10) === d ? ans : -1;
  }
  const key = intraChart ? d : d.slice(0, 10);              // else: the bar that contains the date (weekly / monthly bars too)
  let lo = 0, hi = n - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (String(labels[m]) <= key) { ans = m; lo = m + 1; } else hi = m - 1; }
  if (ans < 0) return -1;
  return ans;
}

/** Trades -> arrows: [{ idx, position, shape, color, text, size }] sorted by bar. mode 'one' = only trades[index], 'all' = every trade. */
export function tradeMarkers(labels, trades, { mode = 'one', index = 0 } = {}) {
  const out = [], list = mode === 'all' ? trades.map((t, i) => [t, i]) : (trades[index] ? [[trades[index], index]] : []);
  for (const [t, i] of list) {
    const sel = i === index, size = sel ? 2 : 1, short = String(t.trade).toLowerCase() === 'short';
    const ei = barIndex(labels, t.entryDate, false);
    if (ei >= 0) out.push({ idx: ei, position: short ? 'aboveBar' : 'belowBar', shape: short ? 'arrowDown' : 'arrowUp', color: short ? ORANGE : GREEN, size, text: sel || mode === 'one' ? `${short ? 'Short' : 'Buy'} ${fmt(t.entryPrice)}` : '' });
    if (!t.open) {
      const xi = barIndex(labels, t.exitDate, true);
      if (xi >= 0) out.push({ idx: xi, position: short ? 'belowBar' : 'aboveBar', shape: short ? 'arrowUp' : 'arrowDown', color: short ? BLUE : RED, size, text: sel || mode === 'one' ? `${short ? 'Cover' : 'Sell'} ${fmt(t.exitPrice)}${pctText(t)}` : '' });
    }
  }
  return out.sort((a, b) => a.idx - b.idx);
}

const SIG = { buy: ['Buy', 'arrowUp', 'belowBar', GREEN], sell: ['Sell', 'arrowDown', 'aboveBar', RED], short: ['Short', 'arrowDown', 'aboveBar', ORANGE], cover: ['Cover', 'arrowUp', 'belowBar', BLUE], hit: ['Hit', 'arrowUp', 'belowBar', BLUE] };
/** Scan / exploration events -> arrows. A scan row can hold several signals ("Buy+Sell"); each gets its own arrow. */
export function signalMarkers(labels, events, { mode = 'one', index = 0 } = {}) {
  const out = [], list = mode === 'all' ? events.map((e, i) => [e, i]) : (events[index] ? [[events[index], index]] : []);
  for (const [e, i] of list) {
    const idx = barIndex(labels, e.date, false); if (idx < 0) continue;
    const [name, shape, position, color] = SIG[e.kind] || SIG.hit, sel = i === index;
    out.push({ idx, position, shape, color, size: sel ? 2 : 1, text: sel || mode === 'one' ? `${name}${Number.isFinite(+e.price) ? ' ' + fmt(e.price) : ''}` : '' });
  }
  return out.sort((a, b) => a.idx - b.idx);
}

/** The bar range worth showing for one trade (a little room on both sides), or null. */
export function tradeSpan(labels, t) {
  if (t && t.date !== undefined && t.entryDate === undefined) { const i = barIndex(labels, t.date, false); return i < 0 ? null : { from: Math.max(0, i - 40), to: Math.min(labels.length - 1, i + 40) + 4 }; }
  const ei = barIndex(labels, t.entryDate, false); if (ei < 0) return null;
  let xi = t.open ? labels.length - 1 : barIndex(labels, t.exitDate, true); if (xi < ei) xi = ei;
  const pad = Math.max(15, Math.round((xi - ei) * 0.5));
  return { from: Math.max(0, ei - pad), to: Math.min(labels.length - 1, xi + pad) + 4 };
}

/**
 * The strip on top of the chart: trade n of m, previous / next, "This trade | All trades", back to the results, close.
 * api: { refresh(): redraw the chart, hide(): drop the markers }.
 */
export function mountTradeBar(parent, api) {
  let bar = document.getElementById('trade-bar');
  if (!bar) { bar = el('div', 'absolute top-1 left-1 right-1 z-30 flex flex-wrap items-center gap-1 rounded border border-slate-700 bg-slate-900/95 px-2 py-1 text-[11px] text-slate-200'); bar.id = 'trade-bar'; parent.appendChild(bar); }
  const btn = (txt, title, fn, on) => { const b = el('button', 'px-2 py-0.5 rounded border ' + (on ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-200'), txt); b.type = 'button'; b.title = title; b.onclick = fn; return b; };
  const draw = (visible = true) => {
    bar.innerHTML = ''; const s = tradeState;
    if (!visible || !s.symbol || !s.trades.length) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    const t = s.trades[s.index] || s.trades[0], n = s.trades.length;
    bar.appendChild(el('span', 'font-semibold text-slate-100', s.symbol));
    const sig = s.kind === 'signals', noun = sig ? 'signal' : 'trade';
    bar.appendChild(el('span', 'text-slate-400', s.mode === 'all' ? `all ${n} ${noun}${n === 1 ? '' : 's'}` : `${noun} ${s.index + 1} of ${n}`));
    if (sig) bar.appendChild(el('span', 'text-sky-300', `${(SIG[t.kind] || SIG.hit)[0]} ${t.date}${Number.isFinite(+t.price) ? ' @ ' + fmt(t.price) : ''}`));
    else bar.appendChild(el('span', Number(t.profit) >= 0 ? 'text-green-400' : 'text-red-400', `${t.trade} ${t.entryDate} → ${t.open ? 'open' : t.exitDate}${pctText(t)}`));
    const go = (d) => { s.index = (s.index + d + n) % n; s.focus = true; api.refresh(); draw(); };
    bar.appendChild(btn('◀', 'Previous trade', () => go(-1))); bar.appendChild(btn('▶', 'Next trade', () => go(1)));
    bar.appendChild(btn(sig ? 'This one' : 'This trade', 'Show only the one you picked', () => { s.mode = 'one'; s.focus = true; api.refresh(); draw(); }, s.mode === 'one'));
    bar.appendChild(btn(sig ? 'All signals' : 'All trades', 'Show every one of this symbol', () => { s.mode = 'all'; api.refresh(); draw(); }, s.mode === 'all'));
    if (s.onBack) bar.appendChild(btn('Results', 'Back to the Analysis window', () => s.onBack()));
    bar.appendChild(btn('✕', 'Remove the arrows', () => { s.symbol = ''; s.trades = []; api.hide(); draw(false); }));
  };
  return { draw, el: bar };
}
