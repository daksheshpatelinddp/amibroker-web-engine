// Databases the app can use. Each database is one market (NSE, BSE, NASDAQ ...) with its own symbols, categories, watchlists,
// favorites and indexes. To add a market: upload its files to R2 in its own folder, then either add a block below
// or use Symbols · Categories · Watchlists > "＋ Add database" (saved in this browser).
// Public address of the R2 bucket. Every database lives in its own folder inside it:
//   <R2_PUBLIC_URL>/nse/2023.parquet   <R2_PUBLIC_URL>/bse/2023.parquet   ...
export const R2_PUBLIC_URL = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';

// The PUBLIC library: formulas, categories, watchlists ... that every device loads automatically when the app opens (File > Sync data > Publish).
// It is a file in a PUBLIC GitHub repo; reading it needs no login. Change the repo here if you named it differently.
export const SHARED_DATA = { repo: 'daksheshpatelinddp/amibroker-shared-data', branch: 'main', file: 'app-data.json' };

// shown in Symbols · Categories so you can see that the new files are the ones running (Render deploys, browser cache)
export const APP_BUILD = '2026-10-31b';

export const DATABASES = {
  nse: {
    id: 'nse',
    name: 'NSE',
    baseUrl: `${R2_PUBLIC_URL}/nse`,   // files: <baseUrl>/<year>.parquet
    firstYear: 2000,                   // years with no file on R2 are skipped automatically
    currency: 'INR',
  },
  // bse:    { id: 'bse',    name: 'BSE',    baseUrl: `${R2_PUBLIC_URL}/bse`,    firstYear: 2000, currency: 'INR' },
  // nasdaq: { id: 'nasdaq', name: 'NASDAQ', baseUrl: `${R2_PUBLIC_URL}/nasdaq`, firstYear: 2000, currency: 'USD' },
};

const USER_KEY = 'user_databases_v1', ACTIVE_KEY = 'active_db_v1';
const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 24);

// Databases added by the user in this browser
export function userDatabases(storage = store()) {
  try { const j = JSON.parse((storage && storage.getItem(USER_KEY)) || '[]'); return Array.isArray(j) ? j.filter((d) => d && slug(d.id) && d.name && d.folder) : []; } catch (e) { return []; }
}
for (const d of userDatabases()) {
  const id = slug(d.id);
  if (!DATABASES[id]) DATABASES[id] = { id, name: String(d.name), baseUrl: `${R2_PUBLIC_URL}/${slug(d.folder) || id}`, firstYear: Number(d.firstYear) || 2000, currency: d.currency || 'INR', user: true };
}

/** Adds a database (returns its id, or '' when the name or folder is not usable or already exists). Takes effect after a reload. */
export function addUserDatabase({ name, folder, currency = 'INR', firstYear = 2000 }, storage = store()) {
  const id = slug(folder || name); if (!id || !String(name || '').trim() || DATABASES[id] || !storage) return '';
  const list = userDatabases(storage); list.push({ id, name: String(name).trim(), folder: id, currency, firstYear });
  try { storage.setItem(USER_KEY, JSON.stringify(list)); } catch (e) { return ''; }
  return id;
}
export function removeUserDatabase(id, storage = store()) {
  if (!storage) return;
  try { storage.setItem(USER_KEY, JSON.stringify(userDatabases(storage).filter((d) => slug(d.id) !== id))); if (storage.getItem(ACTIVE_KEY) === id) storage.removeItem(ACTIVE_KEY); } catch (e) { /* ignore */ }
}

/** The database the app is showing. Changing it needs a reload (the data engine is built once at start). */
export function setActiveDb(id, storage = store()) { if (DATABASES[id] && storage) { try { storage.setItem(ACTIVE_KEY, id); } catch (e) { /* ignore */ } } }
export const ACTIVE_DB = (() => { const s = store(); let id = null; try { id = s && s.getItem(ACTIVE_KEY); } catch (e) { /* ignore */ } return id && DATABASES[id] ? id : 'nse'; })();
export const symbolListKey = (id = ACTIVE_DB) => (id === 'nse' ? 'symbol_list' : `symbol_list__${id}`);   // the saved symbol list of a database
