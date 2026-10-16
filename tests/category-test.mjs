// Run: node tests/category-test.mjs
import { CategoryStore, parseSymbolText, normSymbol, UNASSIGNED, DEFAULT_INDUSTRIES, DEFAULT_SECTORS } from '../js/category-store.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };
const all = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC'];

ok(DEFAULT_SECTORS.length === 12 && DEFAULT_INDUSTRIES.length === 102, `AmiBroker default 12 sectors / 102 industries (${DEFAULT_SECTORS.length}/${DEFAULT_INDUSTRIES.length})`);
ok(DEFAULT_INDUSTRIES.filter((i) => i.sector === 'Services').length === 25 && DEFAULT_INDUSTRIES.filter((i) => i.sector === 'Conglomerates').length === 1, 'industry counts per sector');
ok(DEFAULT_INDUSTRIES.some((i) => i.name === 'Auto & Truck Manufacturers' && i.sector === 'Consumer Cyclical'), 'Auto & Truck Manufacturers is Consumer Cyclical');

// parsing
let p = parseSymbolText('RELIANCE\nTCS, INFY\n# comment\n"hdfcbank"\nNSE:SBIN\nRELIANCE', all);
ok(p.symbols.join() === 'RELIANCE,TCS,INFY,HDFCBANK,SBIN', 'txt: lines, commas, quotes, exchange prefix, dedupe: ' + p.symbols);
p = parseSymbolText('RELIANCE,TCS,INFY,ITC\r\n', all); ok(p.symbols.length === 4, 'tls single comma line');
p = parseSymbolText('Symbol,Name,Sector\nTCS,Tata Consultancy,IT\nINFY,Infosys,IT', all); ok(p.symbols.join() === 'TCS,INFY', 'csv header column: ' + p.symbols);
p = parseSymbolText('###Banks\nNSE:HDFCBANK\nNSE:SBIN\n###IT\nNSE:TCS\nNSE:INFY', all); ok(Object.keys(p.sections).join() === 'Banks,IT' && p.sections.IT.join() === 'TCS,INFY', 'tradingview sections');
ok(normSymbol('reliance.ns', new Map([['RELIANCE', 'RELIANCE']])) === 'RELIANCE', '.NS suffix matched to database name');

// exclusive: one sector per symbol, industry implies sector
let s = new CategoryStore(mem());
s.addSymbols('industries', 'Regional Banks', ['HDFCBANK', 'ICICIBANK']);
ok(s.members('sectors', 'Financial', all).join() === 'HDFCBANK,ICICIBANK', 'industry gives sector: ' + s.members('sectors', 'Financial', all));
s.addSymbols('sectors', 'Technology', ['TCS']); s.addSymbols('sectors', 'Energy', ['TCS']);
ok(s.members('sectors', 'Technology', all).length === 0 && s.members('sectors', 'Energy', all).join() === 'TCS', 'moving a symbol to another sector');
ok(s.members('sectors', UNASSIGNED, all).length === 4, 'unassigned = the rest: ' + s.members('sectors', UNASSIGNED, all).length);
s.addSymbols('groups', 'Stocks', all); s.addSymbols('groups', 'ETFs', ['ITC']);
ok(s.members('groups', 'Stocks', all).length === 6 && s.members('groups', 'ETFs', all).join() === 'ITC', 'group is exclusive');
// free: watchlists
ok(s.add('watchlists', 'Swing') && !s.add('watchlists', 'swing'), 'create watchlist, duplicate refused');
s.addSymbols('watchlists', 'Swing', ['TCS', 'INFY']); s.add('watchlists', 'Long term'); s.addSymbols('watchlists', 'Long term', ['TCS']);
ok(s.categoriesOf('TCS').filter((x) => x.type === 'watchlists').length === 2, 'symbol in several watchlists');
ok(s.rename('watchlists', 'Swing', 'Swing trades') && s.members('watchlists', 'Swing trades').length === 2, 'rename keeps symbols');
ok(s.removeSymbols('watchlists', 'Swing trades', ['TCS']) === 1 && s.members('watchlists', 'Swing trades').join() === 'INFY', 'remove symbol');
ok(s.remove('watchlists', 'Long term') && !s.names('watchlists').includes('Long term'), 'delete watchlist');
// favorites
ok(s.toggleFavorite('itc') === true && s.isFavorite('ITC') && s.toggleFavorite('ITC') === false, 'favorite toggle');
// ALL / resolve / options
ok(s.members('all', 'ALL', all).length === 7, 'ALL');
s.addSymbols('watchlists', 'Swing trades', ['NOTINDB']);
ok(s.resolve('watchlists|Swing trades', all).join() === 'INFY' && s.resolve('watchlists|Swing trades', all, false).length === 2, 'resolve drops symbols not in the database');
ok(s.options(all, { withEmpty: false }).some((o) => o.key === 'watchlists|Swing trades'), 'options list');
// GICS / ICB parents
s.addSymbols('gics', '4510 Software & Services', ['TCS', 'INFY']); s.addSymbols('gics', '4010 Banks', ['HDFCBANK']);
ok(s.members('gics', '45 Information Technology', all).join() === 'TCS,INFY' && s.members('gics', '40 Financials', all).join() === 'HDFCBANK', 'GICS group counts in its sector: ' + s.members('gics', '45 Information Technology', all));
s.addSymbols('icb', '8300 Banks', ['SBIN']); ok(s.members('icb', '8000 Financials', all).join() === 'SBIN', 'ICB supersector in its industry');
s.addSymbols('icb', '0500 Oil & Gas', ['RELIANCE']); ok(s.members('icb', '0001 Oil & Gas', all).join() === 'RELIANCE', 'ICB 0001 parent');
// sectors / industries editing
ok(s.add('sectors', 'Crypto') && s.add('industries', 'Exchanges', { sector: 'Crypto' }) && s.industriesOf('Crypto').join() === 'Exchanges', 'custom sector + industry');
s.remove('sectors', 'Crypto'); ok(s.sectorOfIndustry('Exchanges') === '', 'deleting a sector leaves its industries unparented');
// import
const r = s.importInto('watchlists', 'Imported', 'x'); ok(r.added === 0, 'import into missing list adds nothing');
s.add('watchlists', 'Imp'); const r2 = s.importInto('watchlists', 'Imp', 'RELIANCE\nTCS\nFOO', all);
ok(r2.added === 3 && r2.unknown.join() === 'FOO', 'import reports unknown symbols');
const sec = s.importSections('watchlists', '###Banks\nHDFCBANK\nSBIN\n###IT\nTCS', all);
ok(sec && sec.length === 2 && s.members('watchlists', 'Banks').length === 2, 'sections create lists');
const c = s.importClassification('Symbol,Sector,Industry,Watchlist,Favorite\nITC,Consumer/Non-Cyclical,Tobacco Products,Core|FMCG,yes\nTCS,Technology,,Core,', all);
ok(c.rows === 2 && s.members('industries', 'Tobacco Products', all).join() === 'ITC' && s.members('watchlists', 'Core').length === 2 && s.isFavorite('ITC'), 'classification CSV');
ok(s.members('watchlists', 'FMCG').join() === 'ITC', 'pipe = several watchlists');
// export / backup round trip
ok(s.exportTxt('watchlists', 'Imp', all).split(/\r?\n/).filter(Boolean).length === 3 && s.exportTls('watchlists', 'Imp', all).startsWith('RELIANCE,TCS'), 'txt/tls export');
const csv = s.exportCsv(all); ok(csv.split('\r\n')[0].startsWith('Symbol,Group') && /ITC,ETFs/.test(csv), 'csv export');
const js = s.exportJson(), s2 = new CategoryStore(mem()); s2.importJson(js); ok(s2.members('watchlists', 'Imp').length === 3, 'json backup restores');
// codes import
ok(s.importCodes('gics', '9999 My code\n8888\tAnother') === 2 && s.names('gics').includes('9999 My code'), 'import GICS-style code file');
// persistence + old-version migration
const st = mem(); const a = new CategoryStore(st); a.add('watchlists', 'Keep'); a.addSymbols('watchlists', 'Keep', ['TCS']);
ok(new CategoryStore(st).members('watchlists', 'Keep').join() === 'TCS', 'persists');
const st2 = mem(); st2.setItem('amibroker_categories', JSON.stringify({ groups: { Banking: ['HDFCBANK.NS'] }, sectors: { IT: ['TCS.NS'] }, industries: { Software: ['TCS.NS'] }, watchlists: { Mine: ['RELIANCE.NS'] }, favorites: ['SBIN.NS'] }));
const m = new CategoryStore(st2);
ok(m.names('groups').includes('Banking') && m.names('sectors').includes('IT') && m.members('watchlists', 'Mine').join() === 'RELIANCE.NS' && m.isFavorite('SBIN.NS') && m.names('industries').includes('Software'), 'old folders migrate');
ok(m.resolve('watchlists|Mine', all).join() === 'RELIANCE', 'old ".NS" symbols resolve to database names');
ok(new CategoryStore(st2).names('watchlists').filter((n) => n === 'Mine').length === 1, 'migration runs once');
// ---- AFL functions see the shared store
{
  const { categoryStore } = await import('../js/category-store.js');
  const { makeSession, explore } = await import('../js/analysis-core.js');
  const { makeBars } = await import('./data.mjs');
  const cs = categoryStore(); cs.add('watchlists', 'Swing'); cs.addSymbols('watchlists', 'Swing', ['AAA', 'CCC']); cs.addSymbols('sectors', 'Technology', ['AAA']); cs.toggleFavorite('BBB');
  const data = Object.fromEntries(['AAA', 'BBB', 'CCC'].map((x, i) => [x, makeBars(300, 3 + i)]));
  const sess = makeSession(async (x) => data[x] || null);
  const run = async (code) => (await explore({ code, symbols: ['AAA', 'BBB', 'CCC'], session: sess })).rows.map((r) => r.symbol).sort().join();
  ok(await run('Filter = InWatchListName("swing") AND Status("lastbarinrange");') === 'AAA,CCC', 'InWatchListName');
  ok(await run('Filter = InWatchList(0) AND Status("lastbarinrange");') === 'AAA,CCC', 'InWatchList(0)');
  ok(await run('Filter = InFavorites() AND Status("lastbarinrange");') === 'BBB', 'InFavorites');
  ok(await run('Filter = InSector(CategoryFind("Technology", categorySector)) AND Status("lastbarinrange");') === 'AAA', 'InSector + CategoryFind');
  ok(await run('Filter = StrFind(CategoryGetSymbols(categoryWatchlist, 0), Name()) >= 0 AND Status("lastbarinrange");') === 'AAA,CCC', 'CategoryGetSymbols');
}

// ---- import file formats (TradingView one-line export, broker -EQ suffix, UTF-16 leftovers)
{
  const { parseSymbolText: P, CategoryStore: CS } = await import('../js/category-store.js');
  const db = ['RELIANCE', 'TCS', 'M&M', 'HCL-INSYS'];
  const tv = P('###Section 1,NSE:RELIANCE,NSE:TCS,###Section 2,NSE:M&M', db);
  ok(JSON.stringify(tv.sections) === '{"Section 1":["RELIANCE","TCS"],"Section 2":["M&M"]}' && tv.symbols.length === 3, 'TradingView one-line export: ' + JSON.stringify(tv));
  ok(P('RELIANCE-EQ\nTCS-EQ', db).symbols.join() === 'RELIANCE,TCS', '-EQ suffix removed when the database has the plain name');
  ok(P('HCL-INSYS\n', db).symbols.join() === 'HCL-INSYS', 'a real hyphen name is kept');
  ok(P('R\0E\0L\0I\0A\0N\0C\0E\0', db).symbols.join() === 'RELIANCE', 'NUL characters ignored');
  ok(P('# comment\nTCS', db).symbols.join() === 'TCS' && P('###Banks\nNSE:TCS', db).sections.Banks[0] === 'TCS', 'comments and ### lines');
  const st2 = new CS({ getItem: () => null, setItem() {} });
  const made = st2.importSections('watchlists', '###A,NSE:TCS,NSE:RELIANCE,###B,NSE:M&M', db);
  ok(made.length === 2 && made[0].added === 2 && made[1].added === 1 && st2.count('watchlists', 'A', db) === 2, 'one watchlist per section with its symbols');
}
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
