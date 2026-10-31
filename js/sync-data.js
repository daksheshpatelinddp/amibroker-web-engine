// Moves the things you made in this browser (formulas, categories / watchlists / favorites, sheets and layouts, analysis settings and
// projects) to another device. Pure functions on a localStorage-like object, so they can be tested without a browser.
// Never included: the GitHub token and the AI key (they stay on the device).
export const SYNC_EXACT = ['amibroker_formulas_v1', 'amibroker_workspace_v1', 'amibroker_categories_v2', 'aa_settings_v1', 'aa_projects_v1', 'aa_last_v1',
  'amibroker_pseudo_v1', 'intraday_cfg_v1', 'user_databases_v1', 'active_db_v1', 'chart_crosshair_on', 'chart_nav_visible', 'drawings_hidden'];
export const SYNC_PREFIX = ['amibroker_categories_v2__'];                       // categories of the other markets
export const NEVER = ['aa_remote_cfg_v1', 'amibroker_ai_cfg_v1'];
export const MAX_PSEUDO_BYTES = 1.5e6;                                          // breadth / equity series can be large: left out above this
export const FORMULAS = 'amibroker_formulas_v1', WORKSPACE = 'amibroker_workspace_v1';
export const UNDO_KEY = 'sync_undo_v1';

export const isSyncKey = (k) => !NEVER.includes(k) && (SYNC_EXACT.includes(k) || SYNC_PREFIX.some((p) => String(k).startsWith(p)));
const keysOf = (st) => { const out = []; for (let i = 0; i < st.length; i++) out.push(st.key(i)); return out; };
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const isEmpty = (v) => v === null || v === undefined || v === '' || v === '{}' || v === '[]';

/** Everything of this device that can be synced -> { bundle, skipped } */
export function collect(storage, { device = 'this device', now = Date.now() } = {}) {
  const items = {}, skipped = [];
  for (const k of keysOf(storage).filter(isSyncKey).sort()) {
    const v = storage.getItem(k);
    if (v === null) continue;
    if (k === 'amibroker_pseudo_v1' && v.length > MAX_PSEUDO_BYTES) { skipped.push({ key: k, reason: `too big (${(v.length / 1e6).toFixed(1)} MB)` }); continue; }
    items[k] = v;
  }
  return { bundle: { v: 1, app: 'amibroker-web', savedAt: now, device, items }, skipped };
}

export function checkBundle(b) {
  if (!b || b.v !== 1 || !b.items || typeof b.items !== 'object') throw new Error('This is not a data backup of this app.');
  return b;
}

/** A few plain numbers about a set of items, for "this device" / "the copy" comparison. */
export function summarize(items) {
  const f = parse(items[FORMULAS]), w = parse(items[WORKSPACE]);
  const markets = Object.keys(items).filter((k) => k === 'amibroker_categories_v2' || k.startsWith('amibroker_categories_v2__')).map((k) => (k === 'amibroker_categories_v2' ? 'NSE' : k.split('__')[1].toUpperCase()));
  return { formulas: f && Array.isArray(f.formulas) ? f.formulas.length : 0, sheets: w && Array.isArray(w.sheets) ? w.sheets.length : 0, markets, keys: Object.keys(items).length };
}
export const itemsOf = (storage) => { const o = {}; for (const k of keysOf(storage).filter(isSyncKey)) o[k] = storage.getItem(k); return o; };

/**
 * What loading would write. mode 'replace': everything in the copy replaces this device's value.
 * mode 'add': formulas are joined (a formula in both keeps the newer one), everything else is taken only when this device has none.
 */
export function plan(storage, bundle, mode) {
  checkBundle(bundle);
  const writes = {}, notes = [];
  for (const [k, v] of Object.entries(bundle.items)) {
    if (!isSyncKey(k) || typeof v !== 'string') continue;
    const local = storage.getItem(k);
    if (mode === 'add' && k === FORMULAS) {
      const l = (parse(local) || {}).formulas || [], r = (parse(v) || {}).formulas || [], byId = new Map(l.filter((x) => x && x.id).map((x) => [x.id, x]));
      let added = 0, newer = 0;
      for (const x of r) { if (!x || !x.id) continue; const have = byId.get(x.id); if (!have) { byId.set(x.id, x); added++; } else if ((x.updated || 0) > (have.updated || 0)) { byId.set(x.id, x); newer++; } }
      if (added || newer) writes[k] = JSON.stringify({ v: 1, formulas: [...byId.values()] });
      notes.push(`Formulas: ${added} added${newer ? `, ${newer} updated to the newer version` : ''}, ${byId.size} in total`);
    } else if (mode === 'add') {
      if (isEmpty(local)) writes[k] = v;
    } else if (local !== v) writes[k] = v;
  }
  return { writes, notes };
}

/** Writes the plan; returns what was there before (for Undo). */
export function apply(storage, pl) {
  const undo = {};
  for (const [k, v] of Object.entries(pl.writes)) { undo[k] = storage.getItem(k); storage.setItem(k, v); }
  return undo;
}
export function restore(storage, undo) { for (const [k, v] of Object.entries(undo || {})) { if (v === null) storage.removeItem(k); else storage.setItem(k, v); } }

// ---- The PUBLIC library (everyone who opens the app gets it) ---------------------------------------------------------------------
// Only things that are fine to show to anybody: no tokens, no AI key, no server settings, no per-device state.
export const PUBLIC_EXACT = ['amibroker_formulas_v1', 'amibroker_workspace_v1', 'amibroker_categories_v2', 'aa_settings_v1', 'aa_projects_v1'];
export const PUBLIC_PREFIX = ['amibroker_categories_v2__'];
export const APPLIED_KEY = 'shared_applied_v1';                    // { version, hashes } of the last public copy this device took
export const isPublicKey = (k) => !NEVER.includes(k) && (PUBLIC_EXACT.includes(k) || PUBLIC_PREFIX.some((p) => String(k).startsWith(p)));
export const hash32 = (s) => { let h = 0x811c9dc5; const t = String(s); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };

export function collectPublic(storage, { device = 'this device', now = Date.now() } = {}) {
  const items = {};
  for (const k of keysOf(storage).filter(isPublicKey).sort()) { const v = storage.getItem(k); if (v !== null && !isEmpty(v)) items[k] = v; }
  return { v: 1, app: 'amibroker-web', public: true, savedAt: now, device, items };
}

/**
 * What to take from the public copy, automatically.
 *  - a NEW device (no formulas of its own, never loaded before) takes everything;
 *  - formulas are joined: the ones you have stay, new ones arrive, a formula changed in the public copy replaces an older one;
 *  - anything else (categories, sheets, settings ...) is updated only when you have not changed it since it was last loaded
 *    (or you have none); what you changed yourself is never overwritten.
 * force = true: replace everything with the public copy.
 */
export function planFollow(storage, bundle, state, { force = false } = {}) {
  checkBundle(bundle);
  const fx = parse(storage.getItem(FORMULAS)), newDevice = !state && !(fx && Array.isArray(fx.formulas) && fx.formulas.length);
  const writes = {}, notes = []; let touched = 0;
  for (const [k, v] of Object.entries(bundle.items)) {
    if (!isPublicKey(k) || typeof v !== 'string') continue;
    const local = storage.getItem(k);
    if (k === FORMULAS && !force && !newDevice) {
      const l = (parse(local) || {}).formulas || [], r = (parse(v) || {}).formulas || [], byId = new Map(l.filter((x) => x && x.id).map((x) => [x.id, x]));
      let added = 0, newer = 0;
      for (const x of r) { if (!x || !x.id) continue; const have = byId.get(x.id); if (!have) { byId.set(x.id, x); added++; } else if ((x.updated || 0) > (have.updated || 0)) { byId.set(x.id, x); newer++; } }
      if (added || newer) { writes[k] = JSON.stringify({ v: 1, formulas: [...byId.values()] }); notes.push(`formulas: ${added} new${newer ? `, ${newer} updated` : ''}`); }
    } else if (force || newDevice || isEmpty(local) || (state && state.hashes && state.hashes[k] === hash32(local))) {
      if (local !== v) { writes[k] = v; touched++; }
    }
  }
  return { writes, notes, newDevice, touched };
}

/** The record kept after a load: for every public item, the hash of the value that matches the public copy (so "unchanged by you" can be told later). */
export function nextState(storage, bundle, prev, writes) {
  const hashes = { ...((prev && prev.hashes) || {}) };
  for (const [k, v] of Object.entries(bundle.items)) { if (!isPublicKey(k)) continue; if (k in writes) { if (k !== FORMULAS) hashes[k] = hash32(writes[k]); } else if (storage.getItem(k) === v) hashes[k] = hash32(v); }
  return { version: String(bundle.savedAt), hashes };
}
