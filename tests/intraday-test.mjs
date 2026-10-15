// Intraday: frame parsing, bar building, settings, fetching, the AFL time functions, the Yahoo parser and the server.
import * as I from '../js/intraday.js';
import { parseChart, yahooSymbol, getBars } from '../server/providers/yahoo.js';
import { handle } from '../server/server.js';
import { barsToArrays } from '../js/indicators.js';
import { aflEngine } from '../js/afl-engine.js';
import '../js/afl-extra.js';
import { resample } from '../js/timeframe.js';
import { rangeOf } from '../js/analysis-core.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

// ---- parsing what the user types
eq(I.parseFrame('5'), 5, '5'); eq(I.parseFrame('45 min'), 45, '45 min'); eq(I.parseFrame('2h'), 120, '2h'); eq(I.parseFrame('1.5h'), 90, '1.5h');
eq(I.parseFrame('1h30m'), 90, '1h30m'); eq(I.parseFrame('2', 'h'), 120, 'bare 2 with hours'); eq(I.parseFrame('2 hours'), 120, '2 hours');
eq(I.parseFrame('0'), null, '0'); eq(I.parseFrame('abc'), null, 'abc'); eq(I.parseFrame('1441'), null, '1441'); eq(I.parseFrame('1440'), 1440, '1440'); eq(I.parseFrame(''), null, 'empty');
eq(I.parseFrame('7,5'), 8, 'comma decimal rounds (7.5 min -> 8)');
eq(I.frameId(45), '45m', 'id'); ok(I.isIntraday('45m') && !I.isIntraday('D') && !I.isIntraday('W'), 'isIntraday');
eq(I.frameName('1m'), '1 min', 'name 1'); eq(I.frameName('60m'), '1 hour', 'name 60'); eq(I.frameName('120m'), '2 hours', 'name 120'); eq(I.frameName('90m'), '1 h 30 min', 'name 90');
eq(I.frameShort('60m'), '1h', 'short 60'); eq(I.frameShort('45m'), '45m', 'short 45'); eq(I.frameShort('120m'), '2h', 'short 120');
eq(I.DEFAULT_FRAMES, [1, 5, 15, 30, 45, 60], 'default frames');

// ---- which server interval builds a frame
eq([1, 5, 15, 30, 45, 60, 90, 120, 7, 10, 25].map(I.sourceFor), [1, 5, 15, 30, 15, 60, 30, 60, 1, 5, 5], 'sourceFor');

// ---- building bars. One day of 5 minute bars from 09:15 to 15:25 IST. IST 09:15 = 03:45 UTC.
const day0 = Date.UTC(2026, 9, 14, 3, 45) / 1000;
const five = [];
for (let i = 0; i < 75; i++) { const p = 100 + i; five.push({ t: day0 + i * 300, o: p, h: p + 2, l: p - 1, c: p + 1, v: 10 }); }
const f5 = I.buildFrame(five, 5, 'X');
eq(f5.length, 75, '5m stays 75'); eq(f5[0].date, '2026-10-14 09:15', 'first label'); eq(f5[74].date, '2026-10-14 15:25', 'last label');
const f15 = I.buildFrame(five, 15);
eq(f15.length, 25, '15m = 25'); eq(f15[0], { symbol: '', date: '2026-10-14 09:15', open: 100, high: 104, low: 99, close: 103, volume: 30, delivery: NaN }, '15m first bar (open of first, high max, low min, close of last, volume sum)');
const f45 = I.buildFrame(five, 45);
eq(f45.map((b) => b.date.slice(11)), ['09:15', '10:00', '10:45', '11:30', '12:15', '13:00', '13:45', '14:30', '15:15'], '45m labels start at 09:15');
eq(f45[0].volume, 90, '45m volume'); eq(f45[8].volume, 30, 'last 45m bar holds the remaining 3 bars'); eq(f45[8].close, 175, 'last close');
const f60 = I.buildFrame(five, 60); eq(f60.map((b) => b.date.slice(11)), ['09:15', '10:15', '11:15', '12:15', '13:15', '14:15', '15:15'], '60m labels');
const f120 = I.buildFrame(five, 120); eq(f120.map((b) => b.date.slice(11)), ['09:15', '11:15', '13:15', '15:15'], '120m (2 hours) labels');
eq(I.buildFrame(five, 375).length, 1, 'a whole session = 1 bar'); eq(I.buildFrame(five, 1440).length, 1, '1440 = 1 bar a day');
// two days must not merge; unsorted and null input are safe
const day1 = day0 + 86400;
const two = I.buildFrame([...five, ...five.map((b) => ({ ...b, t: b.t + 86400 }))].reverse(), 60);
eq(two.length, 14, 'two days = 14 hourly bars'); eq(two[7].date, '2026-10-15 09:15', 'second day starts again at 09:15'); ok(two[0].date < two[1].date, 'sorted');
eq(I.buildFrame(null, 5), [], 'null input'); eq(I.buildFrame([{ t: 1, o: 0, h: 0, l: 0, c: 0, v: 0 }], 5), [], 'bars with no price are dropped');
// 60 minute server bars -> 2 hour frame
const hourly = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ t: day0 + i * 3600, o: 10 + i, h: 12 + i, l: 9 + i, c: 11 + i, v: 5 }));
eq(I.buildFrame(hourly, 120).map((b) => [b.date.slice(11), b.open, b.close, b.volume]), [['09:15', 10, 12, 10], ['11:15', 12, 14, 10], ['13:15', 14, 16, 10], ['15:15', 16, 17, 5]], '2h from 60m bars');

// ---- chart time: IST clock time as UTC seconds; daily labels unchanged
eq(I.chartTime('2026-10-14'), '2026-10-14', 'daily label'); eq(I.chartTime('2026-10-14 09:15'), Date.UTC(2026, 9, 14, 9, 15) / 1000, 'intraday label');
ok(I.chartTime('2026-10-14 09:20') - I.chartTime('2026-10-14 09:15') === 300, 'five minutes apart');

// ---- settings
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; };
let st = mem();
eq(I.loadConfig(st).frames, [1, 5, 15, 30, 45, 60], 'defaults when nothing saved');
const saved = I.saveConfig({ url: ' https://x.onrender.com/// ', frames: [90, 5, 5, 0, 'x', 2000, 10], refreshSeconds: 30, range: '5d' }, st);
eq(saved.url, 'https://x.onrender.com', 'url trimmed'); eq(saved.frames, [5, 10, 90], 'frames cleaned, sorted, unique');
eq(I.loadConfig(st), { url: 'https://x.onrender.com', frames: [5, 10, 90], refreshSeconds: 30, range: '5d' }, 'reload');
eq(I.saveConfig({ url: '', frames: [] }, st).frames, [1, 5, 15, 30, 45, 60], 'empty list -> defaults');
st.setItem('intraday_cfg_v1', '{bad json'); eq(I.loadConfig(st).frames.length, 6, 'bad json -> defaults');

// ---- fetching with a fake server
let calls = [];
const fakeFetch = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ bars: five }) }; };
const cfg = { url: 'http://srv', frames: [45], refreshSeconds: 0, range: '' };
I.clearIntradayCache();
const rows = await I.fetchFrame('RELIANCE', 45, cfg, { fetchImpl: fakeFetch });
eq(rows.length, 9, '45m rows from fake server'); ok(/interval=15m/.test(calls[0]) && /symbol=RELIANCE/.test(calls[0]), '45m asks the server for 15m bars: ' + calls[0]);
await I.fetchFrame('RELIANCE', 45, cfg, { fetchImpl: fakeFetch }); eq(calls.length, 1, 'second call is served from memory');
await I.fetchFrame('RELIANCE', 15, cfg, { fetchImpl: fakeFetch }); eq(calls.length, 1, '15m shares the 15m download');
await I.fetchFrame('RELIANCE', 45, cfg, { fetchImpl: fakeFetch, force: true }); eq(calls.length, 2, 'force refetches');
await I.fetchFrame('M&M', 7, { ...cfg, range: '1mo' }, { fetchImpl: fakeFetch }); ok(/symbol=M%26M/.test(calls[2]) && /interval=1m/.test(calls[2]) && /range=1mo/.test(calls[2]), 'encoded symbol, 1m, range: ' + calls[2]);
let err = ''; try { await I.fetchFrame('A', 5, { ...cfg, url: '' }, { fetchImpl: fakeFetch }); } catch (e) { err = e.message; } ok(/not set/.test(err), 'no address -> clear message');
err = ''; try { await I.fetchFrame('A', 5, cfg, { fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({ error: 'Yahoo answered 404 for A.NS' }) }) }); } catch (e) { err = e.message; } ok(/Yahoo answered 404/.test(err), 'server error text is shown: ' + err);
err = ''; try { await I.fetchFrame('B', 5, cfg, { fetchImpl: async () => { throw new Error('boom'); } }); } catch (e) { err = e.message; } ok(/Cannot reach/.test(err), 'network failure: ' + err);

// ---- arrays and AFL time functions
const arr = barsToArrays(f45);
eq(arr.t[1], '2026-10-14 10:00', 'barsToArrays keeps the time'); eq(arr.t.length, 9, 'no bars lost');
const arrD = barsToArrays([{ date: '2026-10-14T00:00:00', open: 1, high: 2, low: 1, close: 2, volume: 1 }]); eq(arrD.t[0], '2026-10-14', 'daily rows still cut to the date');
const run = (code, bars = arr, interval = '45m') => aflEngine.run(code, bars, { symbol: 'X', interval, action: 1 });
const r1 = run('Plot(Hour(),"h",1); Plot(Minute(),"m",1); Plot(TimeNum(),"tn",1); Plot(Day(),"d",1); Plot(Interval(),"iv",1); Plot(DateTime(),"dt",1); Plot(DateNum(),"dn",1);');
ok(!r1.errors.length, 'time functions run: ' + r1.errors.join('; '));
const pl = (n) => r1.plots.find((p) => p.name === n).data;
eq([pl('h')[0], pl('h')[1], pl('m')[0], pl('m')[1]], [9, 10, 15, 0], 'Hour / Minute'); eq([pl('tn')[0], pl('tn')[2]], [91500, 104500], 'TimeNum');
eq(pl('d')[0], 14, 'Day with a time label'); eq(pl('iv')[0], 2700, 'Interval = seconds of a 45 min bar'); eq(pl('dn')[0], 1261014, 'DateNum');
eq(pl('dt')[1], 1261014 * 1e6 + 100000, 'DateTime carries the time');
eq(aflEngine.run('Plot(Interval(),"iv",1);', arrD, { symbol: 'X', interval: 'D', action: 1 }).plots[0].data[0], 86400, 'daily Interval unchanged');
eq(aflEngine.run('Plot(Hour(),"h",1);', arrD, { symbol: 'X', interval: 'D', action: 1 }).plots[0].data[0], 0, 'daily Hour is 0');
// a typical intraday rule: only trade after 09:45 and flatten at 15:15
const rule = run('Buy = Hour() * 100 + Minute() >= 945 AND Close > Open; Plot(Buy,"b",1);');
ok(!rule.errors.length && rule.plots[0].data.length === 9, 'intraday rule runs');

// ---- resample leaves intraday frames alone; range filters by day with time labels
eq(resample(f45, '45m'), f45, 'resample keeps intraday rows');
eq(rangeOf(arr, { mode: 'dates', from: '2026-10-14', to: '2026-10-14' }), [0, 8], 'to-date includes the whole day');
const arr2 = barsToArrays([...f45, ...I.buildFrame(five.map((b) => ({ ...b, t: b.t + 86400 })), 45)]);
eq(rangeOf(arr2, { mode: 'dates', from: '2026-10-15', to: '2026-10-15' }), [9, 17], 'second day only');
eq(rangeOf(arr2, { mode: 'days', n: 1 }), [9, 17], 'last 1 day = last session');
eq(rangeOf(arr2, { mode: 'days', n: 2 }), [0, 17], 'last 2 days');

// ---- Yahoo
eq(yahooSymbol('reliance'), 'RELIANCE.NS', 'NSE suffix'); eq(yahooSymbol('NIFTY'), '^NSEI', 'index'); eq(yahooSymbol('M&M'), 'M&M.NS', 'M&M'); eq(yahooSymbol('TCS.BO'), 'TCS.BO', 'given suffix kept'); eq(yahooSymbol('^NSEBANK'), '^NSEBANK', 'caret kept');
const chart = { chart: { result: [{ timestamp: [100, 160, 220, 280], indicators: { quote: [{ open: [1, null, 3, 4], high: [2, null, 4, 5], low: [1, null, 2, 3], close: [2, null, 3, 4], volume: [10, null, 30, null] }] } }] } };
eq(parseChart(chart), [{ t: 100, o: 1, h: 2, l: 1, c: 2, v: 10 }, { t: 220, o: 3, h: 4, l: 2, c: 3, v: 30 }, { t: 280, o: 4, h: 5, l: 3, c: 4, v: 0 }], 'null holes skipped');
let e2 = ''; try { parseChart({ chart: { result: null, error: { description: 'No data found, symbol may be delisted' } } }); } catch (e) { e2 = e.message; } ok(/delisted/.test(e2), 'Yahoo error text');
let seen = ''; const yb = await getBars({ symbol: 'TCS', interval: '15m', fetchImpl: async (u) => { seen = u; return { ok: true, json: async () => chart }; } });
ok(/TCS\.NS/.test(seen) && /interval=15m/.test(seen) && /range=60d/.test(seen) && yb.length === 3, 'yahoo url: ' + seen);
e2 = ''; try { await getBars({ symbol: 'TCS', interval: '45m', fetchImpl: async () => ({ ok: true, json: async () => chart }) }); } catch (e) { e2 = e.message; } ok(/not supported/.test(e2), 'unsupported interval refused');

// ---- server
const h1 = await handle(new URL('http://x/api/health')); eq(h1[0], 200, 'health'); ok(h1[1].ok && h1[1].intervals.includes('5m'), 'health body');
eq((await handle(new URL('http://x/api/nothing')))[0], 404, '404');
eq((await handle(new URL('http://x/api/intraday?symbol=%3Cscript%3E&interval=5m')))[0], 400, 'bad symbol refused');
eq((await handle(new URL('http://x/api/intraday?symbol=TCS&interval=5m&range=abc')))[0], 400, 'bad range refused');
const bad = await handle(new URL('http://x/api/intraday?symbol=TCS&interval=7m')); eq(bad[0], 502, 'unsupported interval -> 502 with message'); ok(/not supported/.test(bad[1].error), 'message');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
