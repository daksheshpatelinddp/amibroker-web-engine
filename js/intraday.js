// Intraday time frames (1 min, 5 min, 45 min, 2 hours ...) built from the bars of the intraday server (server/server.js).
// A frame is written '<minutes>m' ('5m', '45m', '120m'). Bars are cut from the session start (NSE 09:15) like AmiBroker does,
// so a 45 min frame has bars 09:15, 10:00, 10:45 ... Times are Indian time (IST); a bar is labelled with its START time.
// The server can only give 1, 5, 15, 30 and 60 minute bars, so any other frame is built from the biggest of those that divides it
// (45 min from 15 min bars, 90 min from 30 min bars, 7 min from 1 min bars ...).

export const SESSION_START = 9 * 60 + 15;          // minutes after midnight
export const IST_SECONDS = 19800;
export const SOURCES = [60, 30, 15, 5, 1];         // minutes the server can deliver
export const DEFAULT_FRAMES = [1, 5, 15, 30, 45, 60];
export const MAX_FRAME = 1440;

export const isIntraday = (tf) => /^\d{1,4}m$/.test(String(tf || ''));
export const frameMinutes = (tf) => (isIntraday(tf) ? parseInt(tf, 10) : 0);
export const frameId = (minutes) => `${Math.round(minutes)}m`;

/** '5 min', '45 min', '1 hour', '2 hours', '1 h 30 min' */
export function frameName(tf) {
  const n = frameMinutes(tf);
  if (!n) return String(tf);
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60), m = n % 60;
  return m ? `${h} h ${m} min` : (h === 1 ? '1 hour' : `${h} hours`);
}
/** Short text for the time-frame box: 1m 5m 15m 1h 2h 90m */
export function frameShort(tf) {
  const n = frameMinutes(tf);
  if (!n) return String(tf);
  return n >= 60 && n % 60 === 0 ? `${n / 60}h` : `${n}m`;
}

/**
 * What the user typed -> minutes (a whole number 1..1440) or null.
 * "5" "5m" "5 min" "45 minutes" -> minutes;  "2h" "2 hours" "1.5h" "1h30m" -> hours.  A bare number is minutes unless unit = 'h'.
 */
export function parseFrame(text, unit = 'm') {
  const s = String(text == null ? '' : text).trim().toLowerCase().replace(/,/g, '.');
  if (!s) return null;
  let m = s.match(/^(\d+)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/);
  let minutes;
  if (m) minutes = parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  else if ((m = s.match(/^(\d*\.?\d+)\s*h(?:ours?|rs?)?$/))) minutes = Math.round(parseFloat(m[1]) * 60);
  else if ((m = s.match(/^(\d*\.?\d+)\s*(?:m|min|mins|minutes?)?$/))) {
    const v = parseFloat(m[1]);
    minutes = /[a-z]/.test(s) || unit !== 'h' ? Math.round(v) : Math.round(v * 60);
  } else return null;
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= MAX_FRAME ? minutes : null;
}

/** The server interval used to build an N minute frame: the largest of 60/30/15/5/1 that divides N. */
export function sourceFor(minutes) {
  const n = Math.round(minutes);
  return SOURCES.find((s) => n % s === 0) || 1;
}

const pad = (x) => String(x).padStart(2, '0');

/** epoch seconds (UTC) -> { day: 'YYYY-MM-DD', minute: minutes after midnight IST } */
export function istParts(sec) {
  const s = sec + IST_SECONDS, dayNo = Math.floor(s / 86400), minute = Math.floor((s - dayNo * 86400) / 60);
  return { day: new Date(dayNo * 86400000).toISOString().slice(0, 10), dayNo, minute };
}

/**
 * Server bars [{t,o,h,l,c,v}] (t = epoch seconds) -> rows of an N minute frame [{date:'YYYY-MM-DD HH:MM', open, high, low, close, volume, delivery}].
 * Buckets start at the session start of each day. A frame of a day or more gives one bar per day.
 */
export function buildFrame(bars, minutes, symbol = '') {
  const n = Math.max(1, Math.round(minutes)), out = [];
  let key = null, cur = null;
  const sorted = (bars || []).filter((b) => b && b.c > 0).sort((a, b) => a.t - b.t);
  for (const b of sorted) {
    const p = istParts(b.t);
    const idx = n >= 375 ? 0 : Math.floor((p.minute - SESSION_START) / n);
    const k = `${p.dayNo}|${idx}`;
    if (k !== key) {
      key = k;
      const start = n >= 375 ? SESSION_START : SESSION_START + idx * n;
      const s = Math.max(0, Math.min(1439, start));
      cur = { symbol, date: `${p.day} ${pad(Math.floor(s / 60))}:${pad(s % 60)}`, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v || 0, delivery: NaN };
      out.push(cur);
    } else {
      if (b.h > cur.high) cur.high = b.h;
      if (b.l < cur.low) cur.low = b.l;
      cur.close = b.c; cur.volume += b.v || 0;
    }
  }
  return out;
}

/** 'YYYY-MM-DD HH:MM' -> a number the chart can use as time. IST clock time is stored as if it were UTC so the axis shows IST. */
export function chartTime(label) {
  const s = String(label);
  if (s.length <= 10) return s;
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)) / 1000;
}

// ------------------------------------------------------------------ settings (saved in this browser)
const KEY = 'intraday_cfg_v1';

export function defaultConfig() {
  const local = typeof location !== 'undefined' && /^(localhost|127\.)/.test(location.hostname || '');
  return { url: local ? 'http://localhost:8787' : '', frames: [...DEFAULT_FRAMES], refreshSeconds: 60, range: '' };
}

export function cleanFrames(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= MAX_FRAME && !seen.has(x) && seen.add(x)).sort((a, b) => a - b);
}

export function loadConfig(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const d = defaultConfig();
  try {
    const raw = storage && storage.getItem(KEY);
    if (!raw) return d;
    const j = JSON.parse(raw), frames = cleanFrames(j.frames);
    return { url: typeof j.url === 'string' ? j.url.trim().replace(/\/+$/, '') : d.url, frames: frames.length ? frames : d.frames,
      refreshSeconds: Number.isFinite(+j.refreshSeconds) ? Math.max(0, Math.round(+j.refreshSeconds)) : d.refreshSeconds, range: typeof j.range === 'string' ? j.range : '' };
  } catch (e) { return d; }
}

export function saveConfig(cfg, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const c = { ...cfg, url: String(cfg.url || '').trim().replace(/\/+$/, ''), frames: cleanFrames(cfg.frames) };
  if (!c.frames.length) c.frames = [...DEFAULT_FRAMES];
  try { if (storage) storage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* storage full or blocked */ }
  return c;
}

// ------------------------------------------------------------------ fetching
const memo = new Map();

/** Rows of an N minute frame for a symbol. cfg.url is the intraday server. Results are kept for 30 s so redraws are free. */
export async function fetchFrame(symbol, minutes, cfg = loadConfig(), { fetchImpl = (typeof fetch !== 'undefined' ? fetch : null), force = false } = {}) {
  if (!cfg.url) throw new Error('Intraday server address is not set. Open Tools > Intraday data and enter it (for example http://localhost:8787).');
  const src = sourceFor(minutes), key = `${cfg.url}|${symbol}|${src}|${cfg.range || ''}`, hit = memo.get(key);
  let bars;
  if (hit && !force && Date.now() - hit.at < 30000) bars = hit.bars;
  else {
    const q = `symbol=${encodeURIComponent(symbol)}&interval=${src}m` + (cfg.range ? `&range=${encodeURIComponent(cfg.range)}` : '');
    let r;
    try { r = await fetchImpl(`${cfg.url}/api/intraday?${q}`); } catch (e) { throw new Error(`Cannot reach the intraday server (${cfg.url}). Is it running? ${e.message || e}`); }
    let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
    if (!r.ok) throw new Error((j && j.error) || `Intraday server answered ${r.status}`);
    bars = (j && j.bars) || [];
    memo.set(key, { at: Date.now(), bars }); if (memo.size > 60) memo.delete(memo.keys().next().value);
  }
  return buildFrame(bars, minutes, symbol);
}

export function clearIntradayCache() { memo.clear(); }
