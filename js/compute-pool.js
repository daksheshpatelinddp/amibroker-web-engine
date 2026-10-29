// ComputePool: runs an optimizer (or any "same task, many parameter sets" job) in several Web Workers.
//
//   const pool = new ComputePool();
//   await pool.load(engine, symbols);                 // every worker decodes and KEEPS its share of the stocks in memory
//   const out = await pool.run({ task, combos });     // only the parameter sets go out, small result arrays come back
//   out.data[i * out.k + j]  = value j of combination i
//
// A task is   (stocks, params, ctx) => number | array of numbers
//   stocks = THIS worker's stocks, each { symbol, n, t, o, h, l, c, v, dq }  (typed arrays, t = days since 1970)
//   params = one combination (any small JSON value, e.g. [fast, slow])
// and is given either as a function (it is sent as source text, so it must not use variables from outside itself) or as
//   { module: '/js/afl-task.js', export: 'myTask' }   a module the workers import - use this for code that has imports (your AFL engine).
// Results of the workers are added up per value (profit, trades ...). For anything else pass combine(partials, count) -> { k, data }.
import { WorkerPool } from './worker-pool.js';

export const sumCombine = (partials) => {
  const live = partials.filter((p) => p && p.data.length);
  if (!live.length) return { k: 0, data: new Float64Array(0) };
  const out = Float64Array.from(live[0].data);
  for (let w = 1; w < live.length; w++) for (let i = 0; i < out.length; i++) out[i] += live[w].data[i];
  return { k: live[0].k, data: out };
};

export class ComputePool {
  constructor(opts = {}) {
    this.pool = new WorkerPool(opts);
    this.active = [];            // workers that hold stocks
    this.cancelled = false;
    this.nameCounter = 0;
    this.info = null;
  }

  get size() { return this.pool.size; }
  get mode() { return this.pool.inline ? 'in page' : `${this.pool.size} workers`; }

  /** Downloads (only what is missing) and distributes the stocks. Every worker decodes its own share. */
  async load(engine, symbols, { onProgress } = {}) {
    const t0 = performance.now();
    this.pool.prewarm();                                           // workers start while the data downloads
    const { syms, hData, rData, saving } = await engine.loadPackBytes(symbols, { onProgress, prewarm: false });
    await this.pool.ready();
    await this.pool.broadcast({ op: 'clear' });
    const weight = (s) => ((engine.packIdx.get(s) || {}).n || 0) + ((engine.recentIdx.get(s) || {}).n || 0);
    const loads = new Array(this.size).fill(0), share = Array.from({ length: this.size }, () => []);
    for (const s of syms.slice().sort((a, b) => weight(b) - weight(a))) {      // longest first, always to the least loaded worker
      let w = 0; for (let i = 1; i < this.size; i++) if (loads[i] < loads[w]) w = i;
      share[w].push(s); loads[w] += weight(s);
    }
    this.active = share.map((l, i) => (l.length ? i : -1)).filter((i) => i >= 0);
    let done = 0;
    await Promise.all(share.map(async (list, wi) => {
      for (let i = 0; i < list.length; i += 24) {
        const items = [], transfer = [];
        for (const s of list.slice(i, i + 24)) {
          const h = hData.get(s), r = rData.get(s); hData.delete(s); rData.delete(s);
          const hc = h ? h.slice() : null, rc = r ? r.slice() : null;
          if (hc) transfer.push(hc.buffer); if (rc) transfer.push(rc.buffer);
          items.push({ sym: s, h: hc, r: rc });
        }
        await this.pool.call(wi, { op: 'decode', items, keep: true }, transfer);
        done += items.length;
        if (onProgress) onProgress({ phase: 'decode', done, total: syms.length });
      }
    }));
    await saving;
    const infos = await this.pool.broadcast({ op: 'info' }, this.active);
    this.info = { stocks: infos.reduce((a, x) => a + x.stocks, 0), bars: infos.reduce((a, x) => a + x.bars, 0), workers: this.active.length,
                  mode: this.mode, seconds: (performance.now() - t0) / 1000 };
    return this.info;
  }

  async _register(task) {
    const name = `task${++this.nameCounter}`;
    const msg = typeof task === 'function'
      ? { op: 'register', name, src: task.toString() }
      : { op: 'register', name, module: new URL(task.module, typeof location !== 'undefined' ? location.href : import.meta.url).href, export: task.export };
    await this.pool.broadcast(msg, this.active);
    return name;
  }

  cancel() { this.cancelled = true; }

  /**
   * Runs the task for every combination. Combinations go out in batches sized to take ~targetMs, so progress is smooth and
   * cancel() works. Returns { k, data, done, seconds, combosPerSec }.
   */
  async run({ task, combos, combine = sumCombine, ctx = {}, targetMs = 250, onProgress } = {}) {
    if (!this.active.length) throw new Error('load stocks first: pool.load(engine, symbols)');
    this.cancelled = false;
    const name = await this._register(task);
    const total = combos.length;
    let out = null, k = 0, done = 0, batch = 4;
    const t0 = performance.now();
    while (done < total && !this.cancelled) {
      const slice = combos.slice(done, done + batch);
      const tb = performance.now();
      const partials = await this.pool.broadcast({ op: 'run', name, combos: slice, ctx }, this.active);
      const merged = combine(partials, slice.length);
      if (!out) { k = merged.k; out = new Float64Array(k * total); }
      out.set(merged.data, done * k);
      done += slice.length;
      const ms = Math.max(performance.now() - tb, 4);
      batch = Math.max(1, Math.min(20000, Math.round(batch * Math.min(4, targetMs / ms))));
      if (onProgress) onProgress({ done, total, combosPerSec: done / ((performance.now() - t0) / 1000) });
    }
    const seconds = (performance.now() - t0) / 1000;
    return { k, data: out ? out.subarray(0, done * k) : new Float64Array(0), done, seconds, combosPerSec: done / Math.max(seconds, 1e-9) };
  }

  /** How many parameter combinations per second this device runs over the loaded stocks (moving-average crossover test). */
  async benchmark({ combos = 600, onProgress } = {}) {
    const list = [];
    for (let f = 2; list.length < combos; f++) for (let s = f + 3; s < f + 3 + 40 && list.length < combos; s += 1) list.push([f, s]);
    const r = await this.run({ task: { module: new URL('./bench-task.js', import.meta.url).href, export: 'smaCross' }, combos: list, onProgress });
    const bars = this.info ? this.info.bars : 0;
    return { ...r, stocks: this.info ? this.info.stocks : 0, bars, stockBarsPerSec: r.combosPerSec * bars, mode: this.mode };
  }

  terminate() { this.pool.terminate(); }
}
