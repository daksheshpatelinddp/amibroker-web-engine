// The work a data worker does, as plain functions: it runs inside a Web Worker (js/data-worker.js), or in the page itself
// when workers are not available, and in Node for tests. A "state" holds the stocks this worker keeps in memory and the
// task functions registered for it.
//
// Messages (op):
//   ping                          -> { pong, fast }
//   decode { items:[{sym,h,r}], bars?, keep? }   compressed history block h and recent block r per stock -> merged typed arrays
//                                                (keep: stay in this worker's memory, only { symbol, n } comes back)
//   register { name, src | module+export }       a task function: (stocks, params, ctx) => number | array of numbers
//   run { name, combos, ctx }                    runs the task for every parameter combination over THIS worker's stocks
//                                                -> { k, data: Float64Array(combos*k) }
//   info / clear
import { parseBlock, mergeBlocks, tailBlock } from './pack-codec.js';

let fast = null;                         // optional quicker inflater (fflate), installed later, in the background
export function setFastInflater(fn) { fast = typeof fn === 'function' ? fn : null; }
export const hasFastInflater = () => !!fast;

async function inflateAny(bytes) {
  if (fast) { try { return fast(bytes); } catch (e) { /* use the browser's own below */ } }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const newState = () => ({ store: new Map(), tasks: new Map(), list: null });

const KEYS = ['t', 'o', 'h', 'l', 'c', 'v', 'dq'];
function transferList(blocks) {
  const set = new Set();
  for (const b of blocks) if (b) for (const k of KEYS) set.add(b[k].buffer);
  return [...set];
}

export async function handle(state, msg) {
  switch (msg.op) {
    case 'ping': return { result: { pong: true, fast: !!fast } };
    case 'decode': {
      const out = [];
      for (const it of msg.items) {
        const hb = it.h ? parseBlock(await inflateAny(it.h)) : null;
        const rb = it.r ? parseBlock(await inflateAny(it.r)) : null;
        let m = mergeBlocks(hb, rb);
        if (m && msg.bars) m = tailBlock(m, msg.bars);
        if (!m) { out.push(null); continue; }
        if (msg.keep) { state.store.set(it.sym, { symbol: it.sym, ...m }); state.list = null; out.push({ symbol: it.sym, n: m.n }); }
        else out.push({ symbol: it.sym, ...m });
      }
      return { result: out, transfer: msg.keep ? [] : transferList(out) };
    }
    case 'register': {
      let fn;
      if (msg.module) fn = (await import(msg.module))[msg.export || 'default'];
      else fn = new Function(`return (${msg.src});`)();
      if (typeof fn !== 'function') throw new Error(`task "${msg.name}" is not a function`);
      state.tasks.set(msg.name, fn);
      return { result: true };
    }
    case 'run': {
      const fn = state.tasks.get(msg.name);
      if (!fn) throw new Error(`unknown task "${msg.name}"`);
      const stocks = state.list || (state.list = [...state.store.values()]);
      const ctx = { ...(msg.ctx || {}), symbols: stocks.map((s) => s.symbol) };
      const total = msg.combos.length;
      let k = 0, data = new Float64Array(0);
      for (let i = 0; i < total; i++) {
        let r = fn(stocks, msg.combos[i], ctx);
        if (r && typeof r.then === 'function') r = await r;
        if (typeof r === 'number') r = [r];
        if (i === 0) { k = r.length; data = new Float64Array(k * total); }
        else if (r.length !== k) throw new Error('a task must return the same number of values for every combination');
        data.set(r, i * k);
      }
      return { result: { k, data }, transfer: [data.buffer] };
    }
    case 'info': {
      let bars = 0; for (const s of state.store.values()) bars += s.n;
      return { result: { stocks: state.store.size, bars } };
    }
    case 'clear': state.store.clear(); state.list = null; return { result: true };
    default: throw new Error(`unknown op "${msg.op}"`);
  }
}
