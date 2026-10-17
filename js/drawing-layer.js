// Drawing tools on the chart (like AmiBroker's Draw / Fibonacci / Gann toolbars): a canvas laid over the chart, a small toolbar,
// selecting / moving / resizing, copy / paste, Properties (with the Study ID formulas read through Study()).
// It only needs a few things from the chart engine: chart, paneSeries, arrays, sheet, container (see _env()).
import { el, openModal, toast, labeled, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';
import { TYPES, GROUPS, typeOf, defaultsFor, STUDY_IDS } from './drawing-types.js';
import { makeTimeMap, tsOfLabel } from './drawing-math.js';
import { primitives, pixelPoints, draw, distanceTo } from './drawing-render.js';

const HIT = 11, HANDLE = 15;
const LS = (k, v) => { try { if (typeof localStorage === 'undefined') return null; if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* ignore */ } return null; };
const HINT = { 1: 'tap where it goes', 2: 'drag from the start to the end (or tap, then tap again)', 3: 'drag the first two points, then tap the third', 0: 'tap each point, double tap or Enter to finish' };

export class DrawingLayer {
  constructor({ engine, workspace, store, onChange = () => {} }) {
    Object.assign(this, { engine, workspace, store, onChange });
    this.tool = null; this.sel = null; this.build = null; this.drag = null; this.clip = null; this.magnet = false; this.hidden = LS('drawings_hidden') === '1';
    this.style = { color: '#38bdf8', width: 1, dash: 'solid' }; this.touched = {};   // touched = only what the user changed in the toolbar
    this.symbol = ''; this.sig = ''; this.tmFor = null; this.tm = null; this.lastTap = { id: '', at: 0 };
    this._mount();
    store.onChange((s) => { if (s === this.symbol.toUpperCase()) { this.redraw(); this._syncBar(); } });
    document.addEventListener('keydown', (e) => this._key(e));
    const watch = () => { this._watch(); requestAnimationFrame(watch); };
    requestAnimationFrame(watch);
  }

  // ------------------------------------------------------------------ engine access
  get chart() { return this.engine.chart; }
  _syms() { return (this.engine.sheet && this.engine.sheet.symbol) || ''; }
  list() { return this.hidden ? [] : this.store.list(this._syms()); }
  _timeMap() {
    const a = this.engine.arrays; if (!a || !a.t) return null;
    if (this.tmFor !== a) { this.tmFor = a; this.tm = makeTimeMap(a.t); }
    return this.tm;
  }
  /** Pixel geometry of one pane: { index, key, top, h, w, series, X, Y, ... } or null. */
  _pane(key, fallbackIdx = 0) {
    const eng = this.engine, sheet = eng.sheet, chart = this.chart; if (!sheet || !chart) return null;
    let i = sheet.panes.findIndex((p) => p.id === key); if (i < 0) i = Math.min(fallbackIdx, sheet.panes.length - 1); if (i < 0) return null;
    const series = eng.paneSeries && eng.paneSeries[i], pn = chart.panes()[i], host = pn && pn.getHTMLElement && pn.getHTMLElement();
    if (!series || !host) return null;
    const r = host.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
    let axis = 0; try { axis = chart.priceScale('right', i).width(); } catch (e) { /* older library */ }
    const top = r.top - c.top, w = Math.max(10, r.width - (axis || 0)), ts = chart.timeScale();
    let log = false; try { log = series.priceScale().options().mode === 1; } catch (e) { /* ignore */ }
    return { index: i, key: sheet.panes[i].id, top, h: r.height, w, left: r.left - c.left, series, log,
      X: (x) => { const v = ts.logicalToCoordinate(x); return v === null || v === undefined ? NaN : v; },
      Y: (p) => { const v = series.priceToCoordinate(p); return v === null || v === undefined ? NaN : top + v; },
      invX: (px) => ts.coordinateToLogical(px), invY: (py) => series.coordinateToPrice(py - top) };
  }
  _paneAt(y) {
    const sheet = this.engine.sheet; if (!sheet || !this.chart) return null;
    for (let i = 0; i < sheet.panes.length; i++) { const p = this._pane(sheet.panes[i].id); if (p && y >= p.top && y <= p.top + p.h) return p; }
    return null;
  }
  _env(p) { return { X: p.X, Y: p.Y, W: p.w, H: p.top + p.h, bars: this.engine.arrays, tm: this._timeMap(), log: p.log }; }
  _prims(d) {
    const p = this._pane(d.paneKey, (Number(d.chartId) || 1) - 1); if (!p) return null;
    return { pane: p, prims: primitives(d, this._env(p)), pts: pixelPoints(d, this._env(p)) };
  }

  /** The engine calls this after every render (the chart object is new each time). */
  onRendered() {
    const s = this._syms();
    if (s !== this.symbol) { this.symbol = s; this.sel = null; this.build = null; this.drag = null; if (this.tool) this._setTool(null); this._syncBar(); }
    try { this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => this.redraw()); } catch (e) { /* ignore */ }
    this._size(); this.sig = ''; this.redraw();
  }

  // ------------------------------------------------------------------ canvas + toolbar
  _mount() {
    const ws = this.workspace;
    this.canvas = el('canvas', 'absolute inset-0 w-full h-full z-10'); Object.assign(this.canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', touchAction: 'none' });
    ws.appendChild(this.canvas);
    this.bar = el('div', 'absolute bottom-10 left-1 z-30 max-w-[calc(100%-0.5rem)] flex flex-col items-start gap-1');
    this.panel = el('div', 'hidden flex-col gap-1 rounded border border-slate-700 bg-slate-900/95 p-1 text-[11px] text-slate-200');
    this.toggle = el('button', 'px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-100 text-sm', '✏'); this.toggle.type = 'button'; this.toggle.title = 'Drawing tools';
    this.toggle.onclick = () => { const open = this.panel.classList.contains('hidden'); this.panel.classList.toggle('hidden', !open); this.panel.classList.toggle('flex', open); if (!open) this._setTool(null); };
    this.bar.appendChild(this.panel); this.bar.appendChild(this.toggle); ws.appendChild(this.bar);
    this._buildPanel();
    const host = this.engine.container || ws;
    ['pointerdown', 'mousedown', 'touchstart'].forEach((ev) => host.addEventListener(ev, (e) => this._down(e), { capture: true, passive: false }));
    host.addEventListener('dblclick', (e) => { const pt = this._local(e), h = pt && this._hit(pt); if (h) { e.stopPropagation(); this._select(h.d.id); this.properties(h.d); } }, true);
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach((ev) => this.canvas.addEventListener(ev, (e) => this._tool(ev, e)));
    this.canvas.addEventListener('dblclick', () => this._finishPoly());
    window.addEventListener('pointermove', (e) => this._dragMove(e), true);
    window.addEventListener('pointerup', (e) => this._dragEnd(e), true);
    window.addEventListener('pointercancel', (e) => this._dragEnd(e), true);
  }
  _buildPanel() {
    const p = this.panel; p.innerHTML = '';
    const btn = (txt, title, fn, active) => { const b = el('button', 'px-2 py-1 rounded border ' + (active ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-200'), txt); b.type = 'button'; b.title = title; b.onclick = fn; return b; };
    const row1 = el('div', 'flex flex-wrap gap-1 items-center');
    row1.appendChild(btn('➤', 'Select / move (Esc)', () => this._setTool(null), !this.tool));
    for (const g of GROUPS) {
      const tools = TYPES.filter((t) => t.group === g), here = tools.find((t) => t.id === this.tool);
      if (tools.length === 1) { row1.appendChild(btn(tools[0].icon, tools[0].name, () => this._setTool(tools[0].id), !!here)); continue; }
      const b = btn(`${here ? here.icon : g} ▾`, g, () => { this.openGroup = this.openGroup === g ? '' : g; this._buildPanel(); }, !!here); row1.appendChild(b);
    }
    p.appendChild(row1);
    if (this.openGroup) {
      const list = el('div', 'flex flex-wrap gap-1');
      for (const t of TYPES.filter((x) => x.group === this.openGroup)) list.appendChild(btn(`${t.icon} ${t.name}`, t.name, () => { this.openGroup = ''; this._setTool(t.id); }, this.tool === t.id));
      p.appendChild(list);
    }
    const row2 = el('div', 'flex flex-wrap gap-1 items-center');
    const color = el('input', 'w-7 h-6 rounded bg-slate-800 border border-slate-700'); color.type = 'color'; color.value = this.style.color; color.title = 'Colour';
    color.oninput = () => { this.style.color = this.touched.color = color.value; this._applyStyle({ color: color.value }); };
    const width = el('select', 'px-1 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200'); [1, 2, 3, 4].forEach((w) => { const o = el('option', '', `${w}px`); o.value = w; width.appendChild(o); }); width.value = this.style.width; width.title = 'Thickness';
    width.onchange = () => { this.style.width = this.touched.width = +width.value; this._applyStyle({ width: +width.value }); };
    const dash = el('select', 'px-1 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200'); [['solid', '───'], ['dashed', '- - -'], ['dotted', '· · ·']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; dash.appendChild(o); }); dash.value = this.style.dash; dash.title = 'Line style';
    dash.onchange = () => { this.style.dash = this.touched.dash = dash.value; this._applyStyle({ dash: dash.value }); };
    [color, width, dash].forEach((x) => row2.appendChild(x));
    row2.appendChild(btn('🧲', 'Snap to the nearest Open / High / Low / Close', () => { this.magnet = !this.magnet; this._buildPanel(); }, this.magnet));
    row2.appendChild(btn('⚙', 'Properties and Study ID (Alt+Enter, or double tap the drawing)', () => { const d = this._selected(); if (d) this.properties(d); else toast('Select a drawing first.'); }));
    row2.appendChild(btn('⎘', 'Copy (Ctrl+C)', () => this._copy()));
    row2.appendChild(btn('📋', 'Paste (Ctrl+V)', () => this._paste()));
    row2.appendChild(btn('🗑', 'Delete the selected drawing (Del)', () => this._delete()));
    row2.appendChild(btn('🗑 all', 'Delete every drawing of this symbol', () => { const n = this.store.list(this._syms()).length; if (n && confirm(`Delete all ${n} drawings of ${this._syms()}?`)) { this.store.clear(this._syms()); this.sel = null; } }));
    row2.appendChild(btn(this.hidden ? '🙈' : '👁', 'Hide / show the drawings', () => { this.hidden = !this.hidden; LS('drawings_hidden', this.hidden ? '1' : '0'); this._buildPanel(); this.redraw(); }, this.hidden));
    p.appendChild(row2);
    this.hint = el('div', 'text-[10px] text-slate-400 px-1'); p.appendChild(this.hint); this._syncBar();
  }
  _syncBar() {
    if (!this.hint) return;
    const t = typeOf(this.tool), d = this._selected();
    this.hint.textContent = t ? `${t.name}: ${HINT[t.pts]}. Esc to cancel.` : d ? `${(typeOf(d.type) || {}).name || d.type} selected${d.studyId ? ` · Study ID ${d.studyId}` : ''}. Drag to move, drag a dot to resize, double tap for Properties.` : 'Pick a tool, or tap a drawing to select it.';
  }
  _setTool(id) {
    this.tool = id; this.build = null; this.openGroup = '';
    this.canvas.style.pointerEvents = id ? 'auto' : 'none'; this.canvas.style.cursor = id ? 'crosshair' : '';
    this.canvas.style.zIndex = id ? '25' : '10';
    if (id) this._select(null);
    this._buildPanel(); this.redraw();
  }
  _selected() { return this.sel ? this.store.get(this._syms(), this.sel) : null; }
  _select(id) { this.sel = id; this._syncBar(); this.redraw(); }
  _applyStyle(patch) { const d = this._selected(); if (d) this.store.update(this._syms(), d.id, patch); }

  // ------------------------------------------------------------------ drawing the canvas
  _size() {
    const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.dpr = dpr;
  }
  _watch() {
    if (!this.chart || !this.engine.sheet) return;
    const p = this._pane(this.engine.sheet.panes[0] && this.engine.sheet.panes[0].id); if (!p) return;
    const r = this.canvas.getBoundingClientRect(), sig = [p.X(0), p.X(50), p.Y(1), p.Y(1000), p.top, p.h, r.width, r.height].join('|');
    if (sig !== this.sig) { this.sig = sig; this.redraw(); }
  }
  redraw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._paint(); });
  }
  _paint() {
    const c = this.canvas, ctx = c.getContext('2d'); if (!ctx) return;
    this._size(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    if (!this.chart || !this._timeMap()) return;
    const items = [...this.list()]; if (this.build) items.push(this.build.d);
    for (const d of items) {
      const g = this._prims(d); if (!g) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(g.pane.left, g.pane.top, g.pane.w, g.pane.h); ctx.clip();
      const sel = d.id === this.sel; draw(ctx, g.prims, { selected: sel });
      if (sel || d === (this.build && this.build.d)) {
        for (const q of g.pts) { ctx.beginPath(); ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#0f172a'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke(); }
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ pointer -> chart coordinates
  _local(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e, r = this.canvas.getBoundingClientRect();
    if (t.clientX === undefined) return null;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  /** pixel -> { t, p, idx, pane } with the bar snapped, optionally the price snapped to O/H/L/C */
  _point(pt, pane = null) {
    const p = pane || this._paneAt(pt.y); if (!p) return null;
    const tm = this._timeMap(); let idx = p.invX(pt.x); if (idx === null || idx === undefined || !Number.isFinite(idx)) return null;
    idx = Math.round(idx); let price = p.invY(pt.y); if (price === null || price === undefined || !Number.isFinite(price)) return null;
    const a = this.engine.arrays;
    if (this.magnet && idx >= 0 && idx < a.c.length) {
      let best = HANDLE * 1.2;
      for (const arr of [a.o, a.h, a.l, a.c]) { const v = arr[idx], y = Number.isFinite(v) ? p.Y(v) : NaN; if (Number.isFinite(y) && Math.abs(y - pt.y) < best) { best = Math.abs(y - pt.y); price = v; } }
    }
    return { t: tm.timeOfIdx(idx), p: price, idx, pane: p };
  }

  // ------------------------------------------------------------------ creating with a tool
  _tool(kind, e) {
    if (!this.tool) return; e.preventDefault();
    const type = typeOf(this.tool), pt = this._local(e); if (!type || !pt) return;
    const b = this.build;
    if (kind === 'pointerdown') {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      const q = this._point(pt, b ? b.pane : null); if (!q) return;
      if (!b) {
        const saved = this._defaults(type.id), d = { ...defaultsFor(type.id), ...saved, ...this.touched, type: type.id, paneKey: q.pane.key, chartId: q.pane.index + 1, log: q.pane.log, pts: type.pts === 1 ? [{ t: q.t, p: q.p }] : [{ t: q.t, p: q.p }, { t: q.t, p: q.p }] };
        this.build = { d, pane: q.pane, down: pt, dragging: true, moved: false };
        if (type.pts === 1) this._commit();
        else this.redraw();
      } else if (type.pts === 0) {                                  // zig-zag: every tap adds a point
        const pts = b.d.pts; pts[pts.length - 1] = { t: q.t, p: q.p }; pts.push({ t: q.t, p: q.p }); this.redraw();
      } else {                                                      // next point of a tap-tap drawing
        const pts = b.d.pts; pts[pts.length - 1] = { t: q.t, p: q.p };
        if (pts.length >= type.pts) this._commit(); else { pts.push({ t: q.t, p: q.p }); b.dragging = true; b.down = pt; b.moved = false; this.redraw(); }
      }
    } else if (kind === 'pointermove' && b) {
      const q = this._point(pt, b.pane); if (!q) return;
      b.d.pts[b.d.pts.length - 1] = { t: q.t, p: q.p };
      if (b.down && Math.hypot(pt.x - b.down.x, pt.y - b.down.y) > 6) b.moved = true;
      this.redraw();
    } else if ((kind === 'pointerup' || kind === 'pointercancel') && b && b.dragging) {
      b.dragging = false;
      const pts = b.d.pts, type2 = typeOf(b.d.type);
      if (type2.pts === 0) return;
      if (b.moved && pts.length === 2 && pts.length >= type2.pts) this._commit();       // a drag from start to end
      else if (b.moved && pts.length < type2.pts) { pts.push({ ...pts[pts.length - 1] }); this.redraw(); }
      else if (b.moved && pts.length === type2.pts) this._commit();
      // a plain tap placed the first point; the next tap places the next one
    }
  }
  _finishPoly() {
    const b = this.build; if (!b || b.d.type !== 'zigzag') return;
    const same = (x, y) => x.t === y.t && x.p === y.p, pts = [];
    for (const q of b.d.pts) if (!pts.length || !same(pts[pts.length - 1], q)) pts.push(q);
    b.d.pts = pts; if (pts.length > 1) this._commit(); else { this.build = null; this.redraw(); }
  }
  _commit() {
    const b = this.build; if (!b) return; this.build = null;
    const d = { ...b.d }; delete d.id;
    if (d.pts.length > 1 && d.pts.every((q) => q.t === d.pts[0].t && q.p === d.pts[0].p)) { this._setTool(null); return; }   // nothing was drawn
    if (d.type === 'text') {
      const txt = prompt('Text', d.text || 'Text'); if (txt === null) { this._setTool(null); return; } d.text = txt || 'Text';
    }
    const saved = this.store.add(this._syms(), d);
    this._setTool(null); this._select(saved.id); this.onChange(saved);
  }

  // ------------------------------------------------------------------ selecting, moving, resizing
  _hit(pt) {
    const list = this.list(); let best = null;
    // handles of the selected drawing first
    const sd = this._selected();
    if (sd) { const g = this._prims(sd); if (g) { const i = g.pts.findIndex((q) => Math.hypot(q.x - pt.x, q.y - pt.y) <= HANDLE); if (i >= 0) return { d: sd, handle: i, pane: g.pane }; } }
    for (let k = list.length - 1; k >= 0; k--) {
      const g = this._prims(list[k]); if (!g) continue;
      if (pt.y < g.pane.top || pt.y > g.pane.top + g.pane.h) continue;
      const dd = distanceTo(g.prims, pt.x, pt.y); if (dd <= HIT && (!best || dd < best.dd)) best = { d: list[k], handle: -1, dd, pane: g.pane };
    }
    return best;
  }
  _down(e) {
    if (this.tool) return;
    const pt = this._local(e); if (!pt) return;
    const h = this._hit(pt);
    if (!h) { if (e.type === 'pointerdown' && this.sel) { this.sel = null; this._syncBar(); this.redraw(); } return; }
    e.stopPropagation(); if (e.cancelable) e.preventDefault();
    if (e.type !== 'pointerdown') return;
    const now = Date.now(); if (e.pointerType === 'touch' && this.lastTap.id === h.d.id && now - this.lastTap.at < 350 && h.handle < 0) { this.lastTap = { id: '', at: 0 }; this._select(h.d.id); this.properties(h.d); return; }
    this.lastTap = { id: h.d.id, at: now };
    this._select(h.d.id);
    const tm = this._timeMap(), start = this._point(pt, h.pane);
    this.drag = { id: h.d.id, handle: h.handle, pane: h.pane, startIdx: start ? start.idx : 0, startPrice: start ? start.p : 0, orig: h.d.pts.map((q) => ({ ...q })), origIdx: h.d.pts.map((q) => tm.idxOfTime(q.t)), moved: false };
  }
  _dragMove(e) {
    const g = this.drag; if (!g) return;
    const pt = this._local(e); if (!pt) return; const pane = this._pane(g.pane.key, g.pane.index);
    const q = this._point(pt, pane); if (!q) return;
    const d = this._selected(); if (!d) return; const tm = this._timeMap(); g.moved = true;
    if (g.handle >= 0) d.pts[g.handle] = { t: q.t, p: q.p };
    else {
      const dIdx = q.idx - g.startIdx, ratio = g.pane.log && g.startPrice > 0 ? q.p / g.startPrice : null, dP = q.p - g.startPrice;
      d.pts = g.orig.map((o, i) => ({ t: tm.timeOfIdx(g.origIdx[i] + dIdx), p: ratio !== null ? o.p * ratio : o.p + dP }));
    }
    e.preventDefault(); this.redraw();
  }
  _dragEnd() {
    const g = this.drag; if (!g) return; this.drag = null;
    const d = this._selected(); if (d && g.moved) this.store.update(this._syms(), d.id, { pts: d.pts });
    else if (d) d.pts = g.orig;
  }

  // ------------------------------------------------------------------ keyboard, copy / paste, delete
  _key(e) {
    const tag = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
    if (e.key === 'Escape') { if (this.build) { this.build = null; this.redraw(); } else if (this.tool) this._setTool(null); else if (this.sel) this._select(null); return; }
    if (this.build && e.key === 'Enter') { this._finishPoly(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this._delete(); return; }
    if (e.altKey && e.key === 'Enter') { const d = this._selected(); if (d) this.properties(d); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'c') this._copy(); else if (k === 'x') { this._copy(); this._delete(); } else if (k === 'v') this._paste();
    }
  }
  _copy() { const d = this._selected(); if (!d) { toast('Select a drawing first.'); return; } this.clip = this.store.clone(d); toast('Copied.'); }
  _paste() {
    if (!this.clip) { toast('Nothing copied yet.'); return; }
    const d = this.store.add(this._syms(), JSON.parse(JSON.stringify(this.clip))); this._select(d.id);
  }
  _delete() { const d = this._selected(); if (d) { this.store.remove(this._syms(), d.id); this.sel = null; this._syncBar(); } else toast('Select a drawing first.'); }

  // ------------------------------------------------------------------ remembered settings ("Use as default")
  _defaults(type) { try { return (JSON.parse(LS('drawing_defaults_v1') || '{}') || {})[type] || {}; } catch (e) { return {}; } }
  _saveDefaults(d) {
    let all = {}; try { all = JSON.parse(LS('drawing_defaults_v1') || '{}') || {}; } catch (e) { /* ignore */ }
    const { id, pts, paneKey, chartId, log, type, text, ...rest } = d; void id; void pts; void paneKey; void chartId; void log; void text;
    all[type] = rest; LS('drawing_defaults_v1', JSON.stringify(all));
  }

  // ------------------------------------------------------------------ Properties
  properties(d) {
    const sym = this._syms(), type = typeOf(d.type) || { name: d.type, id: d.type }, tm = this._timeMap();
    const intraday = this.engine.arrays && String(this.engine.arrays.t[0]).length > 10;
    openModal(`${type.name} properties`, (b, close) => {
      const draft = JSON.parse(JSON.stringify(d)), fields = [];
      const field = (label, key, kind = 'text', opts = {}) => {
        let inp;
        if (kind === 'check') { inp = el('input'); inp.type = 'checkbox'; inp.checked = !!draft[key]; const row = el('label', 'flex items-center space-x-2 text-xs text-slate-200'); row.appendChild(inp); row.appendChild(el('span', '', label)); inp.onchange = () => { draft[key] = inp.checked; }; b.appendChild(row); return inp; }
        if (kind === 'select') { inp = el('select', INPUT + ' w-full'); (opts.options || []).forEach(([v, t]) => { const o = el('option', '', t); o.value = v; inp.appendChild(o); }); inp.value = draft[key] === undefined ? opts.options[0][0] : draft[key]; inp.onchange = () => { draft[key] = inp.value; }; }
        else { inp = el('input', INPUT + ' w-full'); inp.type = kind === 'color' ? 'color' : kind === 'number' ? 'number' : 'text'; if (kind === 'number') inp.step = opts.step || 'any'; inp.value = draft[key] === undefined ? '' : draft[key]; if (opts.list) inp.setAttribute('list', opts.list); if (opts.upper) inp.style.textTransform = 'uppercase'; inp.oninput = () => { draft[key] = kind === 'number' ? Number(inp.value) : (opts.upper ? inp.value.toUpperCase().slice(0, 2) : inp.value); }; }
        b.appendChild(labeled(label, inp)); fields.push(inp); return inp;
      };
      const t = d.type, lines = ['trend', 'ray', 'extended', 'arrow', 'parallel'].includes(t);
      if (t === 'text') { field('Text', 'text'); field('Size', 'number', 'number'); field('Box around the text', 'box', 'check'); }
      field('Colour', 'color', 'color'); field('Thickness (px)', 'width', 'number', { step: 1 });
      field('Line style', 'dash', 'select', { options: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']] });
      if (lines && t !== 'ray' && t !== 'extended') { field('Extend to the left', 'extL', 'check'); field('Extend to the right', 'extR', 'check'); }
      if (['parallel', 'rect', 'ellipse', 'triangle', 'arc', 'pitchfork', 'raff', 'stderr', 'stddev'].includes(t)) field('Fill', 'fill', 'check');
      if (['raff', 'stderr', 'stddev'].includes(t)) { if (t !== 'raff') field(t === 'stderr' ? 'Number of standard errors' : 'Number of standard deviations', 'mult', 'number'); field('Extend to the right', 'extR', 'check'); field('Show middle line', 'showMid', 'check'); field('Show upper line', 'showUp', 'check'); field('Show lower line', 'showDn', 'check'); }
      if (t === 'cycle') field('Number of cycle lines', 'count', 'number', { step: 1 });
      if (t === 'gannSquare') field('Divisions', 'divisions', 'number', { step: 1 });
      if (t === 'fibRetr') { field('Show extensions (127.2%, 161.8%)', 'showExt', 'check'); field('Extend the lines to the right by (bars, 0 = end of the trend line)', 'extFactor', 'number'); field('Level text', 'text', 'select', { options: [['%', '%'], ['$', 'Price'], ['both', '% and price'], ['', 'None']] }); }
      if (t === 'fibExt') field('Extend the lines to the right by (bars)', 'extFactor', 'number');
      if (d.levels) {
        b.appendChild(el('div', 'text-[11px] text-slate-400', 'Levels: show, level in % of the move' + (t === 'fibRetr' || t === 'fibExt' ? ', Study ID' : '')));
        for (const l of draft.levels) {
          const row = el('div', 'flex items-center space-x-2');
          const sh = el('input'); sh.type = 'checkbox'; sh.checked = !!l.show; sh.onchange = () => { l.show = sh.checked; };
          const v = el('input', INPUT + ' w-20'); v.type = 'number'; v.step = 'any'; v.value = +(l.v * 100).toFixed(2); v.oninput = () => { l.v = Number(v.value) / 100; };
          row.appendChild(sh); row.appendChild(v); row.appendChild(el('span', 'text-xs text-slate-400', '%'));
          if ('id' in l) { const id = el('input', INPUT + ' w-14'); id.maxLength = 2; id.value = l.id || ''; id.placeholder = 'ID'; id.oninput = () => { l.id = id.value.toUpperCase().slice(0, 2); }; row.appendChild(id); }
          const c = el('input'); c.type = 'color'; c.value = l.color || draft.color; c.oninput = () => { l.color = c.value; }; row.appendChild(c);
          b.appendChild(row);
        }
      }
      if (type.study) {
        const dl = el('datalist'); dl.id = 'study-ids'; STUDY_IDS.forEach((s) => { const o = el('option'); o.value = s; dl.appendChild(o); }); b.appendChild(dl);
        b.appendChild(el('div', 'text-[11px] text-slate-400 pt-1', 'Study ID: two letters. A formula reads this line with Study("ID", chartId). Predefined: UP (uptrend) DN (downtrend) SU (support) RE (resistance) ST (stop loss).'));
        if (t !== 'fibRetr' && t !== 'fibExt') field(['raff', 'stderr', 'stddev'].includes(t) ? 'Study ID of the middle line' : 'Study ID', 'studyId', 'text', { list: 'study-ids', upper: true });
        if (t === 'parallel') field('Study ID of the second line', 'studyId2', 'text', { list: 'study-ids', upper: true });
        if (['raff', 'stderr', 'stddev'].includes(t)) { field('Study ID of the upper line', 'studyIdUp', 'text', { list: 'study-ids', upper: true }); field('Study ID of the lower line', 'studyIdDn', 'text', { list: 'study-ids', upper: true }); }
        field('Chart ID (price pane = 1)', 'chartId', 'number', { step: 1 }); field('Logarithmic scale for Study()', 'log', 'check');
      }
      // exact points
      b.appendChild(el('div', 'text-[11px] text-slate-400 pt-1', 'Points (date, price)'));
      const pts = draft.pts.map((q) => ({ ...q })), stamp = (T) => new Date(T * 1000).toISOString().replace('T', ' ').slice(0, intraday ? 16 : 10);
      pts.forEach((q) => {
        const row = el('div', 'flex space-x-2'), dt = el('input', INPUT + ' flex-1'), pr = el('input', INPUT + ' w-28'); dt.value = stamp(q.t); pr.type = 'number'; pr.step = 'any'; pr.value = +q.p.toFixed(4);
        dt.onchange = () => { const T = tsOfLabel(dt.value); if (Number.isFinite(T)) q.t = T; else { toast('Date like 2024-01-31' + (intraday ? ' 09:15' : '')); dt.value = stamp(q.t); } };
        pr.oninput = () => { if (Number.isFinite(+pr.value)) q.p = +pr.value; };
        row.appendChild(dt); row.appendChild(pr); b.appendChild(row);
      });
      const row = el('div', 'flex space-x-2 pt-1');
      const ok = el('button', BTN_PRIMARY + ' flex-1', 'Apply'); ok.type = 'button';
      ok.onclick = () => { draft.pts = pts; this.store.update(sym, d.id, draft); close.force(); this._syncBar(); };
      const def = el('button', BTN + ' flex-1', 'Use as default'); def.type = 'button'; def.onclick = () => { this._saveDefaults(draft); toast('New drawings of this kind will look like this.'); };
      const del = el('button', BTN_DANGER, 'Delete'); del.type = 'button'; del.onclick = () => { this.store.remove(sym, d.id); this.sel = null; close.force(); this._syncBar(); };
      row.appendChild(ok); row.appendChild(def); row.appendChild(del); b.appendChild(row);
      void tm; void fields;
    }, { stack: true, big: true });
  }
}
