// Argument rules for built-in functions, so the formula check reports wrong calls the way AmiBroker does
// (Error 8: wrong number of arguments / Error 10: wrong type) instead of silently guessing.
// name: [minArgs, maxArgs, 'types'] - types has one letter per argument: s = must be text, n = number/array, '.' = anything.
const T = {
  ma: [2, 2], ema: [2, 2], wma: [2, 2], dema: [2, 2], tema: [2, 2], wilders: [2, 2], sum: [2, 2], cum: [1, 1],
  hhv: [2, 2], llv: [2, 2], hhvbars: [2, 2], llvbars: [2, 2], highest: [1, 2], lowest: [1, 2],
  ref: [2, 2], roc: [2, 2], stdev: [2, 2], correlation: [3, 3], median: [2, 2], percentrank: [2, 2],
  linearreg: [2, 2], linregslope: [2, 2], linregintercept: [2, 2], tsf: [2, 2], ama: [2, 2], ama2: [3, 3],
  highestsince: [2, 3], lowestsince: [2, 3], barssince: [1, 1], cross: [2, 2], exrem: [2, 2], flip: [2, 2],
  rsi: [0, 1], rsia: [2, 2], atr: [1, 1], adx: [0, 1], pdi: [0, 1], mdi: [0, 1], cci: [0, 1], mfi: [0, 1],
  macd: [0, 2], signal: [0, 3], stochk: [0, 2], stochd: [0, 3], sar: [0, 2], obv: [0, 0], truerange: [0, 0],
  iif: [3, 3], nz: [1, 2], zig: [2, 2], peak: [3, 3], trough: [3, 3], peakbars: [3, 3], troughbars: [3, 3],
  optimize: [5, 5, 's....'], param: [4, 6, 's.....'], foreign: [2, 4, 'ss..'], setforeign: [1, 4, 's...'],
  setpositionsize: [2, 2], settradedelays: [4, 4], setoption: [2, 2, 's.'],
  applystop: [4, 8], plot: [2, 9, '.s......'], addcolumn: [2, 6, '.s....'], setchartoptions: [2, 5],
};

/** Returns an AmiBroker-style error message for a wrong call, or '' when the call is fine. */
export function checkCall(name, args) {
  const s = T[name.toLowerCase()];
  if (!s) return '';
  const [min, max, types] = s, n = args.length;
  if (n < min || n > max) {
    const want = min === max ? `${min}` : `${min} to ${max}`;
    return n > max ? `Error 16. Too many arguments in ${name}() (it takes ${want}, found ${n})` : `Error 17. Missing arguments in ${name}() (it needs ${want}, found ${n})`;
  }
  if (types) {
    for (let i = 0; i < n && i < types.length; i++) {
      const isText = typeof args[i] === 'string';
      if (types[i] === 's' && !isText) return `Error 5. Argument #${i + 1} has incorrect type (the function expects different argument type here: ${name}() needs text in quotes)`;
    }
  }
  return '';
}
