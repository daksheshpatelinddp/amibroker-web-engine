// Run: node tests/nse-categories-test.mjs -- the NSE index builder (fake niftyindices.com) and importing its CSV into the category store
import { build, BASE, BASES } from '../tools/build-nse-categories.mjs';
import { CategoryStore } from '../js/category-store.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const H = 'Company Name,Industry,Symbol,Series,ISIN Code\n';
const files = {
  'ind_nifty50list.csv': H + 'HDFC Bank,Financial Services,HDFCBANK,EQ,x\nTCS,Information Technology,TCS,EQ,x\nSBI,Financial Services,SBIN,EQ,x\n',
  'ind_niftynext50list.csv': H + 'Bajaj Fin,Financial Services,BAJFINANCE,EQ,x\nDabur,Fast Moving Consumer Goods,DABUR,EQ,x\n',
  'ind_nifty500list.csv': H + 'HDFC Bank,Financial Services,HDFCBANK,EQ,x\nTCS,Information Technology,TCS,EQ,x\nSBI,Financial Services,SBIN,EQ,x\nBajaj Fin,Financial Services,BAJFINANCE,EQ,x\nDabur,Fast Moving Consumer Goods,DABUR,EQ,x\nXYZ,Healthcare,XYZ,EQ,x\n',
  'ind_niftypsubanklist.csv': H + 'SBI,Financial Services,SBIN,EQ,x\n',
  'ind_nifty_privatebanklist.csv': H + 'HDFC Bank,Financial Services,HDFCBANK,EQ,x\n',
  'ind_niftybanklist.csv': H + 'HDFC Bank,Financial Services,HDFCBANK,EQ,x\nSBI,Financial Services,SBIN,EQ,x\n',
  'ind_niftyitlist.csv': H + 'TCS,Information Technology,TCS,EQ,x\n',
};
const fetchFn = async (url) => { const f = url.replace(BASES[0], '').replace(BASES[1], '').replace(BASES[2], ''); if (!url.startsWith(BASE)) return { ok: false, status: 404, text: async () => '' }; return files[f] ? { ok: true, text: async () => files[f] } : { ok: false, status: 404, text: async () => '' }; };
let n503 = 0; const flaky = async (u, o) => { if (u.endsWith('ind_nifty50list.csv') && n503++ < 2) return { ok: false, status: 503, text: async () => '' }; return fetchFn(u, o); };
const r = await build({ fetchFn: flaky, log: () => {} });
ok(n503 >= 3, 'a 503 is retried');
ok(r.symbols === 6, 'symbols found: ' + r.symbols);
ok(r.skipped.length > 20 && r.indices.length === 7, 'missing files are skipped and listed');
const row = (s) => r.csv.split('\r\n').find((l) => l.startsWith(s + ','));
ok(/^HDFCBANK,NIFTY 50\|NIFTY 500\|NIFTY PRIVATE BANK\|NIFTY BANK,Financial Services,Private Bank$/.test(row('HDFCBANK')), 'HDFCBANK in many groups, narrowest industry first: ' + row('HDFCBANK'));
ok(/^SBIN,.*PSU Bank$/.test(row('SBIN')), 'SBIN PSU Bank');
ok(/^DABUR,NIFTY NEXT 50\|NIFTY 500,Fast Moving Consumer Goods,$/.test(row('DABUR')), 'no sector index: sector only: ' + row('DABUR'));
// into the store
const mem = {}; const st = new CategoryStore({ getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } }, 'nsetest');
const all = ['HDFCBANK', 'TCS', 'SBIN', 'BAJFINANCE', 'DABUR', 'XYZ'];
const imp = st.importClassification(r.csv, all);
ok(imp.rows === 6, 'rows imported');
ok(st.count('groups', 'NIFTY 500', all) === 6 && st.count('groups', 'NIFTY 50', all) === 3 && st.count('groups', 'NIFTY NEXT 50', all) === 2, 'groups keep every member (500 not reduced)');
ok(st.members('industries', 'PSU Bank', all).join() === 'SBIN', 'industry PSU Bank');
ok(st.members('sectors', 'Financial Services', all).sort().join() === 'BAJFINANCE,HDFCBANK,SBIN', 'sector Financial Services includes industry members: ' + st.members('sectors', 'Financial Services', all));
ok(st.members('sectors', 'Healthcare', all).join() === 'XYZ', 'sector without industry');
ok(st.sectorOfIndustry('Private Bank') === 'Financial Services', 'industry parent sector');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
