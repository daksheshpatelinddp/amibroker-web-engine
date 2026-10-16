// Run: node tests/trade-view-test.mjs
import { barIndex, tradeMarkers, tradeSpan } from '../js/trade-view.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}`);
const daily = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08'];
eq(barIndex(daily, '2024-01-03'), 2, 'exact daily');
eq(barIndex(daily, '2024-01-06'), 4, 'weekend falls into previous bar');
eq(barIndex(daily, '2023-12-01'), -1, 'before data');
eq(barIndex(daily, '2024-01-04 10:00'), 3, 'intraday trade on daily chart');
const intra = ['2024-01-02 09:15', '2024-01-02 09:30', '2024-01-02 15:15', '2024-01-03 09:15', '2024-01-03 09:30'];
eq(barIndex(intra, '2024-01-03 09:30'), 4, 'exact intraday');
eq(barIndex(intra, '2024-01-02'), 0, 'daily entry on intraday chart = first bar of day');
eq(barIndex(intra, '2024-01-02', true), 2, 'daily exit on intraday chart = last bar of day');
eq(barIndex(intra, '2024-02-01'), -1, 'day not on the chart');
const trades = [
  { symbol: 'X', trade: 'Long', entryDate: '2024-01-02', entryPrice: 10, exitDate: '2024-01-04', exitPrice: 12, pctProfit: 20, profit: 2 },
  { symbol: 'X', trade: 'Short', entryDate: '2024-01-05', entryPrice: 12, exitDate: '2024-01-08', exitPrice: 13, pctProfit: -8.3, profit: -1 },
  { symbol: 'X', trade: 'Long', entryDate: '2024-01-08', entryPrice: 13, exitDate: '2024-01-08', exitPrice: 13, open: true },
];
let m = tradeMarkers(daily, trades, { mode: 'one', index: 0 });
eq(m.map((x) => [x.idx, x.shape, x.position]), [[1, 'arrowUp', 'belowBar'], [3, 'arrowDown', 'aboveBar']], 'one trade: buy up arrow, sell down arrow');
ok(m[0].text === 'Buy 10' && m[1].text === 'Sell 12 +20.0%', 'texts ' + m.map((x) => x.text));
m = tradeMarkers(daily, trades, { mode: 'all', index: 1 });
eq(m.length, 5, 'all: 2 + 2 + open trade has entry only');
ok(m.every((x, i) => i === 0 || m[i - 1].idx <= x.idx), 'sorted by bar');
const sh = m.filter((x) => x.size === 2);
eq(sh.map((x) => [x.shape, x.position]), [['arrowDown', 'aboveBar'], ['arrowUp', 'belowBar']], 'selected short: Short down above, Cover up below');
ok(m.filter((x) => x.size === 1).every((x) => x.text === ''), 'other trades have no text');
eq(tradeMarkers(daily, trades, { mode: 'one', index: 9 }), [], 'bad index');
const sp = tradeSpan(daily, trades[0]); ok(sp && sp.from === 0 && sp.to >= 3, 'span ' + JSON.stringify(sp));
ok(tradeSpan(daily, { entryDate: '2020-01-01' }) === null, 'span null');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
