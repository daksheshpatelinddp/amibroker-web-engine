// Pseudo symbols made by the app itself: ~~~EQUITY (portfolio equity of the last backtest, Close = equity, Low = cash)
// and market breadth ~~~ADV / ~~~DEC / ~~~UNCH / ~~~ADVV / ~~~DECV. Kept in browser storage so charts can plot them like any symbol.
const KEY = 'amibroker_pseudo_v1';
let mem = {};
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
(function load() { try { const s = ls(); const raw = s && s.getItem(KEY); if (raw) mem = JSON.parse(raw) || {}; } catch (e) { mem = {}; } })();
const save = () => { try { const s = ls(); if (s) s.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* storage full: keep in memory only */ } };

export const pseudoStore = {
  names() { return Object.keys(mem); },
  has(sym) { return !!mem[String(sym).toUpperCase()]; },
  /** series: { t:[dates], o,h,l,c,v:[numbers] } */
  set(sym, series) { mem[String(sym).toUpperCase()] = series; save(); },
  get(sym) { return mem[String(sym).toUpperCase()] || null; },
  remove(sym) { delete mem[String(sym).toUpperCase()]; save(); },
  setEquity(curve) {
    const t = curve.map((p) => p.t), e = curve.map((p) => p.equity), c = curve.map((p) => p.cash);
    this.set('~~~EQUITY', { t, o: e, h: e, l: c, c: e, v: curve.map((p) => p.open || 0) });
  },
  setBreadth(dates, adv, dec, unch, advVol, decVol) {
    const mk = (a) => ({ t: dates, o: a, h: a, l: a, c: a, v: a });
    this.set('~~~ADV', mk(adv)); this.set('~~~DEC', mk(dec)); this.set('~~~UNCH', mk(unch)); this.set('~~~ADVV', mk(advVol)); this.set('~~~DECV', mk(decVol));
  },
};
