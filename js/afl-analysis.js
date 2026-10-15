// AFL functions that belong to the Analysis window: Exploration columns (AddColumn / AddTextColumn / AddMultiTextColumn /
// AddRankColumn / SetSortColumns / AddSummaryRows), ApplyStop with arrays and valid bars, optimizer engine choice.
import { isArr } from './afl-lib.js';

export const FORMAT_CHAR = -9001, FORMAT_DATETIME = -9002;

export function addAnalysis(F, E, H) {
  const { A, S } = H;
  const n = () => E.n;
  const copy = (v) => (isArr(v) ? Float64Array.from(v) : v);
  const fmtDT = (v) => {
    if (!Number.isFinite(v)) return '-';
    const dn = Math.floor(v / 1e6), tn = Math.round(v - dn * 1e6), y = Math.floor(dn / 10000) + 1900, m = Math.floor(dn / 100) % 100, d = dn % 100, z = (x) => String(x).padStart(2, '0');
    return `${y}-${z(m)}-${z(d)}` + (tn ? ` ${z(Math.floor(tn / 10000))}:${z(Math.floor(tn / 100) % 100)}` : '');
  };
  const color = (v) => (v === undefined ? undefined : (isArr(v) ? copy(v) : S(v)));
  const NAME_OK = (x, d) => (x === undefined || x === null || x === '' ? d : String(x));

  // AddColumn( array, "name", format = 1.2, fgColor = colorDefault, bkColor = colorDefault, width = -1 )
  F.addcolumn = (a) => {
    const fmt = S(a[2], 1.2), data = copy(A(a[0])), col = { name: NAME_OK(a[1], 'Column'), data, format: fmt, text: false, kind: 'num', fg: color(a[3]), bg: color(a[4]), width: S(a[5], -1) };
    if (fmt === FORMAT_DATETIME) { col.kind = 'datetime'; col.texts = Array.from(data, fmtDT); }
    else if (fmt === FORMAT_CHAR) { col.kind = 'char'; col.texts = Array.from(data, (v) => (Number.isFinite(v) && v > 0 ? String.fromCharCode(v) : '')); }
    E.res.columns.push(col); return 0;
  };
  // AddTextColumn( "text", "name", format = 1.0, fg, bk, width ): the same text on every row
  F.addtextcolumn = (a) => {
    E.res.columns.push({ name: NAME_OK(a[1], 'Text'), data: String(a[0] === undefined ? '' : a[0]), format: 0, text: true, kind: 'text', fg: color(a[3]), bg: color(a[4]), width: S(a[5], -1) });
    return 0;
  };
  // AddMultiTextColumn( array, "text0\ntext1\ntext2", "name", ...): the number in the array picks the text
  F.addmulttextcolumn = F.addmultitextcolumn = (a) => {
    const data = copy(A(a[0])), list = String(a[1] === undefined ? '' : a[1]).split(/\r?\n|\\n/);
    E.res.columns.push({ name: NAME_OK(a[2], 'Text'), data, format: 0, text: false, kind: 'multi', list, texts: Array.from(data, (v) => (Number.isFinite(v) ? list[Math.round(v)] || '' : '')), fg: color(a[4]), bg: color(a[5]), width: S(a[6], -1) });
    return 0;
  };
  // AddRankColumn(): the line number of the row after SetSortColumns sorting
  F.addrankcolumn = (a) => { E.res.columns.push({ name: 'Rank', data: 0, format: a[0] === undefined ? 1.0 : S(a[0]), text: false, kind: 'rank', sort: [...(E.res.sortColumns || [])], width: -1 }); return 0; };
  // SetSortColumns( 2, -4 ): sort by result column 2 ascending, then column 4 descending (1 = Ticker, 2 = Date unless NoDefaultColumns)
  F.setsortcolumns = (a) => { E.res.sortColumns = a.filter((x) => !isArr(x)).map((x) => S(x)).filter((x) => Number.isFinite(x) && x !== 0); return 0; };
  // AddSummaryRows( mask, format = 1.2 ): 1 total, 2 min, 4 max, 8 average, 16 count
  F.addsummaryrows = (a) => { E.res.summary = { mask: S(a[0], 0) | 0, format: S(a[1], 1.2) }; return 0; };

  // ApplyStop( type, mode, amount, exitAtStop, volatile = False, reEntryDelay = 0, validFrom = 0, validTo = -1 )
  F.applystop = (a) => {
    const amt = a[2];
    E.res.stops.push({ type: S(a[0]), mode: S(a[1]), amount: isArr(amt) ? NaN : S(amt), amountArr: isArr(amt) ? Float64Array.from(amt) : null,
      exitAtStop: S(a[3], 0), volatile: !!S(a[4], 0), reentry: S(a[5], 0), validFrom: S(a[6], 0), validTo: S(a[7], -1) });
    return 0;
  };
  // OptimizerSetEngine("spso" | "trib" | "cmae")  OptimizerSetOption("Runs" | "MaxEval", value)
  F.optimizersetengine = (a) => { E.res.options.optimizerengine = String(a[0] || '').toLowerCase(); return 0; };
  F.optimizersetoption = (a) => { E.res.options['optimizer_' + String(a[0]).toLowerCase()] = S(a[1]); return 0; };
  F.setcustombacktestproc = () => 0;
  void n;
}
