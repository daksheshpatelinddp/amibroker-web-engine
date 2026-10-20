// Builds ONE classification CSV from NSE's index constituent files (niftyindices.com), ready for the app:
//   Symbols · Categories · Watchlists > (bottom) Import classification CSV
//   Groups     = every index the symbol is in (NIFTY 50, NIFTY NEXT 50, NIFTY 500, NIFTY BANK ...), many per symbol
//   Sectors    = the "Industry" column of NSE's files (Financial Services, Healthcare, Information Technology ...)
//   Industries = the narrowest sector index the symbol is in (Private Bank, PSU Bank, IT, Pharma, Auto ...)
// Run where niftyindices.com can be reached (your computer, or a GitHub Action):
//   node tools/build-nse-categories.mjs [out.csv]
// An index file that cannot be downloaded is skipped and listed at the end; edit INDEXES below to add / fix names.
import fs from 'fs';
import { pathToFileURL } from 'url';

export const BASE = 'https://www.niftyindices.com/IndexConstituent/';
// [group name, file, narrow?]  narrow = a sector index: gives the symbol its Industry (first one listed wins, so list narrow before wide)
export const INDEXES = [
  ['NIFTY 50', 'ind_nifty50list.csv'], ['NIFTY NEXT 50', 'ind_niftynext50list.csv'], ['NIFTY 100', 'ind_nifty100list.csv'], ['NIFTY 200', 'ind_nifty200list.csv'], ['NIFTY 500', 'ind_nifty500list.csv'],
  ['NIFTY MIDCAP 50', 'ind_niftymidcap50list.csv'], ['NIFTY MIDCAP 100', 'ind_niftymidcap100list.csv'], ['NIFTY MIDCAP 150', 'ind_niftymidcap150list.csv'],
  ['NIFTY SMALLCAP 50', 'ind_niftysmallcap50list.csv'], ['NIFTY SMALLCAP 100', 'ind_niftysmallcap100list.csv'], ['NIFTY SMALLCAP 250', 'ind_niftysmallcap250list.csv'],
  ['NIFTY LARGEMIDCAP 250', 'ind_niftylargemidcap250list.csv'], ['NIFTY MIDSMALLCAP 400', 'ind_niftymidsmallcap400list.csv'], ['NIFTY MICROCAP 250', 'ind_niftymicrocap250_list.csv'], ['NIFTY TOTAL MARKET', 'ind_niftytotalmarket_list.csv'],
  ['NIFTY PRIVATE BANK', 'ind_nifty_privatebanklist.csv', 'Private Bank'], ['NIFTY PSU BANK', 'ind_niftypsubanklist.csv', 'PSU Bank'], ['NIFTY BANK', 'ind_niftybanklist.csv', 'Bank'],
  ['NIFTY IT', 'ind_niftyitlist.csv', 'IT'], ['NIFTY PHARMA', 'ind_niftypharmalist.csv', 'Pharma'], ['NIFTY HEALTHCARE', 'ind_niftyhealthcarelist.csv', 'Healthcare'], ['NIFTY AUTO', 'ind_niftyautolist.csv', 'Auto'],
  ['NIFTY FMCG', 'ind_niftyfmcglist.csv', 'FMCG'], ['NIFTY METAL', 'ind_niftymetallist.csv', 'Metal'], ['NIFTY REALTY', 'ind_niftyrealtylist.csv', 'Realty'], ['NIFTY MEDIA', 'ind_niftymedialist.csv', 'Media'],
  ['NIFTY OIL & GAS', 'ind_niftyoilgaslist.csv', 'Oil & Gas'], ['NIFTY ENERGY', 'ind_niftyenergylist.csv', 'Energy'], ['NIFTY CONSUMER DURABLES', 'ind_niftyconsumerdurableslist.csv', 'Consumer Durables'],
  ['NIFTY CHEMICALS', 'ind_niftychemicalslist.csv', 'Chemicals'], ['NIFTY FINANCIAL SERVICES', 'ind_niftyfinancelist.csv', 'Financial Services'],
  ['NIFTY INFRASTRUCTURE', 'ind_niftyinfralist.csv'], ['NIFTY COMMODITIES', 'ind_niftycommoditieslist.csv'], ['NIFTY INDIA CONSUMPTION', 'ind_niftyindiaconsumptionlist.csv'], ['NIFTY PSE', 'ind_niftypselist.csv'], ['NIFTY SERVICES SECTOR', 'ind_niftyservicelist.csv'],
  ['NIFTY MNC', 'ind_niftymnclist.csv'], ['NIFTY DIVIDEND OPPORTUNITIES 50', 'ind_niftydivopp50list.csv'], ['NIFTY ALPHA 50', 'ind_nifty_alpha50list.csv'], ['NIFTY100 LOW VOLATILITY 30', 'ind_nifty100lowvolatility30list.csv'],
];

/** Reads an NSE constituent CSV: Company Name, Industry, Symbol, Series, ISIN Code. Returns [{symbol, industry}] */
export function parseConstituents(text) {
  const rows = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(',').map((x) => x.trim().replace(/^"|"$/g, '')));
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.toLowerCase()), si = head.indexOf('symbol'), ii = head.indexOf('industry');
  if (si < 0) return [];
  return rows.slice(1).map((r) => ({ symbol: (r[si] || '').toUpperCase(), industry: ii >= 0 ? (r[ii] || '') : '' })).filter((x) => x.symbol);
}

export async function build({ fetchFn = fetch, indexes = INDEXES, log = console.log } = {}) {
  const sym = new Map(), skipped = [], done = [];   // symbol -> {groups:Set, sector, industry}
  for (const [group, file, narrow] of indexes) {
    let text = '';
    try {
      const r = await fetchFn(BASE + file, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Accept: 'text/csv,*/*' } });
      if (!r.ok) throw new Error('HTTP ' + r.status); text = await r.text();
    } catch (e) { skipped.push(`${group} (${file}): ${e.message}`); continue; }
    const list = parseConstituents(text); if (!list.length) { skipped.push(`${group} (${file}): no symbols in the file`); continue; }
    done.push(`${group}: ${list.length}`);
    for (const { symbol, industry } of list) {
      const o = sym.get(symbol) || { groups: new Set(), sector: '', industry: '' }; sym.set(symbol, o);
      o.groups.add(group); if (industry && !o.sector) o.sector = industry;
      if (narrow && !o.industry) o.industry = narrow;
    }
  }
  // an industry has one parent sector: the sector most of its symbols have. A symbol whose sector differs keeps its sector and loses the industry.
  const votes = new Map();
  for (const o of sym.values()) if (o.industry && o.sector) { const m = votes.get(o.industry) || new Map(); m.set(o.sector, (m.get(o.sector) || 0) + 1); votes.set(o.industry, m); }
  const parent = new Map([...votes].map(([ind, m]) => [ind, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  for (const o of sym.values()) if (o.industry && o.sector !== parent.get(o.industry)) o.industry = '';
  const q = (x) => (/[",\r\n]/.test(x) ? `"${String(x).replace(/"/g, '""')}"` : x);
  const lines = ['Symbol,Group,Sector,Industry'];
  for (const s of [...sym.keys()].sort()) { const o = sym.get(s); lines.push([s, [...o.groups].join('|'), o.sector, o.industry].map(q).join(',')); }
  log(`${sym.size} symbols from ${done.length} indices`); if (skipped.length) log('Skipped:\n  ' + skipped.join('\n  '));
  return { csv: lines.join('\r\n') + '\r\n', symbols: sym.size, indices: done, skipped, parent };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const out = process.argv[2] || 'nse-categories.csv';
  const r = await build(); if (!r.symbols) { console.error('Nothing downloaded: is niftyindices.com reachable from here?'); process.exit(1); }
  fs.writeFileSync(out, r.csv); console.log('Wrote ' + out);
}
