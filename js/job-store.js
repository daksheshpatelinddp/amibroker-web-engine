// A long optimization / walk-forward saves its progress here (IndexedDB, falls back to localStorage), so a phone that put the page to sleep,
// a closed tab or a reload does not cost the work already done: the Analysis window offers "Resume". One saved job at a time.
const DB = 'analysis_jobs_v1', STORE = 'jobs', KEY = 'current';
let dbp = null;
const open = () => {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE); };
    rq.onsuccess = () => resolve(rq.result); rq.onerror = () => reject(rq.error);
  });
  return dbp;
};
const tx = async (mode, fn) => { const db = await open(); return new Promise((resolve, reject) => { const t = db.transaction(STORE, mode), r = fn(t.objectStore(STORE)); t.oncomplete = () => resolve(r && r.result); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); }); };

export async function saveJob(job) {
  try { await tx('readwrite', (s) => s.put(job, KEY)); return true; } catch (e) { /* try the small fallback */ }
  try { localStorage.setItem(DB, JSON.stringify(job)); return true; } catch (e) { return false; }
}
export async function loadJob() {
  try { const j = await tx('readonly', (s) => s.get(KEY)); if (j) return j; } catch (e) { /* fall back */ }
  try { return JSON.parse(localStorage.getItem(DB) || 'null'); } catch (e) { return null; }
}
export async function deleteJob() {
  try { await tx('readwrite', (s) => s.delete(KEY)); } catch (e) { /* ignore */ }
  try { localStorage.removeItem(DB); } catch (e) { /* ignore */ }
}
