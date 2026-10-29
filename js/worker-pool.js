// A small pool of Web Workers (js/data-worker.js). If workers cannot start (old browser, blocked, no reply to a ping within
// 30 s: on a slow mobile network the worker's own script files can take many seconds on the first start) the same work runs inside the page instead: slower, but it always finishes. Nothing here waits for fflate.
import { newState, handle } from './worker-core.js';

export class WorkerPool {
  constructor({ size, inline = false, url, startTimeoutMs = 30000 } = {}) {
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    this.size = Math.max(1, size || Math.min(6, cores - 1));
    this.inline = inline || typeof Worker === 'undefined';
    this.url = url || new URL('./data-worker.js', import.meta.url);
    this.startTimeoutMs = startTimeoutMs;
    this.workers = []; this.states = []; this.nextId = 1; this._start = null; this.fallbackReason = '';
  }

  ready() { if (!this._start) this._start = this._boot(); return this._start; }
  /** Starts the workers now, without waiting, so they are up while the data is still downloading. */
  prewarm() { this.ready().catch(() => {}); }

  async _boot() {
    if (!this.inline) {
      try {
        for (let i = 0; i < this.size; i++) this.workers.push(this._spawn());
        await Promise.all(this.workers.map((w) => this._post(w, { op: 'ping' }, [], this.startTimeoutMs)));
      } catch (e) {
        this.fallbackReason = String((e && e.message) || e);
        for (const w of this.workers) try { w.terminate(); } catch (e2) { /* ignore */ }
        this.workers = []; this.inline = true;
      }
    }
    if (this.inline) this.states = Array.from({ length: this.size }, newState);
    return this.inline ? 'inline' : 'workers';
  }

  _spawn() {
    const w = new Worker(this.url, { type: 'module' });
    w._pending = new Map();
    w.onmessage = (e) => {
      const p = w._pending.get(e.data.id);
      if (!p) return;
      w._pending.delete(e.data.id); clearTimeout(p.timer);
      e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error));
    };
    w.onerror = (e) => {
      const err = new Error(`worker failed: ${(e && e.message) || 'could not start'}`);
      for (const p of w._pending.values()) { clearTimeout(p.timer); p.reject(err); }
      w._pending.clear();
    };
    return w;
  }

  _post(w, msg, transfer, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const p = { resolve, reject, timer: null };
      if (timeoutMs) p.timer = setTimeout(() => { w._pending.delete(id); reject(new Error('worker did not answer')); }, timeoutMs);
      w._pending.set(id, p);
      w.postMessage({ id, ...msg }, transfer);
    });
  }

  /** Sends one message to worker i and returns its result. */
  async call(i, msg, transfer = []) {
    await this.ready();
    if (this.inline) return (await handle(this.states[i % this.size], msg)).result;
    return this._post(this.workers[i % this.size], msg, transfer, 0);
  }

  broadcast(msg, indexes) {
    const ids = indexes || Array.from({ length: this.size }, (_, i) => i);
    return Promise.all(ids.map((i) => this.call(i, msg)));
  }

  /**
   * Decodes stocks in the workers and yields them in order.  getBytes(sym) -> { h, r } compressed blocks (either may be null).
   * Chunks of stocks go to the workers round-robin; a few chunks are in flight at once.
   */
  async *decodeStream(syms, getBytes, { bars = 0, chunk = 16, ahead } = {}) {
    await this.ready();
    const chunks = [];
    for (let i = 0; i < syms.length; i += chunk) chunks.push(syms.slice(i, i + chunk));
    const win = ahead || this.size * 2;
    const q = [];
    let next = 0;
    const dispatch = (ci) => {
      const items = [], transfer = [];
      for (const s of chunks[ci]) {
        const { h, r } = getBytes(s);
        const hc = h ? h.slice() : null, rc = r ? r.slice() : null;     // copies: a view would drag its whole download buffer along
        if (hc) transfer.push(hc.buffer);
        if (rc) transfer.push(rc.buffer);
        items.push({ sym: s, h: hc, r: rc });
      }
      return this.call(ci % this.size, { op: 'decode', items, bars }, transfer);
    };
    while (next < chunks.length || q.length) {
      while (next < chunks.length && q.length < win) q.push(dispatch(next++));
      const res = await q.shift();
      for (const item of res) if (item) yield item;
    }
  }

  terminate() { for (const w of this.workers) try { w.terminate(); } catch (e) { /* ignore */ } this.workers = []; this._start = null; }
}
