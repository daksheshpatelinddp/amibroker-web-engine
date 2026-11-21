// The Analysis Settings dialog (AmiBroker: Analysis > Settings). Tabs: General, Trades, Stops, Commissions, Portfolio, Report, Walk-Forward, Optimize, Monte Carlo.
// What the formula sets itself (SetOption, ApplyStop, SetTradeDelays, SetPositionSize) always wins over these values.
import { el, openModal, toast, BTN, BTN_PRIMARY, INPUT } from './ui.js';
import { loadSettings, saveSettings, defaultSettings } from './analysis-settings.js';
import { METRICS, walkSegments } from './analysis-core.js';

const PRICES = { open: 'Open', high: 'High', low: 'Low', close: 'Close', avg: 'Average (H+L)/2' };
const metricOpts = () => Object.fromEntries(Object.entries(METRICS).map(([k, v]) => [k, v[0]]));

export function openAnalysisSettings({ onSave } = {}) {
  const S = loadSettings();
  openModal('Analysis settings', (b, close) => {
    b.appendChild(el('div', 'text-[11px] text-slate-400', 'Used for every Scan, Backtest, Optimization and Walk-Forward. As in AmiBroker, what the formula sets itself (SetOption, SetPositionSize, SetTradeDelays, ApplyStop, SetBacktestMode ...) wins over these values. The Info tab of a result lists the options that were really used.'));
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

    // ---------- AmiBroker helpers: option groups (radio buttons), locked controls, the Scenario list
    const radios = (obj, key, text, options, asNumber = false, onChange) => {
      const w = el('div', 'space-y-0.5'); if (text) w.appendChild(el('div', 'text-[11px] text-slate-400', text));
      const name = 'r' + Math.random().toString(36).slice(2);
      (Array.isArray(options) ? options : Object.entries(options)).forEach(([v, l]) => {
        const lb = el('label', 'flex items-center space-x-2 py-0.5'), r = document.createElement('input'); r.type = 'radio'; r.name = name; r.checked = String(obj[key]) === String(v);
        r.onchange = () => { if (r.checked) { obj[key] = asNumber ? Number(v) : v; if (onChange) onChange(); } };
        lb.appendChild(r); lb.appendChild(el('span', 'text-xs text-slate-200', l)); w.appendChild(lb);
      });
      return w;
    };
    const lock = (node, on) => { node.querySelectorAll('input,select,button').forEach((c) => { c.disabled = !!on; }); if (on) node.style.opacity = '0.55'; return node; };
    const group = (title, ...nodes) => { const g = el('div', 'rounded border border-slate-800 p-2 space-y-1'); g.appendChild(el('div', 'text-[11px] text-slate-300 font-semibold', title)); nodes.forEach((n) => g.appendChild(n)); return g; };
    const SCEN = { 0: 'Custom (consult the manual)', 1: 'trade NEXT BAR on OPEN, the stops exit INTRADAY', 2: 'trade NEXT BAR on OPEN, the stops exit NEXT BAR on OPEN', 3: 'trade CURRENT BAR on CLOSE, the stops exit INTRADAY', 4: 'trade CURRENT BAR on CLOSE, the stops exit on CLOSE' };
    // AmiBroker's scenarios set the trade prices, the delays and where the stops exit (Custom leaves them to you)
    const applyScenario = (n) => {
      S.scenario = n; if (!n) return;
      const next = n <= 2, px = next ? 'open' : 'close', d = next ? 1 : 0, ex = n === 1 || n === 3 ? 1 : n === 2 ? 2 : 0;
      Object.assign(S.trades, { buyPrice: px, sellPrice: px, shortPrice: px, coverPrice: px, buyDelay: d, sellDelay: d, shortDelay: d, coverDelay: d });
      for (const k of ['maxLoss', 'profit', 'trail']) S.stops[k].exitAt = ex;
    };
    const scenario = () => sel(S, 'scenario', 'Scenario:', SCEN, 'Sets the trade prices, the trade delays and the stop exit rule. Pick Custom to set them yourself.', true);
    const scenarioPicker = () => { const n = scenario(); n.querySelector('select').onchange = (e) => { applyScenario(Number(e.target.value)); draw(); }; return n; };
    const locked = () => S.scenario > 0;

    // ---------- Commission table (AmiBroker: Define...)
    const openCommissionTable = () => openModal('Commission Table', (bb, closeT) => {
      const tb = S.commission.table;
      bb.appendChild(el('div', 'text-[10px] text-slate-500', 'The first tier that matches the trade is used. A tier with Tier Minimum and Tier Maximum both 0 is off; the Default tier is used when no tier matches. Per share + Per trade + % of trade value are added, then the minimum and maximum apply.'));
      const rowFields = (o) => [
        row(num(o, 'perShare', 'Per share', ''), num(o, 'perTrade', 'Per trade', '')),
        row(num(o, 'pct', '% of trade value', ''), el('div')),
        row(num(o, 'minAmt', 'Min amount', ''), num(o, 'minPct', 'Min % of value', '')),
        row(num(o, 'maxAmt', 'Max amount', ''), num(o, 'maxPct', 'Max % of value', '')),
      ];
      bb.appendChild(group('Default', ...rowFields(tb.default)));
      tb.tiers.forEach((t, k) => bb.appendChild(group(`Tier ${k + 1}`, row(sel(t, 'basis', 'Tier Unit', { value: 'Trans. Value', shares: 'Shares / contracts' }), el('div')), row(num(t, 'min', 'Tier Minimum', ''), num(t, 'max', 'Tier Maximum', '')), ...rowFields(t))));
      const c = el('button', BTN_PRIMARY + ' w-full', 'Close'); c.type = 'button'; c.onclick = () => closeT.force(); bb.appendChild(c);
    }, { big: true, stack: true });

    const TABS = {
      General() {
        const g = S.general, c = S.commission;
        const defBtn = el('button', BTN, 'Define...'); defBtn.type = 'button'; defBtn.onclick = openCommissionTable;
        return [
          group('Data',
            el('div', 'text-[10px] text-slate-500', 'Periodicity is chosen in the Analysis window (Time frame).'),
            chk(g, 'padAlign', 'Pad and align all data to reference symbol', 'AmiBroker: every symbol gets the reference symbol\'s dates; a missing date is filled with the previous close. Use it for rotational trading and ranking. (turning this on may slightly change indicators if you have data holes)'),
            txt(g, 'padRef', 'Reference symbol', 'For example ^NIFTY50. Used only when the box above is ticked.')),
          group('Backtest',
            row(num(g, 'initialEquity', 'Initial equity:', ''), sel(g, 'positions', 'Positions:', { long: 'Long', short: 'Short', both: 'Long and short' })),
            row(num(g, 'minShares', 'Min. shares:', ''), num(g, 'minPosValue', 'Min. pos. value:', '')),
            row(num(g, 'maxPosValue', 'Max. pos. value:', '(zero means no maximum)'), num(g, 'roundLotSize', 'Round lot size:', '(zero means allow fractional # of shares)')),
            row(num(g, 'tickSize', 'Tick size:', '(zero means no minimum change)'), el('div')),
            chk(g, 'allowPositionShrinking', 'Allow position size shrinking', 'Shrink a trade to the cash that is left instead of skipping it'),
            chk(g, 'allowSameBarExit', 'Allow same bar exit / entry signal', 'Use only when you enter at the open'),
            chk(g, 'reverseSignalForcesExit', 'Reverse entry signal forces exit', 'A Short signal while long closes the long (and the opposite)'),
            chk(g, 'futuresMode', 'Futures mode', 'Uses MarginDeposit and PointValue (set them in the formula)')),
          group('Commissions & rates',
            radios(c, 'mode', '', { 0: 'commission table', 1: 'percent', 2: '$ per trade', 3: '$ per share/contract' }, true),
            row(defBtn, num(c, 'amount', 'Amount (percent / $ per trade / $ per share)', '')),
            row(num(g, 'interestRate', 'Fixed annual interest [%]:', 'Earned on cash that is not invested'), num(g, 'accountMargin', 'Account margin:', '(100 means no margin account)')),
            row(lock(txt(g, 'interestSymbol', 'Dynamic interest symbol:', 'Not used yet'), true), lock(num(g, 'marginRate', 'Margin rate [%]:', 'Not used yet'), true))),
          group('More options (this app)',
            chk(g, 'reenterSameBar', 'Re-enter on the bar a position was closed by its Sell signal', 'Off = AmiBroker: a Buy on the same bar as that Sell is ignored'),
            chk(g, 'priceBounds', 'Check trade prices against the bar\'s High-Low', 'BuyPrice etc. outside the bar are pulled back into it'),
            num(g, 'maxSymbols', 'Largest number of symbols per run (0 = no limit)', 'Optional safety limit for "All symbols" (each symbol is loaded one by one)')),
        ];
      },
      Trades() {
        const t = S.trades, L = locked(); return [
          scenarioPicker(),
          lock(group('Trade price (when the formula has no BuyPrice / SellPrice / ShortPrice / CoverPrice)', row(sel(t, 'buyPrice', 'Buy price', PRICES), sel(t, 'sellPrice', 'Sell price', PRICES)), row(sel(t, 'shortPrice', 'Short price', PRICES), sel(t, 'coverPrice', 'Cover price', PRICES))), L),
          lock(group('Trade delays (bars between the signal and the trade)', row(num(t, 'buyDelay', 'Buy delay', '', 1), num(t, 'sellDelay', 'Sell delay', '', 1)), row(num(t, 'shortDelay', 'Short delay', '', 1), num(t, 'coverDelay', 'Cover delay', '', 1))), L),
          el('div', 'text-[10px] text-slate-500', 'Trading at tomorrow\'s open: delay 1 and price Open. Trading at today\'s close: delay 0 and price Close.'),
        ];
      },
      Stops() {
        const st = S.stops, L = locked();
        const EXIT = { 0: 'Exit at trade price only (0)', 1: 'Exit intraday at stop (1)', 2: 'Exit next bar at trade price (2)' };
        // one stop group: disabled / percent / point (/ percent of profit) + amount + where it exits + re-entry delay, like AmiBroker
        const stop = (key, title, amountLabel, kinds) => {
          const o = st[key], box = el('div', 'rounded border border-slate-800 p-2 space-y-1'); box.appendChild(el('div', 'text-[11px] text-slate-300 font-semibold', title));
          const proxy = { v: !o.on ? 'off' : String(o.mode) }, opts = [['off', 'disabled'], ...Object.entries(kinds)];
          box.appendChild(radios(proxy, 'v', '', opts, false, () => { o.on = proxy.v !== 'off'; if (o.on) o.mode = Number(proxy.v); draw(); }));
          const fields = row(num(o, 'amount', amountLabel, ''), num(o, 'reentry', 'Re-entry delay:', '', 1)); box.appendChild(lock(fields, !o.on));
          box.appendChild(lock(sel(o, 'exitAt', 'Exit', EXIT, '', true), !o.on || L)); return box;
        };
        const nb = st.nbar, nbProxy = { v: nb.on ? 'bars' : 'off' };
        const nbox = el('div', 'rounded border border-slate-800 p-2 space-y-1'); nbox.appendChild(el('div', 'text-[11px] text-slate-300 font-semibold', 'N-bar stop'));
        nbox.appendChild(radios(nbProxy, 'v', '', [['off', 'disabled'], ['bars', 'bars']], false, () => { nb.on = nbProxy.v === 'bars'; draw(); }));
        nbox.appendChild(lock(row(num(nb, 'amount', 'bars:', '', 1), num(nb, 'reentry', 'Re-entry delay:', '', 1)), !nb.on));
        nbox.appendChild(lock(chk(nb, 'priority', 'Has priority', 'Evaluate the N-bar stop before the other stops when several trigger on the same bar'), !nb.on));
        return [scenarioPicker(),
          chk(S.general, 'activateStopsImmediately', 'Activate stops immediately (trigger stops AFTER regular signals)', 'Stops may trigger on the entry bar (for entries at the open)'),
          stop('maxLoss', 'Maximum loss stop', 'loss:', { 1: 'percent', 2: 'point' }), stop('profit', 'Profit target', 'profit:', { 1: 'percent', 2: 'point' }),
          stop('trail', 'Trailing stop', 'risk:', { 1: 'percent', 2: 'point', 3: 'percent of profit' }), nbox];
      },
      Report() {
        const r = S.report; return [
          group('Reporting',
            radios(r, 'resultList', 'Result list shows:', { trades: 'Trade list', detail: 'Detailed log', summary: 'Summary' }),
            num(r, 'riskFree', 'Risk-free rate for Sharpe ratio:', 'Percent per year (also used by the Ulcer performance index)'),
            num(r, 'distSpacing', 'Distribution charts spacing (%)', 'Width of the bars in the profit distribution'),
            chk(r, 'includeTradeList', 'Include trade list in the report'), chk(r, 'includeFormula', 'Include formula in the report')),
        ];
      },
      Portfolio() {
        const p = S.portfolio; return [
          group('Portfolio-level settings',
            num(p, 'maxOpenPositions', 'Max. Open Positions:', 'SetOption("MaxOpenPositions", n) in the formula wins', 1),
            num(p, 'limitVolPct', 'Limit trade size as % of entry bar volume:', '(zero means no-limit)'),
            chk(p, 'noVolLimitIfZero', 'Disable trade size limit when bar volume is zero', '(allows to backtest mutual funds that come without volume data)'),
            chk(p, 'usePrevBarEquity', 'Use previous bar equity for position sizing', 'Size by yesterday\'s closing equity instead of today\'s')),
          group('Position size (used when the formula has no PositionSize / SetPositionSize)', row(sel(p, 'positionSizeType', 'Size is', { pct: '% of portfolio equity', value: 'Fixed amount', shares: 'Number of shares' }), num(p, 'positionSize', 'Size'))),
          group('Rotational trading and long / short limits',
            row(num(p, 'worstRankHeld', 'Worst rank held', '0 = same as max positions', 1), el('div')),
            row(num(p, 'maxOpenLong', 'Max. open long', '0 = no limit', 1), num(p, 'maxOpenShort', 'Max. open short', '0 = no limit', 1)),
            chk(p, 'separateLongShortRank', 'Separate long / short ranking', 'Rank longs and shorts in two lists, then interleave them')),
          group('More options (this app)',
            chk(p, 'stopEntriesOnFailure', 'Stop entries on a bar after one cannot be filled', 'On = AmiBroker: when the best-ranked signal has too little cash or buys under 1 share, lower-ranked signals of that bar are skipped'),
            chk(p, 'equityNetOfExitCost', 'Value open positions net of exit commission', 'On = AmiBroker: equity and the size taken from it count the commission that closing each open position would cost'),
            row(num(p, 'holdMinBars', 'Hold at least (bars)', 'Exits and stops are ignored for this long', 1), num(p, 'holdMinDays', 'Hold at least (calendar days)', '', 1)),
            row(num(p, 'earlyExitBars', 'Early exit if within (bars)', '', 1), num(p, 'earlyExitDays', 'Early exit if within (days)', '', 1)),
            num(p, 'earlyExitFee', 'Early exit fee %', 'Added to the exit commission')),
        ];
      },
      'Walk-Forward'() {
        const w = S.walkForward, u = { days: 'day(s)', months: 'month(s)', years: 'year(s)' }, adv = w.mode === 'advanced';
        const segs = walkSegments({ start: w.start || '2000-01-01', last: w.last || new Date().toISOString().slice(0, 10), isLength: w.isLength, isUnit: w.isUnit, oosLength: w.oosLength, oosUnit: w.oosUnit, anchored: w.anchored, stepLength: adv ? w.stepLength : 0, stepUnit: w.stepUnit });
        const tbl = el('div', 'max-h-40 overflow-auto rounded border border-slate-800'); const t = document.createElement('table'); t.className = 'w-full text-[10px] text-slate-300';
        t.innerHTML = '<tr class="text-slate-500"><th class="text-left px-1">Mode</th><th class="text-left px-1">Start</th><th class="text-left px-1">End</th></tr>' + segs.map((x) => `<tr><td class="px-1">IS</td><td class="px-1">${x.isFrom}</td><td class="px-1">${x.isTo}</td></tr><tr><td class="px-1">OOS</td><td class="px-1">${x.oosFrom}</td><td class="px-1">${x.oosTo}</td></tr>`).join('');
        tbl.appendChild(t);
        return [
          radios(w, 'mode', '', { easy: 'Easy mode (EOD)', advanced: 'Advanced mode' }, false, () => draw()),
          el('div', 'text-[10px] text-slate-500', adv ? 'Advanced mode: the in-sample and out-of-sample periods move by their own step.' : 'Easy mode: the out-of-sample period follows the in-sample period and also sets the step.'),
          group('In-sample data', row(txt(w, 'start', 'Start:', 'Blank = first date of the data', 'date'), txt(w, 'last', 'Last:', 'Blank = last date of the data (Use today)', 'date')),
            row(num(w, 'isLength', 'Length:', '', 1), sel(w, 'isUnit', 'Unit', u)), chk(w, 'anchored', 'Anchored', 'The in-sample start stays fixed and the period grows')),
          group('Out-of-sample data', row(num(w, 'oosLength', 'Length:', '', 1), sel(w, 'oosUnit', 'Unit', u))),
          adv ? group('Step', row(num(w, 'stepLength', 'Step:', '', 1), sel(w, 'stepUnit', 'Unit', u))) : el('div'),
          sel(w, 'target', 'Optimization target:', metricOpts()),
          el('div', 'text-[10px] text-slate-500', `${segs.length} periods:`), tbl,
        ];
      },
      'Monte Carlo'() {
        const m = S.monteCarlo; return [
          chk(m, 'enable', 'Enable Monte Carlo simulation'), num(m, 'runs', 'Number of runs:', 'At least 1000 is advised', 1),
          sel(m, 'mode', 'Simulate using', { trades: 'Simulate using trade list', equity: 'Simulate using portfolio equity changes' }),
          sel(m, 'posMethod', 'Position sizing (trade list)', { keep: "Don't change", fixed: 'Fixed size (shares/contracts)', value: 'Constant Value', pct: 'Percent of Equity' }),
          row(num(m, 'posFixed', 'Fixed size: shares/contracts', ''), num(m, 'posValue', 'Constant Value', '')), num(m, 'posPct', 'Percent of Equity', ''),
          chk(m, 'curves', 'Enable MC Equity curves (Min/Max/Avg)'),
          sel(m, 'scale', 'MC equity curves', { linear: 'Show Absolute values in linear scale', log: 'Show Absolute values in logarithmic scale', pct: 'Show Percent change' }),
          num(m, 'strawLines', 'Straw broom chart plots:', '0 = none', 1),
          chk(m, 'logFinal', 'Use logarithmic scale for Final equity'), chk(m, 'logDD', 'Use logarithmic scale for $ Drawdown'),
          chk(m, 'negDD', 'Use negative numbers for Drawdown (reverse Drawdown CDF)'),
        ];
      },
      Optimize() {
        const o = S.optimize; return [
          sel(o, 'target', 'Optimization target', metricOpts(), 'Results are sorted by this. Default CAR/MaxDD'),
          sel(o, 'engine', 'Search', { exhaustive: 'Exhaustive (every combination)', smart: 'Smart (particle swarm)' }, 'A formula can choose with OptimizerSetEngine("spso")'),
          row(num(o, 'maxEval', 'Smart: tests per run (MaxEval)', '', 1), num(o, 'runs', 'Smart: runs', '', 1)),
          num(o, 'keep', 'Keep the best N results (0 = all)', 'Exhaustive search has no limit on the number of combinations; only the best N rows are kept in the list and the CSV (saves memory on a phone).', 1),
          num(o, 'serverKeep', 'Run on GitHub: keep the best N results', 'Used for jobs sent to GitHub. Each machine keeps this many best rows, the merged list is trimmed to it. 5000 is plenty and keeps the download small.', 1),
          el('div', 'text-[10px] text-slate-500', 'The three AmiBroker engines names (spso, trib, cmae) all use the same particle-swarm search here.'),
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
