// Web Worker: decodes pack blocks and (for the optimizer) keeps stocks in memory and runs tasks over them. See worker-core.js.
//
// WHY THIS CANNOT HANG: the message handler is installed first, in plain top-level code, and the optional fast inflater (fflate)
// is requested afterwards WITHOUT waiting: nothing here ever awaits it. If the network is slow, blocked or answers never, the worker
// simply keeps using the browser's own inflater. (A worker that waits for a CDN script before it answers its first message, or
// that does a top-level await on it, stays silent forever when the script never arrives.)
import { newState, handle, setFastInflater } from './worker-core.js';

const state = newState();
self.onmessage = async (e) => {
  const { id, ...msg } = e.data;
  try {
    const { result, transfer } = await handle(state, msg);
    self.postMessage({ id, ok: true, result }, transfer || []);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};

const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';
import(FFLATE).then((m) => setFastInflater(m.unzlibSync)).catch(() => { /* fine: the browser's own inflater is used */ });
