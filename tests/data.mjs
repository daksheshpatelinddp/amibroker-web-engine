// Deterministic synthetic daily bars for tests (same shape as barsToArrays output)
export function makeBars(n = 1500, seed = 7) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const t = [], o = [], h = [], l = [], c = [], v = [], dq = [], delpct = [];
  let px = 100, d = new Date(Date.UTC(2018, 0, 1));
  while (t.length < n) {
    d = new Date(d.getTime() + 86400000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const op = px * (1 + (rnd() - 0.5) * 0.01);
    const cl = op * (1 + (rnd() - 0.48) * 0.03);
    const hi = Math.max(op, cl) * (1 + rnd() * 0.01), lo = Math.min(op, cl) * (1 - rnd() * 0.01);
    const vol = Math.round(1e6 * (0.5 + rnd()));
    t.push(d.toISOString().slice(0, 10)); o.push(op); h.push(hi); l.push(lo); c.push(cl); v.push(vol);
    dq.push(Math.round(vol * (0.3 + rnd() * 0.4))); delpct.push(dq[dq.length - 1] / vol * 100);
    px = cl;
  }
  return { t, o, h, l, c, v, dq, delpct };
}
