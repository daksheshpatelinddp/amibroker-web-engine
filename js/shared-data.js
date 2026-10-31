// The public library: every device loads it by itself when the app opens, and the owner publishes to it from File > Sync data.
// It is one file (app-data.json) in a PUBLIC GitHub repo, read without any login. Rules for what is taken: see planFollow in sync-data.js.
import { SHARED_DATA } from './config.js';
import { GhClient } from './remote-analysis.js';
import { checkBundle, collectPublic, planFollow, nextState, apply, hash32, APPLIED_KEY, UNDO_KEY, isPublicKey } from './sync-data.js';

const CFG_KEY = 'shared_cfg_v1';
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };

export const sharedCfg = (storage = ls()) => ({ repo: SHARED_DATA.repo, branch: SHARED_DATA.branch, auto: true, ...(parse(storage && storage.getItem(CFG_KEY)) || {}) });
export const saveSharedCfg = (c, storage = ls()) => { try { storage.setItem(CFG_KEY, JSON.stringify({ repo: c.repo, branch: c.branch, auto: c.auto !== false })); } catch (e) { /* ignore */ } };
/** raw.githubusercontent.com is public, needs no login and allows reading from any web page. The minute in the address keeps its short cache fresh. */
export const sharedUrl = (c, now = Date.now()) => `https://raw.githubusercontent.com/${c.repo}/${c.branch}/${SHARED_DATA.file}?t=${Math.floor(now / 60000)}`;

export async function fetchShared(cfg, { fetchFn = (...a) => fetch(...a), timeoutMs = 6000 } = {}) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetchFn(sharedUrl(cfg), { cache: 'no-store', signal: ctl && ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return checkBundle(await r.json());
  } finally { if (timer) clearTimeout(timer); }
}

/**
 * Runs when the app opens. Returns { status: 'off' | 'unavailable' | 'current' | 'nothing-new' | 'loaded', n }.
 * Quiet: no network, no public copy yet, or nothing new means nothing happens. When something was taken the page reloads once.
 */
export async function autoLoadShared({ storage = ls(), fetchFn, reload = () => location.reload(), notify = () => {}, force = false, session = (typeof sessionStorage !== 'undefined' ? sessionStorage : null) } = {}) {
  if (!storage) return { status: 'off' };
  const cfg = sharedCfg(storage); if (!cfg.auto && !force) return { status: 'off' };
  let bundle; try { bundle = await fetchShared(cfg, { fetchFn }); } catch (e) { return { status: 'unavailable', error: e.message }; }
  if (!bundle) return { status: 'unavailable' };
  const state = parse(storage.getItem(APPLIED_KEY));
  if (!force && state && state.version === String(bundle.savedAt)) return { status: 'current' };
  const pl = planFollow(storage, bundle, state, { force }), n = Object.keys(pl.writes).length;
  const undo = apply(storage, pl);
  try { storage.setItem(APPLIED_KEY, JSON.stringify(nextState(storage, bundle, state, pl.writes))); } catch (e) { /* the next start tries again */ }
  if (!n) return { status: 'nothing-new', n: 0 };
  try { storage.setItem(UNDO_KEY, JSON.stringify({ at: Date.now(), items: undo })); } catch (e) { /* too big to keep */ }
  const guard = 'shared_reloaded', ver = String(bundle.savedAt);
  if (session && session.getItem(guard) === ver) return { status: 'loaded', n, reloaded: false };           // never reload twice for the same copy
  try { session && session.setItem(guard, ver); } catch (e) { /* ignore */ }
  notify(pl.newDevice ? 'Loading the shared formulas and categories…' : `Shared library updated (${pl.notes.join('; ') || `${n} item${n === 1 ? '' : 's'}`}). Reloading…`);
  setTimeout(reload, 900);
  return { status: 'loaded', n, reloaded: true, newDevice: pl.newDevice };
}

/** Publish this device's public items (needs a token that can write to the shared repo, which must be PUBLIC). */
export async function publishShared({ cfg, token, storage = ls(), device = 'device', client }) {
  const cl = client || new GhClient({ repo: cfg.repo, token, branch: cfg.branch });
  const info = await cl.repoInfo();
  if (info.private) throw new Error(`The repo ${cfg.repo} is PRIVATE, so nobody could read it. Make it public (repo Settings → Danger zone → Change visibility) or use another repo.`);
  const bundle = collectPublic(storage, { device });
  if (!Object.keys(bundle.items).length) throw new Error('This device has nothing to publish yet (no formulas or categories).');
  await cl.put(SHARED_DATA.file, bundle, `Publish: shared library from ${device}`);
  const hashes = {}; for (const [k, v] of Object.entries(bundle.items)) if (isPublicKey(k) && k !== 'amibroker_formulas_v1') hashes[k] = hash32(v);
  try { storage.setItem(APPLIED_KEY, JSON.stringify({ version: String(bundle.savedAt), hashes })); } catch (e) { /* ignore */ }
  return bundle;
}
