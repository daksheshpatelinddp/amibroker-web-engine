// The Analysis Settings dialog (AmiBroker: Analysis > Settings). Tabs: General, Trades, Stops, Commissions, Portfolio, Report, Walk-Forward, Optimize, Monte Carlo.
// What the formula sets itself (SetOption, ApplyStop, SetTradeDelays, SetPositionSize) always wins over these values.
import { el, openModal, toast, BTN, BTN_PRIMARY, INPUT } from './ui.js';
import { loadSettings, saveSettings, defaultSettings } from './analysis-settings.js';
import { METRICS } from './analysis-core.js';

const PRICES = { open: 'Open', high: 'High', low: 'Low', close: 'Close', avg: 'Average (H+L)/2' };
const metricOpts = () => Object.fromEntries(Object.entries(METRICS).map(([k, v]) => [k, v[0]]));

export function openAnalysisSettings({ onSave } = {}) {
  const S = loadSettings();
  openModal('Analysis settings', (b, close) => {
    b.appendChild(el('div', 'text-[11px] text-slate-400', 'Used for every Scan, Backtest, Optimization and Walk-Forward. A formula can override them with SetOption(), ApplyStop(), SetTradeDelays() and SetPositionSize().'));
    const tabs = el('div', 'flex space-x-1 overflow-x-auto pb-1'), pane = el('div', 'space-y-2');
    b.appendChild(tabs); b.appendChild(pane);

    // ---------- field helpers: each returns a node and writes into S
    const row = (...nodes) => { const r = el('div', 'grid grid-cols-2 gap-2'); nodes.forEach((n) => r.appendChild(n)); return r; };
    const lab = (text, ctl, hint) => { const w = el('label', 'block'); w.appendChild(el('div', 'text-[11px] text-slate-400 mb-1', text)); w.appendChild(ctl); if (hint) w.appendChild(el('div', 'text-[10px] text-slate-500 mt-0.5', hint)); return w; };
    const num = (obj, key, text, hint, step = 'any') => { const i = el('input', INPUT + ' w-full'); i.type = 'number'; i.step = step; i.value = obj[key]; i.onchange = () => { const v = Number(i.value); if (Number.isFinite(v)) obj[key] = v; }; return lab(text, i, hint); };
    const txt = (obj, key, text, hint, type = 'text') => { const i = el('input', INPUT + ' w-full'); i.type = type; i.value = obj[key] || ''; i.onchange = () => { obj[key] = i.value; }; return lab(text, i, hint); };
    const sel = (obj, key, text, options, hint, asNumber = false) => { const s = el('select', INPUT + ' w-full'); Object.entries(options).forEach(([v, l]) => { const o = el('option', '', l); o.value = v; s.appendChild(o); }); s.value = String(obj[key]); s.onchange = () => { obj[key] = asNumber ? Number(s.value) : s.value; }; return lab(text, s, hint); };
    const chk = (obj, key, text, hint) => { const w = el('label', 'flex items-start space-x-2 py-1'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!obj[key]; c.onchange = () => { obj[key] = c.checked; }; w.appendChild(c); const t = el('span', ''); t.appendChild(el('span', 'text-xs text-slate-200 block', text)); if (hint) t.appendChild(el('span', 'text-[10px] text-slate-500 block', hint)); w.appendChild(t); return w; };
    const head = (t) => el('div', 'text-[11px] uppercase tracking-wide text-slate-500 pt-2', t);

    const TABS = {
      General() {
        const g = S.general; return [
          row(num(g, 'initialEquity', 'Initial equity', 'Portfolio mode: the whole account. Individual mode: per symbol.'), sel(g, 'positions', 'Positions', { both: 'Long and short', long: 'Long only', short: 'Short only' })),
          row(num(g, 'minShares', 'Minimum shares', '1 for stocks'), num(g, 'minPosValue', 'Minimum position value', '0 = no limit')),
          row(num(g, 'roundLotSize', 'Round lot size', '0 = whole shares. Use 0.01 for fractions. A formula can set RoundLotSize.'), num(g, 'tickSize', 'Tick size', 'Only rounds built-in stop prices. 0 = none.')),
          row(num(g, 'accountMargin', 'Account margin %', '100 = no margin, 50 = double buying power'), num(g, 'interestRate', 'Annual interest rate %', 'Earned on cash that is not invested')),
          chk(g, 'futuresMode', 'Futures mode', 'Uses MarginDeposit and PointValue (set them in the formula)'),
          chk(g, 'allowPositionShrinking', 'Allow position size shrinking', 'Shrink a trade to the cash that is left instead of skipping it'),
          chk(g, 'activateStopsImmediately', 'Activate stops immediately', 'Stops may trigger on the entry bar (for entries at the open)'),
          chk(g, 'reverseSignalForcesExit', 'Reverse entry signal forces exit', 'A Short signal while long closes the long (and the opposite)'),
          chk(g, 'allowSameBarExit', 'Allow same bar exit (single bar trade)', 'Use only when you enter at the open'),
          chk(g, 'priceBounds', 'Check trade prices against the bar\'s High-Low', 'BuyPrice etc. outside the bar are pulled back into it'),
          head('Analysis window'), num(g, 'maxSymbols', 'Largest number of symbols per run', 'A safety limit for "All symbols" (each symbol is loaded one by one)'),
        ];
      },
      Trades() {
        const t = S.trades; return [
          head('Trade price (when the formula has no BuyPrice / SellPrice / ShortPrice / CoverPrice)'),
          row(sel(t, 'buyPrice', 'Buy price', PRICES), sel(t, 'sellPrice', 'Sell price', PRICES)),
          row(sel(t, 'shortPrice', 'Short price', PRICES), sel(t, 'coverPrice', 'Cover price', PRICES)),
          head('Trade delays (bars between the signal and the trade)'),
          row(num(t, 'buyDelay', 'Buy delay', '', 1), num(t, 'sellDelay', 'Sell delay', '', 1)),
          row(num(t, 'shortDelay', 'Short delay', '', 1), num(t, 'coverDelay', 'Cover delay', '', 1)),
          el('div', 'text-[10px] text-slate-500', 'Trading at tomorrow\'s open: delay 1 and price Open. Trading at today\'s close: delay 0 and price Close.'),
        ];
      },
      Stops() {
        const s = S.stops, stop = (key, title, hasMode) => {
          const o = s[key], box = el('div', 'rounded border border-slate-800 p-2 space-y-1');
          box.appendChild(chk(o, 'on', title)); const r = [num(o, 'amount', hasMode ? 'Amount' : 'Bars', '', 'any')];
          if (hasMode) r.push(sel(o, 'mode', 'In', key === 'trail' ? { 1: 'Percent', 2: 'Points', 3: 'Percent of profit' } : { 1: 'Percent', 2: 'Points' }, '', true));
          box.appendChild(row(...r)); return box;
        };
        return [stop('maxLoss', 'Maximum loss stop', true), stop('profit', 'Profit target stop', true), stop('trail', 'Trailing stop', true), stop('nbar', 'N-bar stop', false),
          sel(s, 'exitAtStop', 'Exit at stop', { 0: '0: compare the trade price only, exit at the trade price', 1: '1: check High/Low, exit at the stop level on the same bar', 2: '2: check High/Low, exit on the next bar at the trade price' }, 'Same as the 4th argument of ApplyStop()', true),
          num(s, 'reentryDelay', 'Re-entry delay (bars)', 'Bars to wait after a stop before the symbol can be entered again', 1)];
      },
      Commissions() {
        const c = S.commission, tb = c.table; const parts = [
          sel(c, 'mode', 'Commission model', { 0: 'Commission table (below)', 1: '% of trade value', 2: 'Amount per trade', 3: 'Amount per share / contract' }, '', true), num(c, 'amount', 'Amount (models 1-3)', '')];
        const tierBox = (o, title, isDefault) => {
          const box = el('div', 'rounded border border-slate-800 p-2 space-y-1'); box.appendChild(el('div', 'text-[11px] text-slate-300', title));
          const r1 = []; if (!isDefault) r1.push(sel(o, 'basis', 'Tier is by', { value: 'Trade value', shares: 'Number of shares' }), num(o, 'min', 'Minimum'), num(o, 'max', 'Maximum (0 = no upper limit)'));
          box.appendChild(row(...r1.slice(0, 2).length ? [r1[0], r1[1]] : [el('div')])); if (!isDefault) box.appendChild(row(r1[2], el('div')));
          box.appendChild(row(sel(o, 'type', 'Commission', { pct: '% of trade value', trade: 'Per trade', share: 'Per share' }), num(o, 'amount', 'Amount')));
          box.appendChild(row(num(o, 'minComm', 'Minimum commission'), num(o, 'maxComm', 'Maximum commission (0 = none)'))); return box;
        };
        parts.push(head('Commission table (model 0)'), el('div', 'text-[10px] text-slate-500', 'The first tier that matches the trade is used. A tier with Minimum and Maximum both 0 is off. The default tier is used when no tier matches.'));
        tb.tiers.forEach((t, k) => parts.push(tierBox(t, `Tier ${k + 1}`, false))); parts.push(tierBox(tb.default, 'Default tier', true)); return parts;
      },
      Portfolio() {
        const p = S.portfolio; return [
          row(num(p, 'maxOpenPositions', 'Max. open positions', 'SetOption("MaxOpenPositions", n) in the formula wins', 1), num(p, 'worstRankHeld', 'Worst rank held (rotational)', '0 = same as max positions', 1)),
          row(num(p, 'maxOpenLong', 'Max. open long', '0 = no limit', 1), num(p, 'maxOpenShort', 'Max. open short', '0 = no limit', 1)),
          chk(p, 'separateLongShortRank', 'Separate long / short ranking', 'Rank longs and shorts in two lists, then interleave them'),
          head('Position size (used when the formula has no PositionSize / SetPositionSize)'),
          row(sel(p, 'positionSizeType', 'Size is', { pct: '% of portfolio equity', value: 'Fixed amount', shares: 'Number of shares' }), num(p, 'positionSize', 'Size')),
          head('Limits'),
          row(num(p, 'limitVolPct', 'Limit trade size to % of entry bar volume', '0 = off'), el('div')),
          chk(p, 'noVolLimitIfZero', 'Skip that limit when the bar volume is zero'),
          chk(p, 'usePrevBarEquity', 'Use previous bar equity for position sizing', 'Size by yesterday\'s closing equity instead of today\'s'),
          head('Holding and early-exit fee'),
          row(num(p, 'holdMinBars', 'Hold at least (bars)', 'Exits and stops are ignored for this long', 1), num(p, 'holdMinDays', 'Hold at least (calendar days)', '', 1)),
          row(num(p, 'earlyExitBars', 'Early exit if within (bars)', '', 1), num(p, 'earlyExitDays', 'Early exit if within (days)', '', 1)),
          num(p, 'earlyExitFee', 'Early exit fee %', 'Added to the exit commission'),
        ];
      },
      Report() {
        const r = S.report; return [
          sel(r, 'resultList', 'Result list shows', { trades: 'Trade list', detail: 'Detailed log (every bar)', summary: 'Summary (one row per test)' }),
          num(r, 'riskFree', 'Risk-free rate % (Sharpe, Ulcer performance)', ''), num(r, 'distSpacing', 'Distribution charts spacing %', 'Width of the bars in the profit distribution'),
          chk(r, 'includeTradeList', 'Include the trade list in the exported report'),
        ];
      },
      'Walk-Forward'() {
        const w = S.walkForward, u = { years: 'years', months: 'months', days: 'days' }; return [
          el('div', 'text-[10px] text-slate-500', 'Easy mode: the out-of-sample period follows the in-sample period and also sets the step.'),
          row(num(w, 'isLength', 'In-sample length', '', 1), sel(w, 'isUnit', 'Unit', u)), row(num(w, 'oosLength', 'Out-of-sample length (step)', '', 1), sel(w, 'oosUnit', 'Unit', u)),
          row(txt(w, 'start', 'Start date', 'Blank = first date of the data', 'date'), txt(w, 'last', 'Last date', 'Blank = last date of the data', 'date')),
          chk(w, 'anchored', 'Anchored', 'The in-sample start stays fixed and the period grows'),
          sel(w, 'target', 'Optimization target', metricOpts()),
        ];
      },
      Optimize() {
        const o = S.optimize; return [
          sel(o, 'target', 'Optimization target', metricOpts(), 'Results are sorted by this. Default CAR/MaxDD'),
          sel(o, 'engine', 'Search', { exhaustive: 'Exhaustive (every combination)', smart: 'Smart (particle swarm)' }, 'A formula can choose with OptimizerSetEngine("spso")'),
          row(num(o, 'maxEval', 'Smart: tests per run (MaxEval)', '', 1), num(o, 'runs', 'Smart: runs', '', 1)),
          el('div', 'text-[10px] text-slate-500', 'The three AmiBroker engines names (spso, trib, cmae) all use the same particle-swarm search here.'),
        ];
      },
      'Monte Carlo'() {
        const m = S.monteCarlo; return [
          chk(m, 'enable', 'Run Monte Carlo after each backtest'), num(m, 'runs', 'Number of runs', 'At least 1000 is advised', 1),
          sel(m, 'mode', 'Simulation', { trades: 'Resample the trade list', equity: 'Resample portfolio equity changes (overlapping trades)' }),
          sel(m, 'posMethod', 'Position sizing (trade list)', { keep: 'Keep the original profit', value: 'Constant amount per trade', pct: '% of equity (compounds)' }),
          row(num(m, 'posValue', 'Amount per trade', ''), num(m, 'posPct', '% of equity', '')), num(m, 'strawLines', 'Equity lines in the chart', '', 1),
        ];
      },
    };
    let current = 'General';
    const draw = () => {
      tabs.innerHTML = ''; pane.innerHTML = '';
      Object.keys(TABS).forEach((k) => { const t = el('button', 'px-2 py-1 rounded-full border text-[11px] whitespace-nowrap ' + (k === current ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'), k); t.type = 'button'; t.onclick = () => { current = k; draw(); }; tabs.appendChild(t); });
      TABS[current]().forEach((n) => pane.appendChild(n));
    };
    draw();
    const foot = el('div', 'flex space-x-2 pt-2 border-t border-slate-800');
    const ok = el('button', BTN_PRIMARY + ' flex-1', 'Save'); ok.type = 'button'; ok.onclick = () => { saveSettings(S); toast('Settings saved'); if (onSave) onSave(S); close.force(); };
    const reset = el('button', BTN + ' flex-1', 'Reset to defaults'); reset.type = 'button'; reset.onclick = () => { if (confirm('Reset all analysis settings to the defaults?')) { Object.assign(S, defaultSettings()); draw(); } };
    const no = el('button', BTN, 'Cancel'); no.type = 'button'; no.onclick = () => close.force();
    foot.appendChild(ok); foot.appendChild(reset); foot.appendChild(no); b.appendChild(foot);
  }, { big: true, stack: true });
}
