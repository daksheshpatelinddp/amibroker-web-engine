// AmiBroker functions added on top of the core interpreter: indicators, status/text/variable helpers,
// foreign symbols, Plot family (cloud, gradient, XShift, VAP), backtest-related functions and XY charts.
import * as L from './afl-lib.js';
import { isArr, newArr } from './afl-lib.js';
import { singleEquity, optionsFromResult } from './bt-core.js';
import { categoryStore } from './category-store.js';
import { host } from './host.js';

const BASE_FIELDS = ['Open', 'High', 'Low', 'Close', 'Volume', 'Open Interest', 'Average'];

export function addExtras(F, E, H) {
  const { A, S, STYLE, truthy, strFormat, toStr } = H;
  const n = () => E.n;
  const bars = E.bars;
  const arrPer = (fn) => (a) => fn(A(a[0]), S(a[1]));

  // ------------------------------------------------------------------ indicators
  Object.assign(F, {
    linearreg: arrPer(L.linearReg), median: arrPer(L.median), percentrank: arrPer(L.percentRank),
    highestbars: (a) => (a.length < 2 ? cumBars(A(a[0]), true) : L.hhvBars(A(a[0]), S(a[1]))),
    lowestbars: (a) => (a.length < 2 ? cumBars(A(a[0]), false) : L.llvBars(A(a[0]), S(a[1]))),
    ama: (a) => L.ama(A(a[0]), isArr(a[1]) ? a[1] : S(a[1])),
    ama2: (a) => { const x = A(a[0]), k1 = S(a[1]), k2 = S(a[2]); const out = newArr(n()); let p = NaN; for (let i = 0; i < n(); i++) { if (Number.isNaN(x[i])) continue; p = Number.isNaN(p) ? x[i] : k1 * x[i] + k2 * p; out[i] = p; } return out; },
    accdist: () => L.accDist(E.H, E.Lw, E.C, E.V),
    chaikin: (a) => L.chaikin(E.H, E.Lw, E.C, E.V, S(a[0], 3), S(a[1], 10)),
    nvi: () => L.nvi(E.C, E.V), pvi: () => L.pvi(E.C, E.V),
    oscp: (a) => L.osc(E.C, S(a[0], 9), S(a[1], 18)), oscv: (a) => L.osc(E.V, S(a[0], 9), S(a[1], 18)),
    rmi: (a) => L.rmi(E.C, S(a[0], 20), S(a[1], 5)),
    rwi: (a) => L.rwi(E.H, E.Lw, E.C, S(a[0], 9), S(a[1], 40), 'both'),
    rwihi: (a) => L.rwi(E.H, E.Lw, E.C, S(a[0], 9), S(a[1], 40), 'hi'),
    rwilo: (a) => L.rwi(E.H, E.Lw, E.C, S(a[0], 9), S(a[1], 40), 'lo'),
    ultimate: (a) => L.ultimate(E.H, E.Lw, E.C, S(a[0], 7), S(a[1], 14), S(a[2], 28)),
    trix: (a) => L.trix(E.C, S(a[0], 9)),
    relstrength: (a) => { const b = typeof a[0] === 'string' ? foreignField(a[0], 'C') : A(a[0]); return L.relStrength(E.C, b); },
    sum: undefined,
  });
  delete F.sum; F.sum = (a) => L.sum(A(a[0]), S(a[1]));
  function cumBars(x, isMax) {
    const out = newArr(x.length); let best = NaN, at = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i]; if (!Number.isNaN(v) && (Number.isNaN(best) || (isMax ? v >= best : v <= best))) { best = v; at = i; } out[i] = Number.isNaN(best) ? NaN : i - at; }
    return out;
  }
  // arithmetic helpers AmiBroker has
  F.fmod = F.mod; F.atan2 = (a) => E.binary2(a[0], a[1], Math.atan2);
  F.asin = (a) => (isArr(a[0]) ? a[0].map(Math.asin) : Math.asin(a[0])); F.acos = (a) => (isArr(a[0]) ? a[0].map(Math.acos) : Math.acos(a[0]));
  F.sinh = (a) => (isArr(a[0]) ? a[0].map(Math.sinh) : Math.sinh(a[0])); F.cosh = (a) => (isArr(a[0]) ? a[0].map(Math.cosh) : Math.cosh(a[0]));
  F.tanh = (a) => (isArr(a[0]) ? a[0].map(Math.tanh) : Math.tanh(a[0]));
  F.exrem = (a) => { const x = A(a[0]), y = A(a[1]), out = newArr(n(), 0); let on = false; for (let i = 0; i < n(); i++) { if (on) { if (truthy(y[i])) on = false; } else if (truthy(x[i])) { on = true; out[i] = 1; } if (truthy(y[i]) && !truthy(out[i])) { /* keep */ } } return out; };
  F.exremspan = (a) => { const x = A(a[0]), span = S(a[1]), out = newArr(n(), 0); let last = -1e9; for (let i = 0; i < n(); i++) if (truthy(x[i]) && i - last > span) { out[i] = 1; last = i; } return out; };
  F.hold = (a) => { const x = A(a[0]), p = S(a[1]), out = newArr(n(), 0); let c = 0; for (let i = 0; i < n(); i++) { if (truthy(x[i])) c = p; else if (c > 0) c--; out[i] = c > 0 || truthy(x[i]) ? 1 : 0; } return out; };
  F.sumsince = (a) => { const c = A(a[0]), x = A(a[1]), out = newArr(n()); let s = NaN; for (let i = 0; i < n(); i++) { if (truthy(c[i])) s = 0; if (!Number.isNaN(s)) { s += x[i]; out[i] = s; } } return out; };
  F.cumprod = (a) => { const x = A(a[0]), out = newArr(n()); let p = 1; for (let i = 0; i < n(); i++) { p *= x[i]; out[i] = p; } return out; };
  F.nz = (a) => { const f = (x) => (Number.isNaN(x) ? (a[1] === undefined ? 0 : S(a[1])) : x); return isArr(a[0]) ? a[0].map(f) : f(a[0]); };
  F.hhvbars = F.hhvbars; F.ref = F.ref;

  // ------------------------------------------------------------------ date & time
  const parts = () => bars.t.map((d) => { const p = String(d).split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; });
  F.datetime = () => Float64Array.from(parts(), (p) => ((p.y - 1900) * 10000 + p.m * 100 + p.d) * 1e6);
  F.timenum = () => newArr(n(), 0); F.hour = () => newArr(n(), 0); F.minute = () => newArr(n(), 0); F.second = () => newArr(n(), 0);
  F.dayofyear = () => Float64Array.from(parts(), (p) => Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(p.y, 0, 1)) / 86400000) + 1);
  F.datetimetostr = (a) => {
    const f = (v) => { if (!Number.isFinite(v)) return '-'; const dn = Math.floor(v / 1e6), tn = Math.round(v - dn * 1e6); const y = Math.floor(dn / 10000) + 1900, m = Math.floor(dn / 100) % 100, d = dn % 100; const z = (x) => String(x).padStart(2, '0'); return `${y}-${z(m)}-${z(d)} ${z(Math.floor(tn / 10000))}:${z(Math.floor(tn / 100) % 100)}:${z(tn % 100)}`; };
    return f(S(a[0]));
  };
  F.now = () => Date.now() / 1000;

  // ------------------------------------------------------------------ strings & variables
  const sep = (a, k) => (a[k] === undefined ? ',' : String(a[k]));
  F.strextract = (a) => { const parts_ = String(a[0]).split(sep(a, 2)), i = S(a[1], 0); return i >= 0 && i < parts_.length ? parts_[i].trim() : ''; };
  F.strfind = (a) => String(a[0]).indexOf(String(a[1]));
  F.strmid = (a) => String(a[0]).substr(S(a[1], 0), S(a[2], 1e9));
  F.strleft = (a) => String(a[0]).slice(0, S(a[1], 0)); F.strright = (a) => String(a[0]).slice(-S(a[1], 0) || 0);
  F.strtrim = (a) => String(a[0]).trim(); F.strtoupper = (a) => String(a[0]).toUpperCase(); F.strtolower = (a) => String(a[0]).toLowerCase();
  F.strreplace = (a) => String(a[0]).split(String(a[1])).join(String(a[2]));
  F.strtonum = (a) => { const v = Number(String(a[0]).trim()); return Number.isFinite(v) ? v : NaN; };
  F.strcount = (a) => String(a[0]).split(String(a[1])).length - 1;
  F.writeif = (a) => {
    const c = a[0]; const cond = isArr(c) ? truthy(c[c.length - 1]) : truthy(c);
    return String(cond ? (a[1] === undefined ? '' : a[1]) : (a[2] === undefined ? '' : a[2]));
  };
  F.writeval = (a) => {
    const v = S(a[0]), f = a[1] === undefined ? 1.2 : S(a[1]);
    if (!Number.isFinite(v)) return '-';
    const dec = Math.round((f % 1) * 10 + 1e-9);
    const s = Number(v).toFixed(dec);
    return s;
  };
  F.printf = (a) => { E.res.text += strFormat(String(a[0]), a.slice(1)); return 0; };
  F.enabletextoutput = () => 0;
  const dyn = new Map(), stat = new Map();
  F.varset = (a) => { dyn.set(String(a[0]).toLowerCase(), a[1]); return a[1]; };
  F.varget = (a) => { const k = String(a[0]).toLowerCase(); return dyn.has(k) ? dyn.get(k) : NaN; };
  F.staticvarset = (a) => { stat.set(String(a[0]), a[1]); return 0; };
  F.staticvarget = (a) => (stat.has(String(a[0])) ? stat.get(String(a[0])) : NaN);
  F.staticvarremove = (a) => { stat.delete(String(a[0])); return 0; };
  F.isempty = (a) => (a[0] === undefined || a[0] === '' || (typeof a[0] === 'number' && Number.isNaN(a[0])) ? 1 : 0);

  // ------------------------------------------------------------------ section / names / status
  E.section = '';
  F._section_begin = (a) => { E.section = String(a[0] || ''); return E.section; };
  F._section_end = () => { E.section = ''; return 0; };
  F._section_name = () => E.section || E.opts.formulaName || '';
  F._default_name = () => E.section || E.opts.formulaName || '';
  F._param_values = () => {
    const vals = E.res.params.filter((p) => !E.section || p.section === E.section).filter((p) => ['number', 'list', 'text', 'str', 'field'].includes(p.type));
    return '(' + vals.map((p) => { const v = p.value; return p.type === 'field' ? (BASE_FIELDS[v] || p.shown || v) : toStr(v); }).join(', ') + ')';
  };
  F.getbaseindex = () => E.opts.baseIndex || 'NIFTY 50';
  F.getchartbkcolor = () => 55 * 0 + (E.opts.bgColor === undefined ? 0 : E.opts.bgColor);
  F.getpricestyle = () => ({ candle: STYLE.Candle, bar: STYLE.Bar, line: STYLE.Line, area: STYLE.Area }[E.opts.priceStyle || 'candle'] || STYLE.Candle);
  F.ticker = () => String(E.opts.symbol || '');
  F.status = (a) => {
    const k = String(a[0]).toLowerCase(), N = n(), o = E.opts;
    const first = Math.max(0, o.firstVisible || 0), last = o.lastVisible !== undefined ? o.lastVisible : N - 1;
    const flag = (idx) => { const r = newArr(N, 0); if (idx >= 0 && idx < N) r[idx] = 1; return r; };
    switch (k) {
      case 'action': return o.action || 1;
      case 'stocknum': return o.stockNum || 0;
      case 'firstvisiblebar': return first;
      case 'lastvisiblebar': return last;
      case 'barvisible': return Float64Array.from({ length: N }, (_, i) => (i >= first && i <= last ? 1 : 0));
      case 'firstbarinrange': case 'firstbarintest': return flag(o.rangeFrom || 0);
      case 'lastbarinrange': case 'lastbarintest': return flag(o.rangeTo !== undefined ? o.rangeTo : N - 1);
      case 'barinrange': case 'barintest': return Float64Array.from({ length: N }, (_, i) => (i >= (o.rangeFrom || 0) && i <= (o.rangeTo !== undefined ? o.rangeTo : N - 1) ? 1 : 0));
      case 'rangefirstbar': return o.rangeFrom || 0;
      case 'rangelastbar': return o.rangeTo !== undefined ? o.rangeTo : N - 1;
      case 'pixelheight': return o.paneHeight || 300;
      case 'pixelwidth': return o.paneWidth || 600;
      case 'axisminy': case 'axismaxy': return NaN;
      case 'buildnumber': return 5000;
      case 'version': return 6;
      default: return 0;
    }
  };

  // ------------------------------------------------------------------ foreign symbols
  const needs = new Set();
  const aligned = (sym) => {
    const f = (E.opts.foreign || {})[sym] || (E.opts.foreign || {})[String(sym).toUpperCase()];
    if (!f) { needs.add(String(sym)); return null; }
    const map = new Map(f.t.map((d, i) => [d, i])), out = { o: newArr(N0()), h: newArr(N0()), l: newArr(N0()), c: newArr(N0()), v: newArr(N0()) };
    let last = -1;
    for (let i = 0; i < n(); i++) {
      const j = map.get(bars.t[i]);
      if (j !== undefined) last = j;
      if (last >= 0 && (j !== undefined || E.opts.padForeign !== false)) { out.o[i] = f.o[last]; out.h[i] = f.h[last]; out.l[i] = f.l[last]; out.c[i] = f.c[last]; out.v[i] = j !== undefined ? f.v[last] : 0; }
    }
    return out;
  };
  const N0 = () => E.n;
  const fieldOf = (g, k) => { const key = String(k || 'C').toLowerCase(); if (!g) return newArr(n()); if (key === 'o' || key === 'open') return g.o; if (key === 'h' || key === 'high') return g.h; if (key === 'l' || key === 'low') return g.l; if (key === 'v' || key === 'volume') return g.v; if (key === 'i' || key === 'oi') return newArr(n(), 0); return g.c; };
  function foreignField(sym, k) { return fieldOf(aligned(sym), k); }
  F.foreign = (a) => foreignField(String(a[0]), a[1]);
  let saved = null;
  F.setforeign = (a) => {
    const g = aligned(String(a[0]));
    if (!saved) saved = { o: E.O, h: E.H, l: E.Lw, c: E.C, v: E.V };
    const z = g || { o: newArr(n()), h: newArr(n()), l: newArr(n()), c: newArr(n()), v: newArr(n()) };
    E.O = z.o; E.H = z.h; E.Lw = z.l; E.C = z.c; E.V = z.v; setPriceConsts(); return g ? 1 : 0;
  };
  F.restorepricearrays = () => { if (saved) { E.O = saved.o; E.H = saved.h; E.Lw = saved.l; E.C = saved.c; E.V = saved.v; saved = null; setPriceConsts(); } return 0; };
  function setPriceConsts() {
    const c = E.consts;
    ['open', 'o'].forEach((k) => c.set(k, E.O)); ['high', 'h'].forEach((k) => c.set(k, E.H)); ['low', 'l'].forEach((k) => c.set(k, E.Lw));
    ['close', 'c'].forEach((k) => c.set(k, E.C)); ['volume', 'v'].forEach((k) => c.set(k, E.V));
    c.set('avg', Float64Array.from(E.H, (x, i) => (x + E.Lw[i]) / 2));
  }
  E.setPriceConsts = setPriceConsts;
  // breadth: advancing / declining issue counts per bar, from the pseudo symbols ~~~ADV, ~~~DEC, ~~~UNCH (see Analysis > Build market breadth)
  const breadth = (sym) => foreignField(sym, 'C');
  F.advissues = () => breadth('~~~ADV'); F.decissues = () => breadth('~~~DEC'); F.unchissues = () => breadth('~~~UNCH');
  F.advvolume = () => breadth('~~~ADVV'); F.decvolume = () => breadth('~~~DECV');
  F.adline = () => L.cum(F.advissues().map((v, i) => v - F.decissues()[i]));
  F.trin = () => { const a = F.advissues(), d = F.decissues(), av = F.advvolume(), dv = F.decvolume(); return a.map((x, i) => (d[i] > 0 && av[i] > 0 && dv[i] > 0 ? (x / d[i]) / (av[i] / dv[i]) : NaN)); };
  E.needSymbols = needs;

  // ------------------------------------------------------------------ colors
  const toRgb = (c) => { c = Math.floor(c); if (c < 256) { const hx = H.colorToHex(c); const m = /#(..)(..)(..)/.exec(hx || '#ffffff'); return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; } return [c & 255, (c >> 8) & 255, (c >> 16) & 255]; };
  const pack = (r, g, b) => Math.round(r) + Math.round(g) * 256 + Math.round(b) * 65536;
  const mixC = (c1, c2, f) => { const a = toRgb(c1), b = toRgb(c2); return pack(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f); };
  F.colorblend = (a) => {
    const f = S(a[2], 0.5);
    if (isArr(a[0]) || isArr(a[1])) return Float64Array.from({ length: n() }, (_, i) => mixC(isArr(a[0]) ? a[0][i] : a[0], isArr(a[1]) ? a[1][i] : a[1], f));
    return mixC(S(a[0], 0), S(a[1], 0), f);
  };
  F.colorhsb = (a) => {
    const h = (((S(a[0], 0) % 256) + 256) % 256) / 255 * 6, s = S(a[1], 255) / 255, b = S(a[2], 255) / 255;
    const c = b * s, x = c * (1 - Math.abs((h % 2) - 1)), m = b - c; let r = 0, g = 0, bl = 0;
    if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; } else if (h < 3) { g = c; bl = x; } else if (h < 4) { g = x; bl = c; } else if (h < 5) { r = x; bl = c; } else { r = c; bl = x; }
    return pack((r + m) * 255, (g + m) * 255, (bl + m) * 255);
  };
  F.colorhsb = F.colorhsb;

  // ------------------------------------------------------------------ plotting
  const copy = (v) => (isArr(v) ? Float64Array.from(v) : v);
  const kindOf = (st) => ((st & STYLE.Histogram) ? 'hist' : (st & STYLE.Candle) ? 'candle' : (st & STYLE.Bar) ? 'bar' : (st & STYLE.Gradient) ? 'gradient'
    : (st & STYLE.Area) ? 'area' : 'line');
  const flags = (st) => ({
    thick: !!(st & STYLE.Thick), dashed: !!(st & STYLE.Dashed), dots: !!(st & STYLE.Dots), noLine: !!(st & STYLE.NoLine) || !!(st & STYLE.NoDraw),
    hidden: !!(st & STYLE.NoDraw), step: !!(st & STYLE.Staircase), ownScale: !!(st & STYLE.OwnScale), noLabel: !!(st & STYLE.NoLabel),
    left: !!(st & STYLE.LeftAxisScale), noRescale: !!(st & STYLE.NoRescale), noTitle: !!(st & STYLE.NoTitle),
  });
  const extra = (a, k0) => {
    const o = {};
    const mn = a[k0], mx = a[k0 + 1];
    if (typeof mn === 'number' && Number.isFinite(mn)) o.minY = mn;
    if (typeof mx === 'number' && Number.isFinite(mx)) o.maxY = mx;
    o.xshift = S(a[k0 + 2], 0) || 0; o.zorder = S(a[k0 + 3], 0) || 0;
    return o;
  };
  F.plot = (a) => {
    const style = S(a[3], 1), kind = kindOf(style);
    const p = { kind, name: a[1] === undefined ? '' : String(a[1]), data: copy(A(a[0])), color: copy(a[2] === undefined ? -1 : a[2]), ...flags(style), ...extra(a, 4), section: E.section };
    if (kind === 'candle' || kind === 'bar') p.ohlc = { o: E.O, h: E.H, l: E.Lw, c: p.data };
    if (kind === 'gradient') p.gradient = E.gradient || null;
    E.res.plots.push(p); return 0;
  };
  F.plotohlc = (a) => {
    const style = S(a[6], STYLE.Candle);
    const o = copy(A(a[0])), h = copy(A(a[1])), l = copy(A(a[2])), c = copy(A(a[3]));
    const name = a[4] === undefined ? '' : String(a[4]), color = copy(a[5] === undefined ? -1 : a[5]);
    if (style & STYLE.Cloud) {
      const top = Float64Array.from(o, (x, i) => Math.max(x, h[i])), bot = Float64Array.from(l, (x, i) => Math.min(x, c[i]));
      E.res.plots.push({ kind: 'cloud', name, color, top, bottom: bot, data: top, ...flags(style), ...extra(a, 7), section: E.section });
      return 0;
    }
    const kind = (style & STYLE.Bar) ? 'bar' : (style & STYLE.Line) && !(style & STYLE.Candle) ? 'ohlcline' : 'candle';
    if (kind === 'ohlcline') { E.res.plots.push({ kind: 'line', name, color, data: c, ...flags(style), ...extra(a, 7), section: E.section }); return 0; }
    E.res.plots.push({ kind, name, color, data: c, ohlc: { o, h, l, c }, ...flags(style), ...extra(a, 7), section: E.section });
    return 0;
  };
  F.plotforeign = (a) => {
    const g = aligned(String(a[0]));
    if (!g) return 0;
    const style = S(a[3], STYLE.Candle);
    if (style & (STYLE.Candle | STYLE.Bar)) F.plotohlc([g.o, g.h, g.l, g.c, a[1], a[2], style]);
    else F.plot([g.c, a[1], a[2], style]);
    return 0;
  };
  F.plotshapes = (a) => {
    const shapes = copy(A(a[0]));
    let pos = 'auto';
    if (a[3] !== undefined && isArr(a[3])) { if (a[3] === E.Lw) pos = 'below'; else if (a[3] === E.H) pos = 'above'; }
    E.res.shapes.push({ shapes, color: copy(a[1] === undefined ? -1 : a[1]), position: pos, offset: S(a[4], 0) });
    return 0;
  };
  F.plotgrid = (a) => { E.res.grids.push({ level: S(a[0], 0), color: a[1] === undefined ? 15 : a[1] }); return 0; };
  F.setgradientfill = (a) => { E.gradient = { top: S(a[0], 0), bottom: S(a[1], 0), base: S(a[2], NaN) }; return 0; };
  F.plotvapoverlay = (a) => { E.res.vap.push({ segments: null, lines: S(a[0], 300), width: S(a[1], 10), color: S(a[2], 41), flags: S(a[3], 0) }); return 0; };
  F.plotvapoverlaya = (a) => { E.res.vap.push({ segments: copy(A(a[0])), lines: S(a[1], 300), width: S(a[2], 10), color: S(a[3], 41), flags: S(a[4], 0) }); return 0; };
  F.setchartoptions = (a) => { E.res.options.chartoptions = a.map((x) => (isArr(x) ? 0 : x)); return 0; };
  F.setchartbkcolor = () => 0; F.setchartbkgradientfill = () => 0;
  F.settitle = (a) => { E.globals.set('title', a[0]); return 0; };

  // ------------------------------------------------------------------ backtest related
  F.setbacktestmode = (a) => { E.res.options.backtestmode = S(a[0], 0); return 0; };
  F.setcustombacktestproc = () => 0; F.addtocomposite = () => 0; F.addsummaryrows = () => 0; F.setbarsrequired = () => 0;
  F.optimize = (a) => {
    const name = String(a[0]), def = S(a[1], 0), min = S(a[2], def), max = S(a[3], def), step = S(a[4], 1) || 1;
    if (!E.res.optParams.some((p) => p.name === name)) E.res.optParams.push({ name, def, min, max, step });
    const v = E.opts.optValues && E.opts.optValues[name];
    return Number.isFinite(v) ? v : def;
  };
  F.equity = (a) => {
    const g = (k) => (E.globals.has(k) ? E.globals.get(k) : undefined);
    const sig = { buy: g('buy') && A(g('buy')), sell: g('sell') && A(g('sell')), short: g('short') && A(g('short')), cover: g('cover') && A(g('cover')),
      buyPrice: g('buyprice'), sellPrice: g('sellprice'), shortPrice: g('shortprice'), coverPrice: g('coverprice'), stops: E.res.stops };
    const opt = optionsFromResult(E.res, { initialEquity: E.res.options.initialequity || 100000 });
    const b = { t: bars.t, o: E.O, h: E.H, l: E.Lw, c: E.C };
    return singleEquity(b, sig, opt).equity;
  };
  F.setoption = (a) => { E.res.options[String(a[0]).toLowerCase()] = a[1]; return 0; };

  // ------------------------------------------------------------------ XY charts (Exploration)
  const xy = (name) => (E.res.xy[name] = E.res.xy[name] || { points: [], xLabel: 'X', yLabel: 'Y' });
  F.xychartaddpoint = (a) => {
    const [text, tip] = String(a[1] === undefined ? '' : a[1]).split('\t');
    xy(String(a[0])).points.push({ label: text || '', tip: tip || '', x: S(a[2]), y: S(a[3]), color: a[4] === undefined ? -1 : S(a[4]) });
    return 0;
  };
  F.xychartsetaxis = (a) => { const c = xy(String(a[0])); c.xLabel = String(a[1] === undefined ? 'X' : a[1]); c.yLabel = String(a[2] === undefined ? 'Y' : a[2]); return 0; };
  F.gettextwidth = () => 0;
  // ------------------------------------------------------------------ categories / watchlists (AmiBroker: InWatchList, CategoryGetSymbols ...)
  const CAT = ['markets', 'groups', 'sectors', 'industries', 'watchlists', 'favorites', 'indexes', 'all'];
  const catType = (c) => CAT[S(c)] || 'watchlists';
  const catNames = (type) => categoryStore().names(type).filter((x) => x !== '(Unassigned)');
  const catName = (type, num) => catNames(type)[S(num)];
  const me = () => String(E.opts.symbol || '').toUpperCase();
  const inCat = (type, name) => (name !== undefined && categoryStore().categoriesOf(me()).some((c) => c.type === type && c.name === name) ? 1 : 0);
  F.inwatchlist = (a) => inCat('watchlists', catName('watchlists', a[0]));
  F.inwatchlistname = (a) => { const h = categoryStore().find(String(a[0]), 'watchlists'); return h ? inCat('watchlists', h.name) : 0; };
  F.ingroup = (a) => inCat('groups', catName('groups', a[0]));
  F.inmarket = (a) => inCat('markets', catName('markets', a[0]));
  F.insector = (a) => inCat('sectors', catName('sectors', a[0]));
  F.inindustry = (a) => inCat('industries', catName('industries', a[0]));
  F.inindex = (a) => inCat('indexes', catName('indexes', a[0]));
  F.infavorites = () => (categoryStore().isFavorite(me()) ? 1 : 0);
  F.categorygetname = (a) => catName(catType(a[0]), a[1]) || '';
  F.categorygetsymbols = (a) => { const t = catType(a[0]), st = categoryStore(), nm = t === 'all' ? 'ALL' : t === 'favorites' ? 'Favorites' : catName(t, a[1]); return nm === undefined ? '' : st.members(t, nm, E.opts.allSymbols || host.symbols() || []).join(','); };
  F.getcategorysymbols = F.categorygetsymbols;
  F.categoryfind = (a) => { const t = catType(a[1]); const i = catNames(t).findIndex((x) => x.toLowerCase() === String(a[0]).toLowerCase()); return i; };
  F.categoryaddsymbol = (a) => { const t = catType(a[1]), nm = t === 'favorites' ? 'Favorites' : catName(t, a[2]); return nm === undefined ? 0 : (categoryStore().addSymbols(t, nm, [String(a[0] || me())]) ? 1 : 0); };
  F.categoryremovesymbol = (a) => { const t = catType(a[1]), nm = t === 'favorites' ? 'Favorites' : catName(t, a[2]); return nm === undefined ? 0 : (categoryStore().removeSymbols(t, nm, [String(a[0] || me())]) ? 1 : 0); };
  F.categorysetname = (a) => { const t = catType(a[1]), old = catName(t, a[2]); return old === undefined ? 0 : (categoryStore().rename(t, old, String(a[0])) ? 1 : 0); };
  const idOf = (type) => { const c = categoryStore().categoriesOf(me()).find((x) => x.type === type); return c ? Math.max(0, catNames(type).indexOf(c.name)) : 0; };
  F.groupid = () => idOf('groups'); F.marketid = () => idOf('markets'); F.sectorid = () => idOf('sectors'); F.industryid = () => idOf('industries');
  F.lastvalue = (a) => { const v = a[0]; return isArr(v) ? v[v.length - 1] : v; };
  F.selectedvalue = (a) => { const v = a[0]; if (!isArr(v)) return v; const i = E.opts.selectedBar !== undefined ? E.opts.selectedBar : v.length - 1; return v[i]; };
  return F;
}
