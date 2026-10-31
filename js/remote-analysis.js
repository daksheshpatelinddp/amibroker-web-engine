// "Run on GitHub": send an Optimize / Walk-Forward / Scan / Explore / Backtest to a GitHub Actions runner repo (amibroker-analysis-runner), come back later for the result.
// Everything goes through the GitHub REST API from the browser: jobs/<id>/job.json is written, then workflow analysis.yml is started.
// The runner writes status.json, progress-<n>.json and finally result.json into the same folder.
import { el, openModal, toast, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';
import { nfDecode, gzUnpack } from './json-nan.js';

const CFG_KEY = 'aa_remote_cfg_v1', JOBS_KEY = 'aa_remote_jobs_v1';
const ls = () => { try { return localStorage; } catch (e) { return null; } };
const rd = (k, d) => { try { return JSON.parse(ls().getItem(k)) || d; } catch (e) { return d; } };
const wr = (k, v) => { try { ls().setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

export const loadCfg = () => ({ repo: '', token: '', branch: 'main', shards: 6, ...rd(CFG_KEY, {}) });
export const saveCfg = (c) => wr(CFG_KEY, c);
export const loadJobs = () => rd(JOBS_KEY, []);
export const saveJobs = (j) => wr(JOBS_KEY, j);
export const cfgOk = (c) => /^[\w.-]+\/[\w.-]+$/.test(c.repo || '') && !!(c.token || '').trim();

const b64 = (text) => { const u = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GhClient {
  constructor(cfg, fetchFn) { this.cfg = cfg; this.f = fetchFn || ((...a) => fetch(...a)); this.api = 'https://api.github.com'; }
  h(extra) { return { Authorization: `Bearer ${this.cfg.token.trim()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...extra }; }
  url(path) { return `${this.api}/repos/${this.cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`; }
  async get(path, onProgress) {                       // parsed JSON, or null when the file does not exist yet. onProgress(bytesSoFar, totalBytes) for big files
    const r = await this.f(`${this.url(path)}?ref=${encodeURIComponent(this.cfg.branch)}&_=${Date.now()}`, { headers: this.h({ Accept: 'application/vnd.github.raw+json' }), cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(await this.err(r));
    if (onProgress && r.body && r.body.getReader) {
      const total = Number(r.headers.get('content-length')) || 0, reader = r.body.getReader(), chunks = []; let got = 0;
      for (;;) {
        let timer; const stall = new Promise((_, no) => { timer = setTimeout(() => no(new Error('The download stalled (no data for 90 seconds). Check the connection and try again.')), 90000); });
        const { done, value } = await Promise.race([reader.read(), stall]).finally(() => clearTimeout(timer));
        if (done) break; chunks.push(value); got += value.length; onProgress(got, total);
      }
      const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
      return JSON.parse(new TextDecoder().decode(buf));
    }
    return JSON.parse(await r.text());
  }
  async list(path) {                                // names in a repo folder ([] when it does not exist)
    const r = await this.f(`${this.api}/repos/${this.cfg.repo}/contents/${path}?ref=${encodeURIComponent(this.cfg.branch)}&_=${Date.now()}`, { headers: this.h(), cache: 'no-store' });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(await this.err(r));
    const j = await r.json(); return Array.isArray(j) ? j : [];
  }
  async put(path, obj, msg) {
    for (let a = 0; a < 6; a++) {
      let sha; const m = await this.f(`${this.url(path)}?ref=${encodeURIComponent(this.cfg.branch)}&_=${Date.now()}`, { headers: this.h(), cache: 'no-store' });
      if (m.ok) sha = (await m.json()).sha;
      const r = await this.f(this.url(path), { method: 'PUT', headers: this.h({ 'Content-Type': 'application/json' }), body: JSON.stringify({ message: msg || `job ${path}`, content: b64(JSON.stringify(obj)), branch: this.cfg.branch, ...(sha ? { sha } : {}) }) });
      if (r.ok) return true;
      if ([409, 422, 500, 502, 503].includes(r.status) && a < 5) { await sleep(500 * (a + 1)); continue; }
      throw new Error(await this.err(r));
    }
  }
  async dispatch(id) {
    const r = await this.f(`${this.api}/repos/${this.cfg.repo}/actions/workflows/analysis.yml/dispatches`, { method: 'POST', headers: this.h({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ref: this.cfg.branch, inputs: { job: id } }) });
    if (!r.ok) throw new Error(await this.err(r));
  }
  async err(r) {
    let m = ''; try { m = (await r.json()).message || ''; } catch (e) { /* no body */ }
    if (r.status === 401) return 'GitHub says the token is wrong or expired (401).';
    if (r.status === 403) return `GitHub refused (403). The token needs Contents and Actions write access to this repo. ${m}`;
    if (r.status === 404) return `Not found (404). Check the repo name, and that the token can see it. ${m}`;
    return `GitHub error ${r.status}. ${m}`;
  }
  async check() {                                     // the repo is reachable and has the workflow
    const r = await this.f(`${this.api}/repos/${this.cfg.repo}/actions/workflows/analysis.yml`, { headers: this.h() });
    if (!r.ok) throw new Error(r.status === 404 ? 'The repo has no .github/workflows/analysis.yml (or the token cannot see the repo).' : await this.err(r));
    return true;
  }
}

export const MODE_NAMES = { scan: 'Scan', explore: 'Explore', backtest: 'Backtest', optimize: 'Optimize', walk: 'Walk-Forward' };
/** How many machines a job really uses (the runner applies the same rule): Backtest 1, Scan / Explore at most one per 100 symbols, Optimize / Walk-Forward as many as asked. */
export function jobShards(mode, nSymbols, wanted) {
  const w = Math.max(1, Math.min(20, Math.floor(wanted) || 6));
  if (mode === 'backtest') return 1;
  if (mode === 'scan' || mode === 'explore') return Math.max(1, Math.min(w, Math.ceil(nSymbols / 100)));
  return w;
}
export const newJobId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** spec: everything the runner needs (code, symbols, range, settings ...). Returns the stored job entry. */
export async function submitJob(cfg, spec, meta, client = new GhClient(cfg)) {
  const id = newJobId(), job = { v: 1, id, ...spec, shards: jobShards(spec.mode, spec.symbols.length, cfg.shards) };
  await client.put(`jobs/${id}/job.json`, job, `job ${id} (${job.mode})`);
  await client.dispatch(id);
  const entry = { id, mode: job.mode, formulaName: job.formulaName, symbols: job.symbols.length, shards: job.shards, createdAt: Date.now(), repo: cfg.repo, ...meta };
  saveJobs([entry, ...loadJobs()].slice(0, 50));
  return entry;
}

/** { state: waiting|running|continuing|done|failed, done, total, pct, etaMs, run, message, shards:[{done,total,state}] } */
export async function pollJob(cfg, id, client = new GhClient(cfg)) {
  const status = await client.get(`jobs/${id}/status.json`);
  if (!status) return { state: 'waiting', message: 'Waiting for GitHub to start the job…', pct: 0 };
  const n = status.shards || 1, shards = [];
  if (status.state !== 'done') for (let i = 0; i < n; i++) shards.push(await client.get(`jobs/${id}/progress-${i}.json`));
  let done = 0, total = 0; const first = shards.filter(Boolean).reduce((m, p) => Math.min(m, p.startedAt || Infinity), Infinity);
  shards.forEach((p) => { if (p) { done += p.done || 0; total += p.total || 0; } });
  const pct = status.state === 'done' ? 100 : total ? Math.min(99, Math.round(done / total * 100)) : 0;
  const el_ = isFinite(first) ? Date.now() - first : 0, etaMs = done > 0 && total > done && el_ > 0 ? el_ * (total - done) / done : null;
  return { state: status.state, done, total, pct, etaMs, run: status.run, message: status.message || '', shards: shards.map((p) => p && { done: p.done, total: p.total, state: p.state, label: p.label }), updatedAt: status.updatedAt };
}

export async function fetchResult(cfg, id, client = new GhClient(cfg), onProgress) {
  const r = await client.get(`jobs/${id}/result.json`, onProgress);
  if (!r) throw new Error('The result file is not there yet.');
  r.result = await gzUnpack(r.result);             // a big result is stored compressed
  // An older exploration result can hold far more rows than a phone can open (they were not limited then): keep the first rows
  const t = r.mode === 'explore' && r.result && r.result.table;
  if (t && t.rows && t.rows.length > VIEW_ROWS) { r.result.truncated = r.result.truncated || t.rows.length; t.rows.length = VIEW_ROWS; if (r.result.rows) r.result.rows.length = Math.min(r.result.rows.length, VIEW_ROWS); }
  return nfDecode(r);                              // NaN / Infinity were written in a form JSON keeps
}
const VIEW_ROWS = 60000;

/** Rebuilds the job list from the runner repo (jobs/<id>/job.json), so every device sees every past result. Returns how many jobs were added. */
export async function loadJobsFromRepo(cfg, client = new GhClient(cfg), max = 30) {
  const stamp = (id) => parseInt(String(id).split('-')[0], 36) || 0;           // the job id starts with the time it was sent
  const known = new Set(loadJobs().map((j) => j.id));
  const fresh = (await client.list('jobs')).filter((x) => x.type === 'dir' && !known.has(x.name)).map((x) => x.name).sort((a, b) => stamp(b) - stamp(a)).slice(0, max);
  const added = [];
  for (const id of fresh) {
    try { const job = await client.get(`jobs/${id}/job.json`); if (job && job.mode) added.push({ id, mode: job.mode, formulaName: job.formulaName, symbols: (job.symbols || []).length, shards: job.shards, createdAt: stamp(id) || Date.now(), repo: cfg.repo }); } catch (e) { /* skip this one */ }
  }
  if (added.length) saveJobs([...loadJobs(), ...added].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50));
  return added.length;
}

const fmtDur = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'under a minute' : m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`; };
const STATE_TXT = { waiting: 'starting', running: 'running', continuing: 'continuing in a new run', done: 'finished', failed: 'failed' };

/** The panel. opts: { mode, canSubmit(mode)→spec|null (built by the Analysis window), onView(entry, resultFile), onForm } */
export function openRemotePanel(opts) {
  const st = { poll: {}, timer: null, loading: {} };
  return openModal('Run on GitHub', (body, close) => {
    const cfg = loadCfg();
    const note = (t, c = 'text-[11px] text-slate-400') => el('div', c, t);
    body.appendChild(note('Optimize, Walk-Forward, Scan, Explore and Backtest can run on GitHub machines (free), even with your phone off. Come back later and open the result here. End-of-day data only. The normal buttons in the Analysis window still run on this phone.'));
    // ---- settings
    const box = el('div', 'space-y-1 p-2 rounded border border-slate-800'); body.appendChild(box);
    const inp = (ph, v, type = 'text') => { const i = el('input', INPUT + ' w-full'); i.type = type; i.placeholder = ph; i.value = v; i.autocomplete = 'off'; return i; };
    const repo = inp('owner/amibroker-analysis-runner', cfg.repo), tok = inp('GitHub token (fine-grained, Contents + Actions: write)', cfg.token, 'password'), br = inp('branch', cfg.branch), sh = inp('machines (1-20)', String(cfg.shards), 'number');
    [['Runner repo', repo], ['Token', tok], ['Branch', br], ['Machines per job', sh]].forEach(([l, i]) => { box.appendChild(note(l)); box.appendChild(i); });
    const cur = () => ({ repo: repo.value.trim(), token: tok.value.trim(), branch: br.value.trim() || 'main', shards: Math.max(1, Math.min(20, Number(sh.value) || 6)) });
    const row = el('div', 'flex space-x-2'), test = el('button', BTN + ' !py-1', 'Save & test'); test.type = 'button';
    test.onclick = async () => { const c = cur(); saveCfg(c); if (!cfgOk(c)) { toast('Enter repo (owner/name) and token'); return; } try { await new GhClient(c).check(); toast('Connected ✓'); } catch (e) { toast(e.message); } };
    row.appendChild(test); box.appendChild(row);
    box.appendChild(note('The token stays in this browser only and is sent only to api.github.com.', 'text-[10px] text-slate-500'));
    // ---- submit
    const sub = el('div', 'grid grid-cols-2 gap-2'); body.appendChild(sub);
    for (const [m, label] of [['scan', 'Send Scan'], ['explore', 'Send Explore'], ['backtest', 'Send Backtest'], ['optimize', 'Send Optimize'], ['walk', 'Send Walk-Forward']]) {
      const b = el('button', BTN_PRIMARY, label); b.type = 'button';
      b.onclick = async () => {
        const c = cur(); saveCfg(c); if (!cfgOk(c)) { toast('Enter repo and token first'); return; }
        const spec = opts.buildSpec(m); if (!spec) return;
        const n = jobShards(m, spec.symbols.length, c.shards), mach = m === 'backtest' ? '1 machine (a portfolio backtest needs all symbols together)' : (m === 'scan' || m === 'explore') ? `${n} machine${n === 1 ? '' : 's'} (about 100 symbols each)` : `${n} machines`;
        if (!confirm(`Send this ${MODE_NAMES[m]} to GitHub?\n\n${spec.symbols.length} symbols, ${mach}.\nIt keeps running when you close the app.`)) return;
        b.disabled = true;
        try { await submitJob(c, spec, opts.meta ? opts.meta() : {}); toast('Sent. Check back in a few minutes.'); draw(); refreshAll(); } catch (e) { toast(`${e.message} You can still run it on this phone with the normal button.`); }
        b.disabled = false;
      };
      sub.appendChild(b);
    }
    // ---- job list
    const msg = el('div', 'text-[11px] text-amber-300 min-h-[14px]'); body.appendChild(msg);       // what is happening, and why something did not open
    const setMsg = (t) => { msg.textContent = t || ''; };
    const list = el('div', 'space-y-2'); body.appendChild(list);
    const draw = () => {
      list.innerHTML = ''; const jobs = loadJobs();
      if (!jobs.length) { list.appendChild(note('No jobs sent yet.')); return; }
      jobs.forEach((j) => {
        const p = st.poll[j.id] || {}, card = el('div', 'p-2 rounded border border-slate-800 space-y-1');
        card.appendChild(el('div', 'text-xs text-white', `${MODE_NAMES[j.mode] || j.mode}: ${j.formulaName} · ${j.symbols} symbols`));
        const when = new Date(j.createdAt).toLocaleString();
        card.appendChild(note(`${when} · ${STATE_TXT[p.state] || 'checking…'}${p.pct ? ` · ${p.pct}%` : ''}${p.etaMs ? ` · about ${fmtDur(p.etaMs)} left` : ''}${p.run > 1 ? ` · run ${p.run}` : ''}`));
        if (p.state && p.state !== 'done') { const bar = el('div', 'h-1.5 rounded bg-slate-800 overflow-hidden'); const f = el('div', 'h-full bg-emerald-500'); f.style.width = (p.pct || 0) + '%'; bar.appendChild(f); card.appendChild(bar); }
        if (p.message) card.appendChild(note(p.message, 'text-[11px] text-amber-300'));
        const r = el('div', 'flex flex-wrap gap-2');
        if (p.state === 'done') { const ldg = st.loading[j.id], v = el('button', BTN_PRIMARY + ' !py-1', ldg || 'View result'); v.type = 'button'; v.disabled = !!ldg; v.onclick = async () => {
          if (st.loading[j.id]) return;
          st.loading[j.id] = 'Loading…'; draw();
          try {
            const c2 = cfg2(), cl = new GhClient(c2);
            const size = ((await cl.list(`jobs/${j.id}`).catch(() => [])).find((f) => f.name === 'result.json') || {}).size || 0;     // how big is the file, before downloading it
            if (size > 10e6 && !confirm(`This result file is ${(size / 1e6).toFixed(0)} MB (it was made by an older runner). Downloading it on a phone can take a long time.\n\nTip: send the job again - the current runner saves it about 20 times smaller.\n\nOpen it anyway?`)) return;
            setMsg(`Downloading the result from GitHub${size ? ` (${(size / 1e6).toFixed(1)} MB)` : ''}. A big result can take a minute or two on a slow connection.`);
            let last = 0;
            const res = await fetchResult(c2, j.id, cl, (got, total) => { const now = Date.now(); if (now - last < 400) return; last = now; st.loading[j.id] = `Loading… ${(got / 1e6).toFixed(1)}${total || size ? ' / ' + ((total || size) / 1e6).toFixed(1) : ''} MB`; draw(); });
            const spec = await cl.get(`jobs/${j.id}/job.json`); setMsg('Opening…'); st.loading[j.id] = 'Opening…'; draw();
            await new Promise((r2) => setTimeout(r2, 30));                  // let "Opening…" show before the screen is built
            await opts.onView(j, res, spec); close();
          } catch (e) { setMsg(`Could not open this result: ${e.message}`); toast(e.message); }
          finally { delete st.loading[j.id]; draw(); }
        }; r.appendChild(v); }
        const a = el('a', BTN + ' !py-1 inline-block', 'Open on GitHub'); a.href = `https://github.com/${j.repo}/actions`; a.target = '_blank'; a.rel = 'noopener'; r.appendChild(a);
        const x = el('button', BTN_DANGER + ' !py-1', 'Remove'); x.title = 'Takes this card off the list. The result stays in the repo.'; x.type = 'button'; x.onclick = () => { saveJobs(loadJobs().filter((k) => k.id !== j.id)); draw(); }; r.appendChild(x);
        card.appendChild(r); list.appendChild(card);
      });
    };
    const cfg2 = () => { const c = cur(); return c; };
    let busy = false;
    const refreshAll = async () => {
      if (busy || !cfgOk(cfg2())) return; busy = true;
      for (const j of loadJobs()) { const old = st.poll[j.id]; if (old && old.state === 'done') continue; try { st.poll[j.id] = await pollJob(cfg2(), j.id); } catch (e) { st.poll[j.id] = { state: 'waiting', message: e.message }; } }
      busy = false; draw();
    };
    const rf = el('button', BTN + ' w-full', 'Refresh'); rf.type = 'button'; rf.onclick = refreshAll; body.appendChild(rf);
    const ld = el('button', BTN + ' w-full', 'Load jobs from the repo'); ld.type = 'button'; ld.title = 'Lists the jobs saved in the runner repo (also those sent from another device)';
    const fromRepo = async (quiet) => {
      const c = cfg2(); if (!cfgOk(c)) { if (!quiet) toast('Enter repo and token first'); return; }
      ld.disabled = true;
      try { const n = await loadJobsFromRepo(c); draw(); refreshAll(); if (!quiet) toast(n ? `${n} job${n === 1 ? '' : 's'} added to the list` : 'Nothing new in the repo'); } catch (e) { if (!quiet) toast(e.message); }
      ld.disabled = false;
    };
    ld.onclick = () => fromRepo(false); body.appendChild(ld);
    body.appendChild(note('Results stay in the runner repo (jobs/<id>/result.json). "Remove" only takes a card off this list; "Load jobs from the repo" brings it back. Use the same repo name and token on another device to see all your results there too.', 'text-[10px] text-slate-500'));
    draw(); refreshAll(); if (!loadJobs().length) fromRepo(true); st.timer = setInterval(refreshAll, 45000);   // only while this panel is open
  }, { big: true, stack: true, onClose: () => clearInterval(st.timer) });
}
