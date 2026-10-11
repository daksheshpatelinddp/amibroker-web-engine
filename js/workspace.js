// Workspace = the list of sheets, each sheet = a symbol + a stack of panes.
// No DOM in here: it only holds the data, changes it, and saves it in the browser.

import { formulaStore } from './formula-store.js';

const STORAGE_KEY = 'amibroker_workspace_v1';
let counter = 0;
const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export const PANE_KINDS = {
  price:    'Price (candles)',
  volume:   'Volume',
  delivery: 'Delivery qty',
  delpct:   'Delivery %',
  rsi:      'RSI',
  macd:     'MACD',
  custom:   'Custom line',
  afl:      'Formula (AFL)',
};

export const OVERLAY_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#f87171', '#fbbf24', '#e2e8f0'];
export const OVERLAY_TYPES = { sma: 'SMA', ema: 'EMA' };
const SOURCE_LABELS = { close: 'Close', open: 'Open', high: 'High', low: 'Low', volume: 'Volume', delivery: 'Delivery', delpct: 'Delivery %' };

export function paneTitle(p) {
  switch (p.kind) {
    case 'price': return 'Price';
    case 'volume': return 'Volume';
    case 'delivery': return 'Delivery qty';
    case 'delpct': return 'Delivery %';
    case 'rsi': return `RSI(${p.params.period || 14})`;
    case 'macd': return `MACD(${p.params.fast || 12},${p.params.slow || 26},${p.params.signal || 9})`;
    case 'afl': {
      const f = formulaStore.get(p.params.formulaId);
      return f ? f.name : 'Formula (missing)';
    }
    case 'custom': {
      const src = SOURCE_LABELS[p.params.source] || 'Close';
      const t = p.params.transform;
      return !t || t === 'none' ? src : `${src} ${t.toUpperCase()}(${p.params.period || 14})`;
    }
    default: return p.kind;
  }
}

export function overlayTitle(o) {
  return `${OVERLAY_TYPES[o.type] || o.type.toUpperCase()}(${o.period})`;
}

function defaultParams(kind, given = {}) {
  switch (kind) {
    case 'rsi': return { period: clampInt(given.period, 14, 2, 200) };
    case 'macd': return { fast: 12, slow: 26, signal: 9 };
    case 'afl': return { formulaId: given.formulaId || '', values: { ...(given.values || {}) } };
    case 'custom': return {
      source: given.source || 'close',
      transform: given.transform || 'none',
      period: clampInt(given.period, 20, 2, 500),
    };
    default: return {};
  }
}

function clampInt(v, dflt, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function newPane(kind, params) {
  let weight = kind === 'price' ? 3 : 1;
  if (kind === 'afl') { const f = formulaStore.get(params && params.formulaId); if (f && f.weight) weight = f.weight; }
  return {
    id: uid('p'),
    kind,
    weight,
    params: defaultParams(kind, params),
    overlays: [],
  };
}

function newSheet(name, symbol, panes) {
  return {
    id: uid('s'),
    name,
    symbol,
    locked: false,
    symbolLinkIdx: 0,     // 0 = not linked, 1..4 = link colour group
    intervalLinkIdx: 0,
    panes: panes || [newPane('price'), newPane('volume')],
  };
}

export class Workspace {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null), key = STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
    this.sheets = [];
    this.activeId = null;
    this.load();
  }

  // ---- saving ----
  load() {
    try {
      const raw = this.storage && this.storage.getItem(this.key);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.sheets) && data.sheets.length > 0 && data.sheets.every(validSheet)) {
          this.sheets = data.sheets;
          this.activeId = data.sheets.some(s => s.id === data.activeId) ? data.activeId : data.sheets[0].id;
          return;
        }
      }
    } catch (e) { /* fall through to a fresh workspace */ }
    const first = newSheet('Sheet 1', 'RELIANCE');
    this.sheets = [first];
    this.activeId = first.id;
  }

  save() {
    try {
      if (this.storage) this.storage.setItem(this.key, JSON.stringify({ v: 1, activeId: this.activeId, sheets: this.sheets }));
    } catch (e) { /* storage full or blocked: the workspace still works for this visit */ }
  }

  // ---- sheets ----
  get(id) { return this.sheets.find(s => s.id === id) || null; }
  active() { return this.get(this.activeId) || this.sheets[0]; }

  setActive(id) {
    if (this.get(id)) { this.activeId = id; this.save(); }
    return this.active();
  }

  // "Sheet N" with the smallest N not already used as a name
  nextDefaultName() {
    const used = new Set(this.sheets.map(s => s.name));
    let n = 1;
    while (used.has(`Sheet ${n}`)) n++;
    return `Sheet ${n}`;
  }

  addSheet(symbol) {
    const sheet = newSheet(this.nextDefaultName(), symbol || this.active().symbol);
    this.sheets.push(sheet);
    this.activeId = sheet.id;
    this.save();
    return sheet;
  }

  /** A new sheet (same symbol as the current one) that shows just one formula: a "blank chart" with a formula on it. */
  addFormulaSheet(formulaId, symbol) {
    const f = formulaStore.get(formulaId);
    const sheet = newSheet(this.nextDefaultName(), symbol || this.active().symbol, [newPane('afl', { formulaId })]);
    if (f && f.weight) sheet.panes[0].weight = Math.max(f.weight, 3);
    this.sheets.push(sheet);
    this.activeId = sheet.id;
    this.save();
    return sheet;
  }

  removeSheet(id) {
    if (this.sheets.length <= 1) return false;
    const i = this.sheets.findIndex(s => s.id === id);
    if (i < 0) return false;
    this.sheets.splice(i, 1);
    if (this.activeId === id) this.activeId = this.sheets[Math.min(i, this.sheets.length - 1)].id;
    this.save();
    return true;
  }

  renameSheet(id, name) {
    const s = this.get(id);
    const clean = String(name == null ? '' : name).trim().slice(0, 24);
    if (!s || !clean) return false;
    s.name = clean;
    this.save();
    return true;
  }

  // Changes the symbol of a sheet. Unlocked sheets in the same symbol-link colour group follow.
  setSymbol(id, symbol) {
    const s = this.get(id);
    if (!s || !symbol) return [];
    const changed = [];
    if (s.symbol !== symbol) { s.symbol = symbol; changed.push(s.id); }
    if (s.symbolLinkIdx > 0) {
      for (const o of this.sheets) {
        if (o.id !== s.id && !o.locked && o.symbolLinkIdx === s.symbolLinkIdx && o.symbol !== symbol) {
          o.symbol = symbol; changed.push(o.id);
        }
      }
    }
    if (changed.length) this.save();
    return changed;
  }

  toggleLock(id) { const s = this.get(id); if (s) { s.locked = !s.locked; this.save(); } }
  cycleLink(id, which, groups = 5) {
    const s = this.get(id); if (!s) return;
    const key = which === 'interval' ? 'intervalLinkIdx' : 'symbolLinkIdx';
    s[key] = (s[key] + 1) % groups;
    this.save();
  }

  // ---- panes ----
  addPane(sheetId, kind, params = {}) {
    const s = this.get(sheetId);
    if (!s || !PANE_KINDS[kind]) return null;
    const p = newPane(kind, params);
    s.panes.push(p);
    this.save();
    return p;
  }

  removePane(sheetId, paneId) {
    const s = this.get(sheetId);
    if (!s || s.panes.length <= 1) return false;   // a sheet always keeps at least one pane
    const i = s.panes.findIndex(p => p.id === paneId);
    if (i < 0) return false;
    s.panes.splice(i, 1);
    this.save();
    return true;
  }

  movePane(sheetId, paneId, delta) {
    const s = this.get(sheetId);
    if (!s) return false;
    const i = s.panes.findIndex(p => p.id === paneId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= s.panes.length) return false;
    [s.panes[i], s.panes[j]] = [s.panes[j], s.panes[i]];
    this.save();
    return true;
  }

  setPaneParamValues(sheetId, paneId, values) {
    const p = this.getPane(sheetId, paneId);
    if (!p || p.kind !== 'afl') return false;
    p.params.values = { ...values };
    this.save();
    return true;
  }

  getPane(sheetId, paneId) {
    const s = this.get(sheetId);
    return s ? (s.panes.find(p => p.id === paneId) || null) : null;
  }

  // ---- overlays (moving averages drawn on top of a pane's own data) ----
  addOverlay(sheetId, paneId, { type = 'sma', period = 20, color } = {}) {
    const p = this.getPane(sheetId, paneId);
    if (!p || !OVERLAY_TYPES[type]) return null;
    const o = {
      id: uid('o'),
      type,
      period: clampInt(period, 20, 2, 500),
      color: color || OVERLAY_COLORS[p.overlays.length % OVERLAY_COLORS.length],
    };
    p.overlays.push(o);
    this.save();
    return o;
  }

  removeOverlay(sheetId, paneId, overlayId) {
    const p = this.getPane(sheetId, paneId);
    if (!p) return false;
    const i = p.overlays.findIndex(o => o.id === overlayId);
    if (i < 0) return false;
    p.overlays.splice(i, 1);
    this.save();
    return true;
  }
}

function validSheet(s) {
  return s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.symbol === 'string' &&
    Array.isArray(s.panes) && s.panes.length > 0 &&
    s.panes.every(p => p && typeof p.id === 'string' && PANE_KINDS[p.kind] && p.params && Array.isArray(p.overlays));
}
