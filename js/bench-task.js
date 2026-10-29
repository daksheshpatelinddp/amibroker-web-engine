// Built-in task for the optimizer benchmark: long when the fast simple moving average is above the slow one, exit otherwise.
// Returns [sum of daily returns (percent) over all stocks, number of trades]. Prefix sums are cached once per stock.
export function smaCross(stocks, params) {
  const fast = params[0], slow = params[1];
  let ret = 0, trades = 0;
  for (const s of stocks) {
    const n = s.n, c = s.c;
    let cs = s._cs;
    if (!cs) { cs = s._cs = new Float64Array(n + 1); for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + c[i]; }
    let inPos = false;
    for (let i = slow; i < n; i++) {
      if (inPos) ret += (c[i] - c[i - 1]) / c[i - 1];
      const on = (cs[i + 1] - cs[i + 1 - fast]) * slow > (cs[i + 1] - cs[i + 1 - slow]) * fast;
      if (on !== inPos) { inPos = on; if (on) trades++; }
    }
  }
  return [ret * 100, trades];
}
