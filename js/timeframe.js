// Time frames. The database holds daily (EOD) bars, so every longer bar is built from them:
// open = first day, high = highest, low = lowest, close = last day, volume = total. Bar date = last trading day of the period.
// Intraday frames ('5m', '45m', '120m') are built by intraday.js from the intraday server's bars, not from this database.

import { isIntraday, frameName } from './intraday.js';

export const INTERVALS = { D: 'Daily', W: 'Weekly', M: 'Monthly', Q: 'Quarterly', Y: 'Yearly' };
/** Name of any time frame, intraday ones included ('45m' -> '45 min'). */
export const intervalName = (tf) => (isIntraday(tf) ? frameName(tf) : INTERVALS[tf || 'D'] || 'Daily');

export function periodKey(date, tf) {
  const y = date.slice(0, 4), m = Number(date.slice(5, 7));
  switch (tf) {
    case 'Y': return y;
    case 'Q': return `${y}-Q${Math.ceil(m / 3)}`;
    case 'M': return date.slice(0, 7);
    case 'W': {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));   // back to Monday
      return d.toISOString().slice(0, 10);
    }
    default: return date;
  }
}

/** rows: daily bars {date, open, high, low, close, volume, delivery}. Returns bars of the chosen time frame. */
export function resample(rows, tf) {
  if (!rows || !rows.length || !tf || tf === 'D' || !INTERVALS[tf]) return rows;   // intraday frames arrive already built (intraday.js)
  const sorted = rows.filter((r) => r && r.date && r.close > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out = [];
  let cur = null, key = null, delOk = true;
  for (const r of sorted) {
    const k = periodKey(r.date, tf);
    if (k !== key) {
      if (cur) { if (!delOk) cur.delivery = NaN; out.push(cur); }
      key = k; delOk = true;
      cur = { symbol: r.symbol, date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: Number.isFinite(r.volume) ? r.volume : 0, delivery: 0 };
    } else {
      cur.date = r.date; cur.close = r.close;
      if (r.high > cur.high) cur.high = r.high;
      if (r.low < cur.low) cur.low = r.low;
      cur.volume += Number.isFinite(r.volume) ? r.volume : 0;
    }
    if (Number.isFinite(r.delivery)) cur.delivery += r.delivery; else delOk = false;
  }
  if (cur) { if (!delOk) cur.delivery = NaN; out.push(cur); }
  return out;
}
