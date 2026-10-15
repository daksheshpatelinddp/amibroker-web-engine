// Charts and the HTML report as plain strings (SVG / HTML), so the same code serves the screen and the exported report file. No DOM.
import { statRows, monthlyReturns, histogram } from './bt-report.js';

export const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : x === Infinity ? '∞' : '-');
export const money = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-IN') : '-');
export const fmtKind = (v, kind) => (v === undefined ? '' : kind === 'money' ? money(v) : kind === 'int' ? String(Math.round(v)) : f2(v) + (kind === 'pct' ? '%' : ''));

const W = 600;
const frame = (h, inner) => `<svg viewBox="0 0 ${W} ${h}" class="w-full" style="background:#020617;border:1px solid #1e293b;border-radius:6px" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">${inner}</svg>`;
const txt = (x, y, t, o = {}) => `<text x="${x}" y="${y}" fill="${o.fill || '#94a3b8'}" font-size="${o.size || 10}" text-anchor="${o.anchor || 'start'}">${esc(t)}</text>`;

export function svgLine(series, { height = 150, fill = false, title = '' } = {}) {
  const H = height, pad = 24, all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (!all.length) return frame(H, txt(6, 12, title));
  const lo = Math.min(...all), hi = Math.max(...all), n = Math.max(...series.map((s) => s.values.length));
  const sy = (v) => H - pad / 2 - ((v - lo) / (hi - lo || 1)) * (H - pad), sx = (i) => pad + (i / Math.max(1, n - 1)) * (W - pad - 6);
  let g = txt(6, 12, title) + txt(W - 6, 12, `${f2(lo)} … ${f2(hi)}`, { anchor: 'end', fill: '#64748b', size: 9 });
  for (const s of series) {
    const pts = s.values.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
    const base = sy(Math.max(lo, Math.min(0, hi)));
    if (fill) g += `<polygon points="${sx(0).toFixed(1)},${base.toFixed(1)} ${pts} ${sx(s.values.length - 1).toFixed(1)},${base.toFixed(1)}" fill="${s.color}33"/>`;
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width || 1.4}" ${s.opacity ? `opacity="${s.opacity}"` : ''}/>`;
  }
  return frame(H, g);
}

export function svgBars(bins, { title = '', height = 130, colorFn = (b) => (b.to <= 0 ? '#ef4444' : '#22c55e') } = {}) {
  const H = height, pad = 22; if (!bins.length) return frame(H, txt(6, 12, title));
  const mx = Math.max(...bins.map((b) => b.count)) || 1, bw = (W - pad - 6) / bins.length;
  let g = txt(6, 12, title);
  bins.forEach((b, i) => { const h = (b.count / mx) * (H - pad - 14); g += `<rect x="${(pad + i * bw + 1).toFixed(1)}" y="${(H - pad / 2 - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${colorFn(b)}"><title>${esc(`${f2(b.from)} to ${f2(b.to)}: ${b.count}`)}</title></rect>`; });
  g += txt(pad, H - 1, f2(bins[0].from), { size: 9 }) + txt(W - 6, H - 1, f2(bins[bins.length - 1].to), { size: 9, anchor: 'end' });
  return frame(H, g);
}

export function svgScatter(points, { title = '', height = 200, xLabel = 'x', yLabel = 'y', color = () => '#38bdf8' } = {}) {
  const H = height, pad = 30, pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  let g = txt(6, 12, `${title}   (x: ${xLabel}, y: ${yLabel}, ${pts.length} points)`);
  if (!pts.length) return frame(H, g);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - pad - 8), sy = (v) => H - pad / 2 - ((v - y0) / (y1 - y0 || 1)) * (H - pad - 10);
  if (y0 < 0 && y1 > 0) g += `<line x1="${pad}" x2="${W - 8}" y1="${sy(0)}" y2="${sy(0)}" stroke="#334155"/>`;
  if (x0 < 0 && x1 > 0) g += `<line y1="16" y2="${H - 8}" x1="${sx(0)}" x2="${sx(0)}" stroke="#334155"/>`;
  for (const p of pts.slice(0, 3000)) g += `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3" fill="${color(p)}" fill-opacity="0.8"><title>${esc(`${p.label || ''} ${p.tip || ''} (${f2(p.x)}, ${f2(p.y)})`)}</title></circle>`;
  g += txt(pad, H - 1, f2(x0), { size: 9 }) + txt(W - 6, H - 1, f2(x1), { size: 9, anchor: 'end' }) + txt(2, 26, f2(y1), { size: 9 }) + txt(2, H - 14, f2(y0), { size: 9 });
  return frame(H, g);
}

/** Two-parameter optimization as a heat map (AmiBroker shows a 3D chart; robust settings are broad plateaus, a single hot spot is over-fitting). */
export function svgHeat(rows, optParams, metric, { title = '' } = {}) {
  if (optParams.length !== 2 || !rows.length) return '';
  const [px, py] = optParams, xs = [...new Set(rows.map((r) => r.values[px.name]))].sort((a, b) => a - b), ys = [...new Set(rows.map((r) => r.values[py.name]))].sort((a, b) => a - b);
  const vals = rows.map((r) => r.stats[metric]).filter(Number.isFinite), lo = Math.min(...vals), hi = Math.max(...vals), H = 230, pad = 44;
  const cw = (W - pad - 10) / xs.length, ch = (H - pad - 8) / ys.length;
  let g = txt(6, 12, `${title} ${metric}: darker = lower, brighter = higher`);
  const col = (v) => { const t = hi > lo ? (v - lo) / (hi - lo) : 0.5; return `hsl(${Math.round(220 - t * 170)},70%,${Math.round(18 + t * 38)}%)`; };
  for (const r of rows) {
    const i = xs.indexOf(r.values[px.name]), j = ys.indexOf(r.values[py.name]), v = r.stats[metric];
    g += `<rect x="${(pad + i * cw).toFixed(1)}" y="${(H - pad - (j + 1) * ch).toFixed(1)}" width="${(cw - 1).toFixed(1)}" height="${(ch - 1).toFixed(1)}" fill="${Number.isFinite(v) ? col(v) : '#1e293b'}"><title>${esc(`${px.name}=${r.values[px.name]}, ${py.name}=${r.values[py.name]}: ${f2(v)}`)}</title></rect>`;
  }
  xs.forEach((x, i) => { if (xs.length <= 14 || i % Math.ceil(xs.length / 14) === 0) g += txt(pad + i * cw + cw / 2, H - pad + 12, x, { size: 8, anchor: 'middle' }); });
  ys.forEach((y, j) => { if (ys.length <= 12 || j % Math.ceil(ys.length / 12) === 0) g += txt(pad - 4, H - pad - j * ch - ch / 2 + 3, y, { size: 8, anchor: 'end' }); });
  g += txt(pad + (W - pad) / 2, H - 6, px.name, { anchor: 'middle' }) + txt(4, 24, py.name);
  return frame(H, g);
}

export function svgMonteCarlo(mc, { title = 'Monte Carlo equity' } = {}) {
  if (!mc) return '';
  const straw = mc.curves.straw.map((v) => ({ values: v, color: '#64748b', width: 0.6, opacity: 0.45 }));
  return svgLine([...straw, { values: mc.curves.max, color: '#22c55e', width: 1.2 }, { values: mc.curves.min, color: '#ef4444', width: 1.2 }, { values: mc.curves.avg, color: '#38bdf8', width: 1.8 }], { title: `${title} (${mc.runs} runs: min / average / max)`, height: 190 });
}

const heat = (v) => (v === null || v === undefined ? '' : v > 0 ? `background:rgba(34,197,94,${Math.min(0.6, 0.12 + Math.abs(v) / 25)})` : `background:rgba(239,68,68,${Math.min(0.6, 0.12 + Math.abs(v) / 25)})`);
export function monthlyHtml(curve, initial) {
  const rows = monthlyReturns(curve, initial), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!rows.length) return '';
  return `<div style="overflow:auto"><table class="rt"><tr><th>Year</th>${M.map((m) => `<th>${m}</th>`).join('')}<th>Year %</th></tr>${rows.map((r) => `<tr><td>${r.year}</td>${r.months.map((v) => `<td style="${heat(v)}">${v === null ? '' : f2(v)}</td>`).join('')}<td style="${heat(r.total)};font-weight:600">${r.total === null ? '' : f2(r.total)}</td></tr>`).join('')}</table></div>`;
}

export function mcTableHtml(mc) {
  if (!mc) return '';
  return `<table class="rt"><tr><th>Percentile</th><th>Final equity</th><th>CAR %</th><th>Max DD</th><th>Max DD %</th><th>Lowest equity</th></tr>${mc.percentiles.map((p) => `<tr><td>${p.p}%</td><td>${money(p.finalEquity)}</td><td>${f2(p.car)}</td><td>${money(p.maxDrawdown)}</td><td>${f2(p.maxDrawdownPct)}</td><td>${money(p.lowestEquity)}</td></tr>`).join('')}</table>`;
}

export function statsHtml(stats) {
  const rows = statRows(stats);
  return `<table class="rt"><tr><th>Statistic</th><th>All trades</th><th>Long</th><th>Short</th></tr>${rows.map(([l, a, lo, sh, k]) => `<tr><td>${esc(l)}</td><td>${fmtKind(a, k)}</td><td>${fmtKind(lo, k)}</td><td>${fmtKind(sh, k)}</td></tr>`).join('')}</table>`;
}

export function chartsFor(result, { distSpacing = 1 } = {}) {
  const eq = result.equityCurve.map((p) => p.equity); let pk = -Infinity; const dd = eq.map((v) => { pk = Math.max(pk, v); return pk > 0 ? (v / pk - 1) * 100 : 0; });
  const h = histogram(result.trades.map((t) => t.pctProfit), distSpacing);
  return {
    equity: svgLine([{ values: eq, color: '#38bdf8' }], { title: 'Equity', fill: true }),
    drawdown: svgLine([{ values: dd, color: '#ef4444' }], { title: 'Drawdown %', height: 100, fill: true }),
    distribution: svgBars(h.bins, { title: `Profit distribution (% per trade, bar width ${h.width}%)` }),
    mae: svgScatter(result.trades.map((t) => ({ x: t.mae, y: t.pctProfit, label: t.symbol })), { title: 'MAE vs profit', xLabel: 'MAE %', yLabel: 'profit %', color: (p) => (p.y >= 0 ? '#22c55e' : '#ef4444') }),
    mfe: svgScatter(result.trades.map((t) => ({ x: t.mfe, y: t.pctProfit, label: t.symbol })), { title: 'MFE vs profit', xLabel: 'MFE %', yLabel: 'profit %', color: (p) => (p.y >= 0 ? '#22c55e' : '#ef4444') }),
  };
}

/** A stand-alone HTML file with the whole report. */
export function reportHtml({ title = 'Backtest report', formulaName = '', code = '', result, mc = null, settings = null, includeTrades = true, meta = {} }) {
  const s = result.stats, ch = chartsFor(result, { distSpacing: settings ? settings.report.distSpacing : 1 });
  const trades = includeTrades ? `<h2>Trades</h2><div style="overflow:auto"><table class="rt"><tr>${['Symbol', 'Trade', 'Entry date', 'Entry', 'Exit date', 'Exit', 'Shares', 'Profit', '% Profit', 'Bars', 'Exit by', 'MAE %', 'MFE %'].map((h) => `<th>${h}</th>`).join('')}</tr>${result.trades.map((t) => `<tr><td>${esc(t.symbol)}</td><td>${t.trade}</td><td>${t.entryDate}</td><td>${f2(t.entryPrice)}</td><td>${t.exitDate}</td><td>${f2(t.exitPrice)}</td><td>${t.shares}</td><td style="color:${t.profit >= 0 ? '#4ade80' : '#f87171'}">${money(t.profit)}</td><td>${f2(t.pctProfit)}</td><td>${t.bars}</td><td>${t.open ? 'open' : esc(t.reason)}</td><td>${f2(t.mae)}</td><td>${f2(t.mfe)}</td></tr>`).join('')}</table></div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{background:#0b1220;color:#e2e8f0;font:13px system-ui,sans-serif;margin:0;padding:16px;max-width:900px;margin:auto}h1{font-size:18px}h2{font-size:14px;margin:18px 0 6px;color:#93c5fd}
.rt{border-collapse:collapse;width:100%;font-size:12px}.rt th,.rt td{border:1px solid #1e293b;padding:3px 6px;text-align:right;white-space:nowrap}.rt th{background:#1e293b;color:#94a3b8}.rt td:first-child,.rt th:first-child{text-align:left}
pre{background:#020617;border:1px solid #1e293b;padding:8px;overflow:auto;font-size:11px}svg{width:100%;margin:4px 0}.muted{color:#94a3b8}</style></head><body>
<h1>${esc(title)}</h1><div class="muted">${esc(formulaName)} · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${meta.symbols ? '· ' + meta.symbols + ' symbols' : ''} ${meta.range ? '· ' + esc(meta.range) : ''}</div>
<h2>Statistics</h2>${statsHtml(s)}<h2>Charts</h2>${ch.equity}${ch.drawdown}${ch.distribution}${ch.mae}${ch.mfe}
<h2>Monthly returns %</h2>${monthlyHtml(result.equityCurve, s.initialCapital)}${mc ? `<h2>Monte Carlo (${mc.runs} runs)</h2>${svgMonteCarlo(mc)}${mcTableHtml(mc)}` : ''}${trades}
${code ? `<h2>Formula</h2><pre>${esc(code)}</pre>` : ''}${settings ? `<h2>Settings</h2><pre>${esc(JSON.stringify(settings, null, 1))}</pre>` : ''}</body></html>`;
}
