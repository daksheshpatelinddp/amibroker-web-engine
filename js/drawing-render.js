// Turns a drawing into shapes in pixels (primitives), draws them on a canvas and tests where the finger / mouse is.
// env: { X(barPosition) -> px, Y(price) -> px (inside the pane), W, H (pane size), bars: { c, h, l }, tm: time map }
import { channel, fibRetrLevels, fibExtLevels } from './drawing-math.js';
import { FIB_ZONES, GANN_ANGLES } from './drawing-types.js';

const dashOf = (s) => (s === 'dashed' ? [7, 5] : s === 'dotted' ? [2, 4] : []);
const BIG = 1e4;

export const pixelPoints = (d, env) => (d.pts || []).map((pt) => ({ x: env.X(env.tm.idxOfTime(pt.t)), y: env.Y(pt.p) }));

export function primitives(d, env) {
  const P = pixelPoints(d, env);
  if (!P.length || P.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return [];
  const out = [], col = d.color || '#38bdf8', w = Number(d.width) || 1, dash = dashOf(d.dash);
  const style = (c = col, ww = w, dd = dash) => ({ color: c || col, w: ww, dash: dd });
  const seg = (a, b, { l = false, r = false, st = style(), noHit = false } = {}) => out.push({ k: 'seg', x1: a.x, y1: a.y, x2: b.x, y2: b.y, extL: l, extR: r, style: st, noHit });
  const text = (x, y, t, color = col, align = 'left', size = 11) => out.push({ k: 'text', x, y, text: String(t), color, size, align, noHit: true });
  const bar = Math.abs(env.X(1) - env.X(0)) || 6, A = P[0], B = P[1], C = P[2];
  const side = (a, b) => ({ l: b.x < a.x, r: b.x >= a.x });          // which screen side a line through a -> b runs to
  const lv = (l) => style(l.color || col, 1, dash);
  const fill = (c = col) => `${c.length === 7 ? c : '#38bdf8'}26`;
  const sc = Math.abs(env.X(1) - env.X(0)) > 0 ? 1 : 1; void sc;

  switch (d.type) {
    case 'trend': if (B) seg(A, B, { l: !!d.extL, r: !!d.extR }); break;
    case 'extended': if (B) seg(A, B, { l: true, r: true }); break;
    case 'ray': if (B) seg(A, B, side(A, B)); break;
    case 'arrow': {
      if (!B) break; seg(A, B, { l: !!d.extL, r: !!d.extR });
      const ang = Math.atan2(B.y - A.y, B.x - A.x), h = 10 + w * 2;
      for (const s of [-0.45, 0.45]) seg(B, { x: B.x - Math.cos(ang + s) * h, y: B.y - Math.sin(ang + s) * h });
      break;
    }
    case 'horizontal': seg({ x: 0, y: A.y }, { x: env.W, y: A.y }, { l: true, r: true }); text(env.W - 4, A.y - 3, d.pts[0].p.toFixed(2), col, 'right'); break;
    case 'vertical': seg({ x: A.x, y: 0 }, { x: A.x, y: env.H }, { l: true, r: true }); break;
    case 'zigzag': out.push({ k: 'poly', pts: P, close: false, style: style(), fill: null }); break;
    case 'parallel': {
      if (!B) break;
      seg(A, B, { l: !!d.extL, r: !!d.extR });
      if (C) {
        const t = B.x === A.x ? 0 : (C.x - A.x) / (B.x - A.x), off = C.y - (A.y + (B.y - A.y) * t);
        const A2 = { x: A.x, y: A.y + off }, B2 = { x: B.x, y: B.y + off };
        if (d.fill) out.push({ k: 'poly', pts: [A, B, B2, A2], close: true, style: style(col, 0, []), fill: fill(col), noHit: true });
        seg(A2, B2, { l: !!d.extL, r: !!d.extR });
      }
      break;
    }
    case 'cycle': {
      if (!B || Math.abs(B.x - A.x) < 2) break;
      const step = B.x - A.x, n = Math.max(1, Math.min(60, Number(d.count) || 12));
      for (let k = 0; k <= n; k++) { const x = A.x + step * k; seg({ x, y: 0 }, { x, y: env.H }, { st: style(col, 1, k ? [3, 4] : dash), noHit: k > 1 }); }
      break;
    }
    case 'speed': {
      if (!B) break; const sd = side(A, B);
      seg(A, B, { ...sd });
      for (const r of [1 / 3, 2 / 3]) { const T = { x: B.x, y: A.y + (B.y - A.y) * r }; seg(A, T, { ...sd }); text(B.x + 3, T.y, r < 0.5 ? '1/3' : '2/3', col); }
      seg({ x: B.x, y: A.y }, B, { st: style(col, 1, [3, 4]), noHit: true });
      break;
    }
    case 'pitchfork': {
      if (!B || !C) { if (B) seg(A, B); break; }
      const M = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 }, v = { x: M.x - A.x, y: M.y - A.y }, sd = side(A, M);
      seg(A, M, { ...sd, st: style(col, w + 0.5) });
      seg(B, { x: B.x + v.x, y: B.y + v.y }, { ...sd }); seg(C, { x: C.x + v.x, y: C.y + v.y }, { ...sd });
      seg(B, C, { st: style(col, 1, [3, 4]) });
      if (d.fill) out.push({ k: 'poly', pts: [B, { x: B.x + v.x * 8, y: B.y + v.y * 8 }, { x: C.x + v.x * 8, y: C.y + v.y * 8 }, C], close: true, style: style(col, 0, []), fill: fill(col), noHit: true });
      break;
    }
    case 'raff': case 'stderr': case 'stddev': {
      if (!B) break;
      const x1 = env.tm.idxOfTime(d.pts[0].t), x2 = env.tm.idxOfTime(d.pts[1].t), ch = channel(env.bars, x1, x2, d.type, Number(d.mult) || 2);
      if (!ch) { seg(A, B); break; }
      const last = env.bars.c.length - 1, xe = d.extR ? last + Math.max(2, Math.ceil((env.W - env.X(last)) / bar)) : ch.i2;
      const line = (off) => [{ x: env.X(ch.i1), y: env.Y(ch.a + ch.b * ch.i1 + off) }, { x: env.X(xe), y: env.Y(ch.a + ch.b * xe + off) }];
      const mid = line(0), up = line(ch.up), dn = line(-ch.dn);
      if (d.fill) out.push({ k: 'poly', pts: [up[0], up[1], dn[1], dn[0]], close: true, style: style(col, 0, []), fill: fill(col), noHit: true });
      if (d.showMid !== false) seg(mid[0], mid[1], { st: style(col, w, [5, 4]) });
      if (d.showUp !== false) seg(up[0], up[1]);
      if (d.showDn !== false) seg(dn[0], dn[1]);
      break;
    }
    case 'fibRetr': {
      if (!B) break;
      seg(A, B, { st: style(col, 1, [3, 4]), noHit: false });
      const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x) + (Number(d.extFactor) || 0) * bar;
      for (const l of fibRetrLevels(d)) {
        const y = env.Y(l.price); if (!Number.isFinite(y)) continue;
        seg({ x: x0, y }, { x: x1, y }, { st: lv(l) });
        const tx = d.text === '$' ? l.price.toFixed(2) : d.text === '' ? '' : `${+(l.v * 100).toFixed(1)}%${d.text === 'both' ? ` (${l.price.toFixed(2)})` : ''}`;
        if (tx) text(x0 + 3, y - 3, tx, l.color || col);
      }
      break;
    }
    case 'fibExt': {
      if (!B) break;
      seg(A, B, { st: style(col, 1, [3, 4]) }); if (C) seg(B, C, { st: style(col, 1, [3, 4]) });
      if (!C) break;
      const x1 = C.x + (Number(d.extFactor) || 8) * bar;
      for (const l of fibExtLevels(d)) { const y = env.Y(l.price); if (!Number.isFinite(y)) continue; seg({ x: C.x, y }, { x: x1, y }, { st: lv(l) }); text(C.x + 3, y - 3, `${+(l.v * 100).toFixed(1)}% (${l.price.toFixed(2)})`, l.color || col); }
      break;
    }
    case 'fibTimeExt': {
      if (!B) break; const span = B.x - A.x; if (Math.abs(span) < 2) break;
      seg(A, B, { st: style(col, 1, [3, 4]) });
      for (const l of d.levels || []) if (l.show) { const x = B.x + span * l.v; seg({ x, y: 0 }, { x, y: env.H }, { st: lv(l) }); text(x + 3, 12, String(l.v), l.color || col); }
      break;
    }
    case 'fibZones': {
      if (!B) break; const unit = Math.max(Math.abs(B.x - A.x), bar) * (B.x >= A.x ? 1 : -1);
      for (const f of FIB_ZONES) { const x = A.x + unit * f; seg({ x, y: 0 }, { x, y: env.H }, { st: style(col, 1, f ? [3, 4] : dash), noHit: f > 1 }); text(x + 3, 12, String(f), col); }
      break;
    }
    case 'fibFan': {
      if (!B) break; const sd = side(A, B);
      seg(A, B, { ...sd, st: style(col, w + 0.5) });
      seg({ x: B.x, y: A.y }, B, { st: style(col, 1, [3, 4]), noHit: true });
      for (const l of d.levels || []) if (l.show) { const T = { x: B.x, y: B.y + (A.y - B.y) * l.v }; seg(A, T, { ...sd, st: lv(l) }); text(B.x + 3, T.y, `${+(l.v * 100).toFixed(1)}%`, l.color || col); }
      break;
    }
    case 'fibArc': {
      if (!B) break; const dist = Math.hypot(B.x - A.x, B.y - A.y), right = B.x >= A.x;
      seg(A, B, { st: style(col, 1, [3, 4]) });
      for (const l of d.levels || []) if (l.show) { const r = dist * l.v; out.push({ k: 'ellipse', cx: B.x, cy: B.y, rx: r, ry: r, a0: right ? -Math.PI / 2 : Math.PI / 2, a1: right ? Math.PI / 2 : Math.PI * 1.5, style: lv(l), fill: null }); text(B.x + (right ? r : -r) + 3, B.y, `${+(l.v * 100).toFixed(1)}%`, l.color || col); }
      break;
    }
    case 'gannFan': {
      if (!B || Math.abs(B.x - A.x) < 1) break; const sd = side(A, B), dx = B.x - A.x, dy = B.y - A.y;
      for (const [m, name] of GANN_ANGLES) { const T = { x: A.x + dx, y: A.y + dy * m }; seg(A, T, { ...sd, st: style(col, m === 1 ? w + 0.5 : w, m === 1 ? dash : [4, 3]) }); text(T.x + (sd.r ? 3 : -3), T.y, name, col, sd.r ? 'left' : 'right'); }
      break;
    }
    case 'gannSquare': {
      if (!B) break;
      const n = Math.max(2, Math.min(16, Number(d.divisions) || 8));
      out.push({ k: 'rect', x: Math.min(A.x, B.x), y: Math.min(A.y, B.y), w: Math.abs(B.x - A.x), h: Math.abs(B.y - A.y), style: style(), fill: null });
      for (let k = 1; k < n; k++) {
        const f = k / n, x = A.x + (B.x - A.x) * f, y = A.y + (B.y - A.y) * f, st = style(col, 1, k * 2 === n ? [] : [2, 4]);
        seg({ x, y: A.y }, { x, y: B.y }, { st, noHit: true }); seg({ x: A.x, y }, { x: B.x, y }, { st, noHit: true });
      }
      seg(A, B, { st: style(col, w + 0.5) }); seg({ x: A.x, y: B.y }, { x: B.x, y: A.y }, { st: style(col, 1, [5, 3]) });
      break;
    }
    case 'rect': if (B) out.push({ k: 'rect', x: Math.min(A.x, B.x), y: Math.min(A.y, B.y), w: Math.abs(B.x - A.x), h: Math.abs(B.y - A.y), style: style(), fill: d.fill ? fill(col) : null }); break;
    case 'ellipse': if (B) out.push({ k: 'ellipse', cx: (A.x + B.x) / 2, cy: (A.y + B.y) / 2, rx: Math.abs(B.x - A.x) / 2, ry: Math.abs(B.y - A.y) / 2, a0: 0, a1: Math.PI * 2, style: style(), fill: d.fill ? fill(col) : null }); break;
    case 'arc': if (B) out.push({ k: 'ellipse', cx: (A.x + B.x) / 2, cy: Math.max(A.y, B.y), rx: Math.abs(B.x - A.x) / 2, ry: Math.abs(B.y - A.y), a0: Math.PI, a1: Math.PI * 2, style: style(), fill: d.fill ? fill(col) : null }); break;
    case 'triangle': if (B) out.push({ k: 'poly', pts: C ? [A, B, C] : [A, B], close: !!C, style: style(), fill: C && d.fill ? fill(col) : null }); break;
    case 'text': out.push({ k: 'text', x: A.x, y: A.y, text: d.text || 'Text', color: col, size: Number(d.size) || 13, align: 'left', box: !!d.box }); break;
    default: break;
  }
  return out;
}

/** Where a segment really starts and ends once its "extend left / right" flags are applied. */
export function segEnds(p) {
  let a = { x: p.x1, y: p.y1 }, b = { x: p.x2, y: p.y2 };
  if (!p.extL && !p.extR) return [a.x, a.y, b.x, b.y];
  if (a.x > b.x || (a.x === b.x && a.y > b.y)) [a, b] = [b, a];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, K = BIG / len;
  if (Math.abs(dx) < 1e-6) return [a.x, -BIG, a.x, BIG];
  if (p.extL) a = { x: a.x - dx * K, y: a.y - dy * K };
  if (p.extR) b = { x: b.x + dx * K, y: b.y + dy * K };
  return [a.x, a.y, b.x, b.y];
}

export function draw(ctx, prims, { selected = false } = {}) {
  for (const p of prims) {
    ctx.save();
    if (p.style) { ctx.strokeStyle = p.style.color; ctx.lineWidth = (p.style.w || 1) + (selected ? 0.8 : 0); ctx.setLineDash(p.style.dash || []); }
    if (p.k === 'seg') { const [x1, y1, x2, y2] = segEnds(p); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    else if (p.k === 'poly') {
      ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); if (p.close) ctx.closePath();
      if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); } if (p.style.w > 0) ctx.stroke();
    } else if (p.k === 'rect') { if (p.fill) { ctx.fillStyle = p.fill; ctx.fillRect(p.x, p.y, p.w, p.h); } ctx.strokeRect(p.x, p.y, p.w, p.h); }
    else if (p.k === 'ellipse') {
      ctx.beginPath(); ctx.ellipse(p.cx, p.cy, Math.max(0.1, p.rx), Math.max(0.1, p.ry), 0, p.a0, p.a1);
      if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); } ctx.stroke();
    } else if (p.k === 'text') {
      ctx.font = `${p.size}px sans-serif`; ctx.textAlign = p.align || 'left'; ctx.textBaseline = 'middle';
      if (p.box) { const m = ctx.measureText(p.text).width; ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillRect(p.x - 4, p.y - p.size / 2 - 3, m + 8, p.size + 6); ctx.strokeStyle = p.color; ctx.setLineDash([]); ctx.strokeRect(p.x - 4, p.y - p.size / 2 - 3, m + 8, p.size + 6); }
      ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }
}

const distSeg = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

/** Distance in pixels from a point to the drawing's shapes (Infinity when none can be touched). */
export function distanceTo(prims, x, y) {
  let best = Infinity;
  for (const p of prims) {
    if (p.noHit) continue; let dd = Infinity;
    if (p.k === 'seg') { const [x1, y1, x2, y2] = segEnds(p); dd = distSeg(x, y, x1, y1, x2, y2); }
    else if (p.k === 'poly') {
      for (let i = 0; i + 1 < p.pts.length; i++) dd = Math.min(dd, distSeg(x, y, p.pts[i].x, p.pts[i].y, p.pts[i + 1].x, p.pts[i + 1].y));
      if (p.close && p.pts.length > 2) { const a = p.pts[p.pts.length - 1], b = p.pts[0]; dd = Math.min(dd, distSeg(x, y, a.x, a.y, b.x, b.y)); }
      if (p.close && p.fill && inside(p.pts, x, y)) dd = 0;
    } else if (p.k === 'rect') {
      dd = Math.min(distSeg(x, y, p.x, p.y, p.x + p.w, p.y), distSeg(x, y, p.x + p.w, p.y, p.x + p.w, p.y + p.h), distSeg(x, y, p.x + p.w, p.y + p.h, p.x, p.y + p.h), distSeg(x, y, p.x, p.y + p.h, p.x, p.y));
      if (p.fill && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) dd = 0;
    } else if (p.k === 'ellipse') {
      const rx = Math.max(1, p.rx), ry = Math.max(1, p.ry), ux = (x - p.cx) / rx, uy = (y - p.cy) / ry, r = Math.hypot(ux, uy);
      let ang = Math.atan2(uy, ux); const full = p.a1 - p.a0 >= Math.PI * 2 - 1e-6;
      let ok = full; if (!full) { const norm = (v) => ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); const a = norm(ang), s = norm(p.a0), e = s + (p.a1 - p.a0); ok = (a >= s && a <= e) || (a + Math.PI * 2 >= s && a + Math.PI * 2 <= e); }
      if (ok) dd = Math.abs(r - 1) * Math.min(rx, ry);
      if (ok && p.fill && r < 1) dd = 0;
      void ang;
    } else if (p.k === 'text') {
      const wd = p.text.length * p.size * 0.6, x0 = p.align === 'right' ? p.x - wd : p.x;
      if (x >= x0 - 4 && x <= x0 + wd + 4 && Math.abs(y - p.y) <= p.size / 2 + 4) dd = 0;
    }
    if (dd < best) best = dd;
  }
  return best;
}
function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
