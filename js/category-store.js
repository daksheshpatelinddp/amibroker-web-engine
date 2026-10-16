// Categories like AmiBroker's: Groups, Markets, Sectors, Industries, GICS, ICB (one category per symbol)
// and Watchlists, Favorites, Indexes (a symbol can be in any number of them), plus ALL.
// Pure data + parsing: no DOM, so it can be tested in Node. The UI is in categories-ui.js.

import { ACTIVE_DB, DATABASES } from './config.js';
export const UNASSIGNED = '(Unassigned)';

export const TYPES = [
  { id: 'all', label: 'All', kind: 'all', one: 'All symbols', help: 'Every symbol in the database.' },
  { id: 'groups', label: 'Groups', kind: 'exclusive', one: 'group', help: 'Each symbol is in exactly one group (Stocks, Indices, ETFs...).' },
  { id: 'markets', label: 'Markets', kind: 'exclusive', one: 'market', help: 'Each symbol is in exactly one market (NSE, BSE...).' },
  { id: 'sectors', label: 'Sectors', kind: 'sector', one: 'sector', help: 'Top-level classification. Giving a symbol an industry also gives it that industry\'s sector.' },
  { id: 'industries', label: 'Industries', kind: 'industry', one: 'industry', help: 'Finer classification inside a sector.' },
  { id: 'watchlists', label: 'Watchlists', kind: 'free', one: 'watchlist', help: 'Any symbol can be in any number of watchlists.' },
  { id: 'favorites', label: 'Favorites', kind: 'fav', one: 'favorites list', help: 'Your starred symbols.' },
  { id: 'indexes', label: 'Indexes', kind: 'free', one: 'index', help: 'The indices of this market (NIFTY 50, SENSEX...), not stocks. Tap a name to open its chart; ▤ shows the stocks inside it (used by InIndex() in formulas).' },
  { id: 'gics', label: 'GICS', kind: 'code', one: 'GICS category', help: 'Global Industry Classification Standard. A code such as 4510 also belongs to its parent 45.' },
  { id: 'icb', label: 'ICB', kind: 'code', one: 'ICB category', help: 'Industry Classification Benchmark. A code such as 8300 also belongs to its parent 8000.' },
];
export const typeInfo = (id) => TYPES.find((t) => t.id === id);

// ---- AmiBroker's default templates (broker.sectors / broker.industries) ---------------------------------------
export const DEFAULT_SECTORS = ['Basic Materials', 'Capital Goods', 'Conglomerates', 'Consumer Cyclical', 'Consumer/Non-Cyclical', 'Energy', 'Financial', 'Healthcare', 'Services', 'Technology', 'Transportation', 'Utilities'];
const IND = {
  'Basic Materials': ['Agricultural Chemicals', 'Aluminum', 'Chemicals - Major Diversified', 'Copper', 'Gold', 'Industrial Metals & Minerals', 'Nonmetallic Mineral Mining', 'Silver', 'Specialty Chemicals', 'Steel & Iron', 'Synthetics'],
  'Capital Goods': ['Aerospace/Defense - Major Diversified', 'Aerospace/Defense Products & Services', 'Farm & Construction Machinery', 'Industrial Equipment & Components', 'Metal Fabrication', 'Pollution & Treatment Controls', 'Small Tools & Accessories'],
  'Conglomerates': ['Conglomerates'],
  'Consumer Cyclical': ['Auto & Truck Manufacturers', 'Auto Parts', 'Home Furnishings & Fixtures', 'Housewares & Accessories', 'Recreational Vehicles', 'Textile - Apparel Clothing', 'Footwear & Accessories', 'Toys & Games', 'Sporting Goods', 'Jewelry', 'Photographic Equipment & Supplies', 'Rubber & Plastics'],
  'Consumer/Non-Cyclical': ['Beverages - Alcoholic', 'Beverages - Soft Drinks', 'Food - Major Diversified', 'Packaged Foods', 'Farm Products', 'Tobacco Products', 'Personal Products', 'Cleaning Products'],
  'Energy': ['Oil & Gas - Integrated', 'Oil & Gas - Drilling & Exploration', 'Oil & Gas - Refining & Marketing', 'Coal'],
  'Financial': ['Money Center Banks', 'Regional Banks', 'Savings & Loans', 'Asset Management', 'Credit Services', 'Insurance - Life', 'Insurance - Property & Casualty', 'Insurance Brokers', 'Investment Brokerage', 'Real Estate Investment Trusts (REIT)'],
  'Healthcare': ['Drug Manufacturers', 'Biotechnology', 'Medical Instruments & Supplies', 'Health Care Plans'],
  'Services': ['Advertising Agencies', 'Broadcasting - Radio', 'Broadcasting - TV', 'CATV Systems', 'Education & Training Services', 'Entertainment - Diversified', 'Gaming Activities', 'Grocery Stores', 'Home Improvement Stores', 'Department Stores', 'Apparel Stores', 'Specialty Retail', 'Restaurants', 'Lodging', 'Resorts & Casinos', 'Personal Services', 'Publishing - Newspapers', 'Publishing - Periodicals', 'Rental & Leasing Services', 'Security & Protection Services', 'Staffing & Outsourcing Services', 'Waste Management', 'Business Services', 'Auto Dealerships', 'Drug Stores'],
  'Technology': ['Application Software', 'Business Software & Services', 'Communication Equipment', 'Computer Hardware', 'Data Storage Devices', 'Diversified Communication Services', 'Information Technology Services', 'Internet Software & Services', 'Semiconductors', 'Telecom Services - Domestic', 'Wireless Communications'],
  'Transportation': ['Airlines', 'Railroads', 'Trucking', 'Shipping', 'Air Delivery & Freight Services', 'Air Services, Other'],
  'Utilities': ['Electric Utilities', 'Gas Utilities', 'Water Utilities'],
};
export const DEFAULT_INDUSTRIES = Object.entries(IND).flatMap(([sector, list]) => list.map((name) => ({ name, sector })));
export const DEFAULT_GROUPS = ['Stocks', 'Indices', 'ETFs', 'Futures', 'Currencies', 'Bonds', 'Mutual Funds'];
export const DEFAULT_MARKETS = ['NSE', 'BSE', 'NYSE', 'Nasdaq', 'AMEX', 'MCX'];
export const DEFAULT_INDEXES = ['NIFTY 50', 'NIFTY NEXT 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY MIDCAP 100', 'NIFTY SMALLCAP 100', 'SENSEX'];
export const DEFAULT_GICS = ['10 Energy', '15 Materials', '20 Industrials', '25 Consumer Discretionary', '30 Consumer Staples', '35 Health Care', '40 Financials', '45 Information Technology', '50 Communication Services', '55 Utilities', '60 Real Estate',
  '1010 Energy', '1510 Materials', '2010 Capital Goods', '2020 Commercial & Professional Services', '2030 Transportation', '2510 Automobiles & Components', '2520 Consumer Durables & Apparel', '2530 Consumer Services', '2550 Retailing',
  '3010 Food & Staples Retailing', '3020 Food, Beverage & Tobacco', '3030 Household & Personal Products', '3510 Health Care Equipment & Services', '3520 Pharmaceuticals, Biotechnology & Life Sciences',
  '4010 Banks', '4020 Diversified Financials', '4030 Insurance', '4040 Real Estate', '4510 Software & Services', '4520 Technology Hardware & Equipment', '4530 Semiconductors & Semiconductor Equipment',
  '5010 Telecommunication Services', '5020 Media & Entertainment', '5510 Utilities', '6010 Real Estate'];
export const DEFAULT_ICB = ['0001 Oil & Gas', '1000 Basic Materials', '2000 Industrials', '3000 Consumer Goods', '4000 Health Care', '5000 Consumer Services', '6000 Telecommunications', '7000 Utilities', '8000 Financials', '9000 Technology',
  '0500 Oil & Gas', '1300 Chemicals', '1700 Basic Resources', '2300 Construction & Materials', '2700 Industrial Goods & Services', '3300 Automobiles & Parts', '3500 Food & Beverage', '3700 Personal & Household Goods', '4500 Health Care',
  '5300 Retail', '5500 Media', '5700 Travel & Leisure', '6500 Telecommunications', '7500 Utilities', '8300 Banks', '8500 Insurance', '8600 Real Estate', '8700 Financial Services', '9500 Technology'];

const OLD_KEY = 'amibroker_categories';
// Each database (market) keeps its own categories. NSE keeps the key used before databases were separated.
const keyFor = (db) => (db === 'nse' ? 'amibroker_categories_v2' : `amibroker_categories_v2__${db}`);

// Index names of each market (the indices themselves, not their stocks) and other names the database may use for them.
export const DEFAULT_INDEXES_BY_DB = {
  nse: DEFAULT_INDEXES,
  bse: ['SENSEX', 'BSE 100', 'BSE 200', 'BSE 500', 'BSE MIDCAP', 'BSE SMALLCAP'],
  nasdaq: ['NASDAQ 100', 'NASDAQ COMPOSITE'],
};
export const INDEX_ALIASES = {
  NIFTY50: ['NIFTY', 'NSEI', 'CNXNIFTY'], NIFTYNEXT50: ['NIFTYJR', 'CNXNXT50', 'NIFTYNEXT'], NIFTYBANK: ['BANKNIFTY', 'CNXBANK', 'NSEBANK'], NIFTYIT: ['CNXIT'],
  NIFTYMIDCAP100: ['CNXMIDCAP', 'NIFTYMIDCAP'], NIFTYSMALLCAP100: ['CNXSMALLCAP', 'NIFTYSMALLCAP'], SENSEX: ['BSESN', 'BSE30', 'SENSEX30'],
  NASDAQ100: ['NDX', 'NASDAQ100INDEX'], NASDAQCOMPOSITE: ['IXIC', 'COMP', 'NASDAQ'],
};
export const normIndexName = (s) => String(s || '').toUpperCase().replace(/^\^/, '').replace(/[^A-Z0-9]/g, '');
const codeOf = (name) => String(name).split(/\s+/)[0];

// ---- symbol text helpers -------------------------------------------------------------------------------------
/** Cleans one symbol as typed or imported: quotes, "NSE:" prefix, case; matches the database spelling when known. */
export function normSymbol(raw, dbMap = null) {
  let s = String(raw || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!s) return '';
  s = s.toUpperCase();
  if (s.includes(':')) s = s.slice(s.lastIndexOf(':') + 1);
  const hit = (x) => (dbMap && dbMap.get(x)) || null;
  if (hit(s)) return hit(s);
  const stripped = s.replace(/\.(NS|BO|BSE|NSE)$/, '');
  if (hit(stripped)) return hit(stripped);
  const noSeries = stripped.replace(/-(EQ|BE|BZ|SM|N1|IL)$/, '');   // exchange series suffix of a broker export (RELIANCE-EQ)
  if (noSeries !== stripped && hit(noSeries)) return hit(noSeries);
  return s;
}
export const dbMapOf = (all) => new Map((all || []).map((s) => [String(s).toUpperCase(), s]));
const HEADER_WORDS = new Set(['SYMBOL', 'SYMBOLS', 'TICKER', 'TICKERS', 'SCRIP', 'NAME', 'CODE']);
const looksLikeSymbol = (t) => /^[A-Z0-9^&._~\-+]{1,32}$/i.test(t);

/**
 * Reads a TXT / TLS / CSV watch list.
 *  - one symbol per line, or many separated by commas / spaces / semicolons (AmiBroker .tls, TradingView export)
 *  - "###Section" lines (TradingView) start a new list: result.sections
 *  - a CSV with a header row (Symbol / Ticker ...) uses that column
 *  - "#", "//" and ";" lines are comments
 */
export function parseSymbolText(text, all = null) {
  const db = dbMapOf(all);
  const lines = String(text || '').replace(/^﻿/, '').replace(/\0/g, '').split(/\r?\n/);   // NUL characters = a UTF-16 file read as UTF-8
  const sections = {}; let cur = '', symbols = [], seen = new Set();
  const push = (raw) => {
    const s = normSymbol(raw, db); if (!s || !looksLikeSymbol(s) || HEADER_WORDS.has(s)) return;
    if (!seen.has(s)) { seen.add(s); symbols.push(s); }
    if (cur) { (sections[cur] = sections[cur] || []); if (!sections[cur].includes(s)) sections[cur].push(s); }
  };
  const body = lines.map((l) => l.trim()).filter((l) => l);
  // CSV with a header row: choose the symbol column
  const head = body[0] ? body[0].split(/[,\t;]/).map((x) => x.trim().replace(/^["']|["']$/g, '').toLowerCase()) : [];
  const col = head.findIndex((h) => ['symbol', 'ticker', 'scrip', 'tradingsymbol', 'symbols', 'code'].includes(h));
  if (col >= 0 && head.length > 1) {
    body.slice(1).forEach((l) => { const c = l.split(/[,\t;]/); push(c[col]); });
    return { symbols, sections: {} };
  }
  for (const l of body) {
    if (l.startsWith('#') && !l.startsWith('###') || l.startsWith('//') || l.startsWith(';')) continue;
    // TradingView writes everything on ONE line: ###Section 1,NSE:AAA,NSE:BBB,###Section 2,NSE:CCC  (a section name may contain spaces)
    for (const part of l.split(/[,;\t|]+/)) {
      const tok = part.trim(); if (!tok) continue;
      if (tok.startsWith('###')) { cur = tok.replace(/^#+/, '').trim(); if (cur) sections[cur] = sections[cur] || []; continue; }
      tok.split(/\s+/).forEach(push);
    }
  }
  return { symbols, sections };
}

/** Splits CSV-ish text into rows of cells (handles quotes). */
function csvRows(text) {
  return String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',' || ch === '\t' || ch === ';') { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim()); return out;
  });
}

// ---- the store -------------------------------------------------------------------------------------------------
function fresh(db = 'nse') {
  return {
    v: 2,
    names: { groups: [...DEFAULT_GROUPS], markets: db === 'nse' ? [...DEFAULT_MARKETS] : [((DATABASES[db] || {}).name) || db.toUpperCase()], watchlists: [], indexes: [...(DEFAULT_INDEXES_BY_DB[db] || [])], gics: [...DEFAULT_GICS], icb: [...DEFAULT_ICB] },
    sectors: [...DEFAULT_SECTORS],
    industries: DEFAULT_INDUSTRIES.map((x) => ({ ...x })),
    assign: { groups: {}, markets: {}, sectors: {}, industries: {}, gics: {}, icb: {} },
    lists: { watchlists: {}, indexes: {} },
    favorites: [],
    indexSym: {},          // index name -> the database symbol whose chart it opens (when the automatic match is wrong)
  };
}

export class CategoryStore {
  constructor(storage = null, dbId = 'nse') {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.dbId = dbId; this.KEY = keyFor(dbId);
    this.listeners = [];
    this.data = this._load() || fresh(dbId);
    if (!this.data.indexSym) this.data.indexSym = {};
    if (dbId === 'nse') this._migrateOld();
  }
  _load() { try { const s = this.storage && this.storage.getItem(this.KEY); if (s) { const d = JSON.parse(s); if (d && d.v === 2) return d; } } catch (e) {} return null; }
  save() { try { this.storage && this.storage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} this.listeners.forEach((f) => { try { f(); } catch (e) {} }); }
  onChange(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((x) => x !== fn); }; }

  /** Folders you made in the first version of this screen (groups / sectors / industries / watchlists / favorites) move over. */
  _migrateOld() {
    let old = null; try { const s = this.storage && this.storage.getItem(OLD_KEY); if (s) old = JSON.parse(s); } catch (e) {}
    if (!old || this.data.migrated) return;
    const d = this.data;
    for (const [type, folders] of Object.entries({ groups: old.groups, markets: old.markets })) for (const [n, syms] of Object.entries(folders || {})) { if (!d.names[type].includes(n)) d.names[type].push(n); (syms || []).forEach((s) => { d.assign[type][normSymbol(s)] = n; }); }
    for (const [n, syms] of Object.entries(old.sectors || {})) { if (!d.sectors.includes(n)) d.sectors.push(n); (syms || []).forEach((s) => { d.assign.sectors[normSymbol(s)] = n; }); }
    for (const [n, syms] of Object.entries(old.industries || {})) { if (!d.industries.some((x) => x.name === n)) d.industries.push({ name: n, sector: '' }); (syms || []).forEach((s) => { d.assign.industries[normSymbol(s)] = n; }); }
    for (const [n, syms] of Object.entries(old.watchlists || {})) { d.lists.watchlists[n] = d.lists.watchlists[n] || []; (syms || []).forEach((s) => { const x = normSymbol(s); if (!d.lists.watchlists[n].includes(x)) d.lists.watchlists[n].push(x); }); if (!d.names.watchlists.includes(n)) d.names.watchlists.push(n); }
    (Array.isArray(old.favorites) ? old.favorites : []).forEach((s) => { const x = normSymbol(s); if (!d.favorites.includes(x)) d.favorites.push(x); });
    d.migrated = true; this.save();
  }

  // ------------------------------------------------------------ listing
  kind(type) { return (typeInfo(type) || {}).kind; }
  isFree(type) { return this.kind(type) === 'free'; }
  /** Names of the categories of a type. Exclusive types end with "(Unassigned)". */
  names(type) {
    const k = this.kind(type), d = this.data;
    if (k === 'all') return ['ALL'];
    if (k === 'fav') return ['Favorites'];
    if (k === 'sector') return [...d.sectors, UNASSIGNED];
    if (k === 'industry') return [...d.industries.map((x) => x.name), UNASSIGNED];
    if (k === 'free') return [...d.names[type]];
    return [...d.names[type], UNASSIGNED];
  }
  industriesOf(sector) { return this.data.industries.filter((x) => x.sector === sector).map((x) => x.name); }
  sectorOfIndustry(name) { const x = this.data.industries.find((i) => i.name === name); return x ? x.sector : ''; }

  _sectorOf(sym) {
    const a = this.data.assign, ind = a.industries[sym];
    if (ind) { const s = this.sectorOfIndustry(ind); if (s) return s; }
    return a.sectors[sym] || '';
  }
  /** Symbols in a category. `all` = the database list (needed for ALL and "(Unassigned)"). */
  members(type, name, all = []) {
    const k = this.kind(type), d = this.data;
    if (k === 'all') return [...all];
    if (k === 'fav') return [...d.favorites];
    if (k === 'free') return [...((d.lists[type] || {})[name] || [])];
    const syms = new Set([...Object.keys(d.assign[type] || {}), ...(type === 'sectors' ? Object.keys(d.assign.industries) : [])]);
    const keep = (s) => {
      let cat;
      if (type === 'sectors') cat = this._sectorOf(s); else cat = (d.assign[type] || {})[s] || '';
      if (name === UNASSIGNED) return !cat;
      if (k === 'code') { if (cat === name) return true; const pre = this._parentPrefix(type, codeOf(name)); return !!(cat && pre && cat !== name && codeOf(cat).startsWith(pre)); }
      return cat === name;
    };
    if (name === UNASSIGNED) return all.filter((s) => keep(s));
    return [...syms].filter(keep);
  }
  /** GICS: a 2-digit code is the parent of every 4-digit code that starts with it. ICB: x000 (and 0001) is the parent of every code starting with its first digit. */
  _parentPrefix(type, code) { if (type === 'gics') return code.length === 2 ? code : null; return code.endsWith('000') || code === '0001' ? code[0] : null; }
  count(type, name, all = []) { return this.members(type, name, all).length; }
  /** Every category a symbol belongs to: [{type,name}]. */
  categoriesOf(sym) {
    const out = [], d = this.data, s = String(sym).toUpperCase();
    for (const t of TYPES) {
      if (t.kind === 'all') continue;
      if (t.kind === 'fav') { if (d.favorites.includes(s)) out.push({ type: t.id, name: 'Favorites' }); continue; }
      if (t.kind === 'free') { for (const n of d.names[t.id]) if ((d.lists[t.id][n] || []).includes(s)) out.push({ type: t.id, name: n }); continue; }
      const cat = t.id === 'sectors' ? this._sectorOf(s) : (d.assign[t.id] || {})[s];
      if (cat) out.push({ type: t.id, name: cat });
    }
    return out;
  }

  // ------------------------------------------------------------ editing categories
  _clean(name) { return String(name || '').replace(/\s+/g, ' ').trim(); }
  add(type, name, opts = {}) {
    name = this._clean(name); const k = this.kind(type), d = this.data;
    if (!name || name === UNASSIGNED || ['all', 'fav'].includes(k)) return false;
    if (this.names(type).some((n) => n.toLowerCase() === name.toLowerCase())) return false;
    if (k === 'sector') d.sectors.push(name);
    else if (k === 'industry') d.industries.push({ name, sector: opts.sector || '' });
    else { d.names[type].push(name); if (k === 'free') d.lists[type][name] = []; }
    this.save(); return true;
  }
  rename(type, oldName, newName) {
    newName = this._clean(newName); const k = this.kind(type), d = this.data;
    if (!newName || newName === UNASSIGNED || oldName === UNASSIGNED || ['all', 'fav'].includes(k) || newName === oldName) return false;
    if (this.names(type).some((n) => n.toLowerCase() === newName.toLowerCase() && n !== oldName)) return false;
    const mapAssign = (t) => { for (const s of Object.keys(d.assign[t])) if (d.assign[t][s] === oldName) d.assign[t][s] = newName; };
    if (k === 'sector') { d.sectors = d.sectors.map((n) => (n === oldName ? newName : n)); d.industries.forEach((i) => { if (i.sector === oldName) i.sector = newName; }); mapAssign('sectors'); }
    else if (k === 'industry') { d.industries.forEach((i) => { if (i.name === oldName) i.name = newName; }); mapAssign('industries'); }
    else if (k === 'free') { d.names[type] = d.names[type].map((n) => (n === oldName ? newName : n)); d.lists[type][newName] = d.lists[type][oldName] || []; delete d.lists[type][oldName]; if (type === 'indexes' && d.indexSym && d.indexSym[oldName]) { d.indexSym[newName] = d.indexSym[oldName]; delete d.indexSym[oldName]; } }
    else { d.names[type] = d.names[type].map((n) => (n === oldName ? newName : n)); mapAssign(type); }
    this.save(); return true;
  }
  remove(type, name) {
    const k = this.kind(type), d = this.data;
    if (name === UNASSIGNED || ['all', 'fav'].includes(k)) return false;
    const unassign = (t) => { for (const s of Object.keys(d.assign[t])) if (d.assign[t][s] === name) delete d.assign[t][s]; };
    if (k === 'sector') { d.sectors = d.sectors.filter((n) => n !== name); d.industries.forEach((i) => { if (i.sector === name) i.sector = ''; }); unassign('sectors'); }
    else if (k === 'industry') { d.industries = d.industries.filter((i) => i.name !== name); unassign('industries'); }
    else if (k === 'free') { d.names[type] = d.names[type].filter((n) => n !== name); delete d.lists[type][name]; if (type === 'indexes' && d.indexSym) delete d.indexSym[name]; }
    else { d.names[type] = d.names[type].filter((n) => n !== name); unassign(type); }
    this.save(); return true;
  }
  setIndustrySector(industry, sector) { const x = this.data.industries.find((i) => i.name === industry); if (!x) return false; x.sector = sector || ''; this.save(); return true; }

  // ------------------------------------------------------------ editing members
  /** Put symbols into a category. Exclusive types move them (a symbol has one group / market / sector...); lists just add. Returns how many changed. */
  addSymbols(type, name, symbols) {
    const k = this.kind(type), d = this.data, db = null; let n = 0;
    const syms = symbols.map((s) => normSymbol(s, db)).filter(Boolean);
    if (k === 'all') return 0;
    if (k === 'fav') { for (const s of syms) if (!d.favorites.includes(s)) { d.favorites.push(s); n++; } }
    else if (k === 'free') { if (!d.names[type].includes(name)) return 0; const l = (d.lists[type][name] = d.lists[type][name] || []); for (const s of syms) if (!l.includes(s)) { l.push(s); n++; } }
    else {
      if (name === UNASSIGNED) return this.removeSymbols(type, name, syms);
      const exists = this.names(type).includes(name); if (!exists) return 0;
      for (const s of syms) {
        if (k === 'industry') { d.assign.industries[s] = name; delete d.assign.sectors[s]; }
        else if (k === 'sector') { const ind = d.assign.industries[s]; if (ind && this.sectorOfIndustry(ind) !== name) delete d.assign.industries[s]; d.assign.sectors[s] = name; }
        else d.assign[type][s] = name;
        n++;
      }
    }
    if (n) this.save(); return n;
  }
  removeSymbols(type, name, symbols) {
    const k = this.kind(type), d = this.data; let n = 0;
    const syms = symbols.map((s) => String(s).toUpperCase());
    if (k === 'fav') { const b = d.favorites.length; d.favorites = d.favorites.filter((s) => !syms.includes(s)); n = b - d.favorites.length; }
    else if (k === 'free') { const l = d.lists[type][name] || [], b = l.length; d.lists[type][name] = l.filter((s) => !syms.includes(s)); n = b - d.lists[type][name].length; }
    else if (k !== 'all') { for (const s of syms) { if (type === 'sectors') { if (d.assign.sectors[s] || d.assign.industries[s]) { delete d.assign.sectors[s]; delete d.assign.industries[s]; n++; } } else if (d.assign[type][s]) { delete d.assign[type][s]; n++; } } }
    if (n) this.save(); return n;
  }
  clear(type, name, all = []) { const m = this.members(type, name, all); return this.removeSymbols(type, name, m); }
  isFavorite(sym) { return this.data.favorites.includes(String(sym).toUpperCase()); }
  toggleFavorite(sym) { const s = String(sym).toUpperCase(); if (this.isFavorite(s)) this.removeSymbols('favorites', 'Favorites', [s]); else this.addSymbols('favorites', 'Favorites', [s]); return this.isFavorite(s); }

  // ------------------------------------------------------------ choosing categories (pickers, AFL)
  /** Flat list for a drop-down: [{key:"watchlists|Name", type, name, label, count}] */
  options(all = [], { withEmpty = true, types = null } = {}) {
    const out = [];
    for (const t of TYPES) {
      if (types && !types.includes(t.id)) continue;
      for (const name of this.names(t.id)) {
        if (name === UNASSIGNED && t.kind !== 'all') continue;
        const count = this.count(t.id, name, all);
        if (!withEmpty && !count) continue;
        out.push({ key: `${t.id}|${name}`, type: t.id, name, count, label: t.kind === 'all' ? `ALL (${count})` : `${t.label}: ${name} (${count})` });
      }
    }
    return out;
  }
  /** Symbols for a key from options(). `all` filters unknown symbols out when `onlyKnown`. */
  resolve(key, all = [], onlyKnown = true) {
    const i = String(key).indexOf('|'); const type = key.slice(0, i), name = key.slice(i + 1);
    const m = this.members(type, name, all);
    if (!onlyKnown || !all.length) return m;
    const db = dbMapOf(all), out = [], seen = new Set();
    for (const s of m) { const x = normSymbol(s, db); if (db.has(x.toUpperCase()) && !seen.has(x)) { seen.add(x); out.push(db.get(x.toUpperCase())); } }
    return out;
  }
  /** Find a category by (case-insensitive) name, optionally within one type. */
  find(name, type = null) {
    for (const t of TYPES) { if (type && t.id !== type) continue; const hit = this.names(t.id).find((n) => n.toLowerCase() === String(name).toLowerCase()); if (hit) return { type: t.id, name: hit }; }
    return null;
  }

  // ------------------------------------------------------------ import / export
  /** Import a TXT / TLS / CSV into one category. Returns {added, total, unknown:[symbols not in the database]}. */
  importInto(type, name, text, all = []) {
    const { symbols } = parseSymbolText(text, all);
    return this._finishImport(type, name, symbols, all);
  }
  _finishImport(type, name, symbols, all) {
    const db = dbMapOf(all), unknown = all.length ? symbols.filter((s) => !db.has(s.toUpperCase())) : [];
    const added = this.addSymbols(type, name, symbols);
    return { added, total: symbols.length, unknown };
  }
  /** A file that has "###Section" headings (TradingView) becomes one new list per section. Returns [{name, added}] or null when there are none. */
  importSections(type, text, all = []) {
    const { sections } = parseSymbolText(text, all); const names = Object.keys(sections);
    if (!names.length || this.kind(type) !== 'free') return null;
    return names.map((n) => { this.add(type, n); const hit = this.names(type).find((x) => x.toLowerCase() === n.toLowerCase()) || n; return { name: hit, ...this._finishImport(type, hit, sections[n], all) }; });
  }
  /**
   * CSV with columns like AmiBroker's ASCII import: Symbol, Group, Market, Sector, Industry, GICS, ICB, Watchlist, Index.
   * Creates missing categories, assigns each symbol. Returns {rows, assigned, created}.
   */
  importClassification(text, all = []) {
    const rows = csvRows(text); if (rows.length < 2) return { rows: 0, assigned: 0, created: 0 };
    const head = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
    const sc = head.findIndex((h) => ['symbol', 'ticker', 'scrip', 'tradingsymbol'].includes(h)); if (sc < 0) return { rows: 0, assigned: 0, created: 0, error: 'No Symbol / Ticker column' };
    const cols = { groups: ['group', 'groups'], markets: ['market', 'markets'], sectors: ['sector', 'sectors'], industries: ['industry', 'industries'], gics: ['gics'], icb: ['icb'], watchlists: ['watchlist', 'watchlists'], indexes: ['index', 'indexes'], favorites: ['favorite', 'favorites', 'favourite'] };
    const db = dbMapOf(all); let assigned = 0, created = 0;
    for (const r of rows.slice(1)) {
      const sym = normSymbol(r[sc], db); if (!sym) continue;
      for (const [type, aliases] of Object.entries(cols)) {
        const ci = head.findIndex((h) => aliases.includes(h)); if (ci < 0) continue; const v = (r[ci] || '').trim(); if (!v) continue;
        if (type === 'favorites') { if (/^(1|y|yes|true|x|\*)$/i.test(v)) assigned += this.addSymbols('favorites', 'Favorites', [sym]); continue; }
        const names = this.kind(type) === 'free' ? v.split(/[|]/).map((x) => x.trim()).filter(Boolean) : [v];
        for (const nm of names) {
          let hit = this.names(type).find((n) => n.toLowerCase() === nm.toLowerCase());
          if (!hit) { if (this.add(type, nm)) created++; hit = nm; }
          assigned += this.addSymbols(type, hit, [sym]);
        }
      }
    }
    return { rows: rows.length - 1, assigned, created };
  }
  /** Lines "code name" (like AmiBroker's GICS.txt / ICB.txt) become GICS / ICB categories. */
  importCodes(type, text) {
    if (this.kind(type) !== 'code') return 0; let n = 0;
    for (const l of String(text || '').split(/\r?\n/)) { const m = /^\s*(\d{1,8})[\s,;\t]+(.+?)\s*$/.exec(l); if (m && this.add(type, `${m[1]} ${m[2].replace(/^["']|["']$/g, '')}`)) n++; }
    return n;
  }
  exportTxt(type, name, all = []) { return this.members(type, name, all).join('\r\n') + '\r\n'; }
  exportTls(type, name, all = []) { return this.members(type, name, all).join(',') + '\r\n'; }
  exportCsv(all = []) {
    const syms = new Set(all); Object.values(this.data.assign).forEach((m) => Object.keys(m).forEach((s) => syms.add(s)));
    for (const t of ['watchlists', 'indexes']) Object.values(this.data.lists[t]).forEach((l) => l.forEach((s) => syms.add(s)));
    this.data.favorites.forEach((s) => syms.add(s));
    const q = (x) => (/[",\r\n]/.test(x) ? `"${String(x).replace(/"/g, '""')}"` : x), d = this.data;
    const lines = ['Symbol,Group,Market,Sector,Industry,GICS,ICB,Watchlist,Index,Favorite'];
    for (const s of [...syms].sort()) {
      const wl = d.names.watchlists.filter((n) => (d.lists.watchlists[n] || []).includes(s)).join('|');
      const ix = d.names.indexes.filter((n) => (d.lists.indexes[n] || []).includes(s)).join('|');
      lines.push([s, d.assign.groups[s] || '', d.assign.markets[s] || '', this._sectorOf(s), d.assign.industries[s] || '', d.assign.gics[s] || '', d.assign.icb[s] || '', wl, ix, d.favorites.includes(s) ? 'yes' : ''].map(q).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }
  exportJson() { return JSON.stringify(this.data, null, 1); }
  importJson(text) { const d = JSON.parse(text); if (!d || d.v !== 2 || !d.names) throw new Error('Not a categories backup file'); this.data = d; this.save(); }
  resetDefaults() { this.data = fresh(this.dbId); this.save(); }

  // ------------------------------------------------------------ indexes (the index instruments of this market)
  /** The database symbol whose chart an index opens, or '' when the database has none. all = symbols of the database. */
  indexSymbol(name, all = [], map = null) {
    const m = map || new Map(all.map((s) => [normIndexName(s), s]));
    const cands = [this.data.indexSym[name], name, ...(INDEX_ALIASES[normIndexName(name)] || [])].filter(Boolean);
    for (const c of cands) { const hit = m.get(normIndexName(c)); if (hit) return hit; }
    return '';
  }
  /** [{name, symbol, members}] for the Indexes tab; symbol is '' when the database has no chart for that index. */
  indexRows(all = []) {
    const m = new Map(all.map((s) => [normIndexName(s), s]));
    return this.names('indexes').map((name) => ({ name, symbol: this.indexSymbol(name, all, m), members: this.count('indexes', name, all) }));
  }
  setIndexSymbol(name, symbol) { if (symbol) this.data.indexSym[name] = String(symbol).trim().toUpperCase(); else delete this.data.indexSym[name]; this.save(); }
}

// One store per database. categoryStore() = the database the app is showing; categoryStore('bse') = another one.
const _stores = new Map();
export function categoryStore(dbId = ACTIVE_DB) { if (!_stores.has(dbId)) _stores.set(dbId, new CategoryStore(null, dbId)); return _stores.get(dbId); }
