// Chart navigation strip under the chart: scroll bar, one-candle arrows, zoom + / -, crosshair on/off.
// The chart is rebuilt on every render, so onRendered() re-attaches to the new time scale.
const KEY = 'chart_crosshair_on';
export const readCrosshair = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };
export const writeCrosshair = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ } };

export class ChartNav {
  constructor({ engine, root }) {
    this.engine = engine; this.root = root; this.unsub = null; this.dragging = false;
    const btn = (txt, title, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.textContent = txt; b.className = 'shrink-0 w-8 h-7 rounded bg-slate-800 border border-slate-700 text-slate-200 text-sm leading-none active:bg-slate-700 ' + cls; return b; };
    this.left = btn('◀', 'One candle to the left'); this.right = btn('▶', 'One candle to the right');
    this.zout = btn('－', 'Zoom out'); this.zin = btn('＋', 'Zoom in'); this.cross = btn('✛', 'Crosshair on / off');
    this.track = document.createElement('div'); this.track.className = 'relative flex-1 min-w-0 h-5 rounded bg-slate-800 border border-slate-700'; this.track.style.touchAction = 'none';
    this.thumb = document.createElement('div'); this.thumb.className = 'absolute top-0 h-full rounded bg-sky-600/80'; this.thumb.style.touchAction = 'none'; this.thumb.style.minWidth = '24px'; this.track.appendChild(this.thumb);
    root.className = 'h-9 bg-slate-900/80 border-t border-slate-800 flex items-center px-2 space-x-1 shrink-0';
    [this.left, this.track, this.right, this.zout, this.zin, this.cross].forEach((x) => root.appendChild(x));
    this.hold(this.left, () => this.step(-1)); this.hold(this.right, () => this.step(1));
    this.hold(this.zout, () => this.zoom(1 / 0.75)); this.hold(this.zin, () => this.zoom(0.75));
    this.cross.onclick = () => { const on = !this.engine.crosshairOn; this.engine.setCrosshair(on); writeCrosshair(on); this.paintCross(); };
    this.paintCross(); this.bindTrack();
    document.addEventListener('keydown', (e) => {   // desktop: arrow keys
      const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')) return; if (t && t.isContentEditable) return;
      if (e.key === 'ArrowLeft') { this.step(-1); e.preventDefault(); } else if (e.key === 'ArrowRight') { this.step(1); e.preventDefault(); }
    });
  }
  paintCross() { const on = this.engine.crosshairOn; this.cross.classList.toggle('bg-sky-600', on); this.cross.classList.toggle('text-white', on); this.cross.title = on ? 'Crosshair is on (tap to turn off)' : 'Crosshair is off (tap to turn on)'; }
  ts() { try { return this.engine.chart ? this.engine.chart.timeScale() : null; } catch (e) { return null; } }
  range() { const ts = this.ts(); if (!ts) return null; try { return ts.getVisibleLogicalRange(); } catch (e) { return null; } }
  setRange(from, to) { const ts = this.ts(); if (!ts) return; try { ts.setVisibleLogicalRange({ from, to }); } catch (e) { /* ignore */ } }
  step(d) { const r = this.range(); if (r) this.setRange(r.from + d, r.to + d); }          // one candle
  zoom(f) {
    const r = this.range(); if (!r) return; const n = this.engine.barCount || 100, w = r.to - r.from, c = (r.from + r.to) / 2;
    const nw = Math.min(n + 10, Math.max(5, w * f)); this.setRange(c - nw / 2, c + nw / 2);
  }
  hold(b, fn) {   // press once = one step, keep pressing = repeats
    let t1 = null, t2 = null; const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); stop(); t1 = setTimeout(() => { t2 = setInterval(fn, 70); }, 350); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
  }
  bindTrack() {
    const total = () => (this.engine.barCount || 1) + 4;
    const toFrom = (px) => { const r = this.range(); if (!r) return; const w = r.to - r.from, W = this.track.clientWidth || 1, f = Math.max(0, Math.min(total() - w, (px / W) * total())); this.setRange(f, f + w); };
    let grab = 0;
    this.thumb.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.thumb.setPointerCapture(e.pointerId); this.dragging = true; grab = e.clientX - this.thumb.getBoundingClientRect().left; });
    this.thumb.addEventListener('pointermove', (e) => { if (this.dragging) toFrom(e.clientX - this.track.getBoundingClientRect().left - grab); });
    const end = () => { this.dragging = false; }; this.thumb.addEventListener('pointerup', end); this.thumb.addEventListener('pointercancel', end);
    this.track.addEventListener('pointerdown', (e) => { if (e.target !== this.track) return; const r = this.range(); if (!r) return; const W = this.track.clientWidth || 1, w = r.to - r.from; toFrom((e.clientX - this.track.getBoundingClientRect().left) - (w / total()) * W / 2); });
  }
  update() {
    const r = this.range(), n = this.engine.barCount || 0;
    if (!r || !n) { this.thumb.style.width = '100%'; this.thumb.style.left = '0'; return; }
    const total = n + 4, w = r.to - r.from, from = Math.max(0, Math.min(total - w, r.from));
    this.thumb.style.width = `${Math.min(100, (w / total) * 100)}%`; this.thumb.style.left = `${(from / total) * 100}%`;
  }
  onRendered() {
    if (this.unsub) { try { this.unsub(); } catch (e) { /* chart already gone */ } this.unsub = null; }
    const ts = this.ts(); if (!ts) return;
    const h = () => this.update(); try { ts.subscribeVisibleLogicalRangeChange(h); this.unsub = () => ts.unsubscribeVisibleLogicalRangeChange(h); } catch (e) { /* ignore */ }
    this.paintCross(); this.update();
  }
}
