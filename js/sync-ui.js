// File -> "Sync data between devices": formulas, categories / watchlists / favorites, sheets and layouts, analysis settings and projects
// are kept in THIS browser. Here they are saved to your private GitHub repo (the same repo and token as "Run on GitHub") or to a backup
// file, and loaded on another device. The GitHub token and the AI key are never copied. See sync-data.js for the rules.
import { el, openModal, toast, labeled, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';
import { GhClient, loadCfg, saveCfg, cfgOk } from './remote-analysis.js';
import { collect, checkBundle, plan, apply, restore, summarize, itemsOf, UNDO_KEY } from './sync-data.js';
import { formulaStore } from './formula-store.js';
import { sharedCfg, saveSharedCfg, publishShared, autoLoadShared } from './shared-data.js';

const PATH = 'sync/app-data.json';
const deviceName = () => { const n = (typeof navigator !== 'undefined' && ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform)) || 'device'; return `${n}${typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent) ? ' (phone)' : ''}`; };
const line = (s) => `${s.formulas} formulas, ${s.sheets} sheet${s.sheets === 1 ? '' : 's'}, categories of ${s.markets.length ? s.markets.join(' + ') : 'no market'}`;

export function openSync(env = {}) {
  const storage = env.storage || localStorage, reload = env.reload || (() => location.reload());
  openModal('Sync data between devices', (body, close) => {
    const note = (t, c = 'text-xs text-slate-400') => el('div', c, t);
    body.appendChild(note('Your formulas, categories, watchlists, favorites, sheets, analysis settings and projects are saved inside this browser, so a new device starts empty. Save them to GitHub here, then load them on the other device. The GitHub token and AI key are never copied.'));
    const c0 = loadCfg();
    const repo = el('input', INPUT + ' w-full'); repo.value = c0.repo; repo.placeholder = 'owner/amibroker-analysis-runner';
    const token = el('input', INPUT + ' w-full'); token.type = 'password'; token.value = c0.token; token.placeholder = 'GitHub token (stays on this device)';
    const branch = el('input', INPUT + ' w-full'); branch.value = c0.branch || 'main';
    body.appendChild(labeled('GitHub repo (use a PRIVATE one)', repo)); body.appendChild(labeled('Token', token)); body.appendChild(labeled('Branch', branch));
    const msg = el('div', 'text-xs text-slate-300 min-h-[18px]'); const setMsg = (t, kind) => { msg.textContent = t; msg.className = 'text-xs min-h-[18px] ' + (kind === 'err' ? 'text-red-300' : kind === 'warn' ? 'text-amber-300' : 'text-emerald-300'); };
    const panel = el('div', 'space-y-2');
    const cur = () => ({ ...loadCfg(), repo: repo.value.trim(), token: token.value.trim(), branch: branch.value.trim() || 'main' });
    const btns = [];
    const busy = (on) => btns.forEach((b) => { b.disabled = on; });
    const mk = (label, fn, cls = BTN) => { const b = el('button', cls, label); b.type = 'button'; b.onclick = fn; btns.push(b); return b; };

    const gh = () => { const c = cur(); if (!cfgOk(c)) { setMsg('Enter the repo (owner/name) and the token first.', 'warn'); return null; } saveCfg(c); return env.client || new GhClient(c); };

    const saveToGithub = async () => {
      const cl = gh(); if (!cl) return; busy(true); setMsg('Saving…', 'warn');
      try {
        const info = await cl.repoInfo().catch(() => null);
        if (info && info.private === false && !confirm('This GitHub repo is PUBLIC: anyone could read your formulas.\n\nSave anyway? (Better: use a private repo.)')) { setMsg('Not saved.', 'warn'); return; }
        const { bundle, skipped } = collect(storage, { device: deviceName() });
        await cl.put(PATH, bundle, `Sync: data saved from ${bundle.device}`);
        setMsg(`Saved to GitHub: ${line(summarize(bundle.items))}.${skipped.length ? ` Left out: ${skipped.map((x) => `${x.key} ${x.reason}`).join('; ')}.` : ''}`);
      } catch (e) { setMsg(`Could not save: ${e.message}`, 'err'); } finally { busy(false); }
    };
    const loadFromGithub = async () => {
      const cl = gh(); if (!cl) return; busy(true); setMsg('Reading from GitHub…', 'warn');
      try { const b = await cl.get(PATH); if (!b) { setMsg('Nothing saved on GitHub yet. On the device that has your data, press "Save to GitHub" first.', 'warn'); return; } setMsg(''); showChoice(checkBundle(b), 'GitHub'); }
      catch (e) { setMsg(`Could not load: ${e.message}`, 'err'); } finally { busy(false); }
    };

    function showChoice(bundle, source) {
      panel.innerHTML = '';
      const mine = summarize(itemsOf(storage)), theirs = summarize(bundle.items);
      const box = el('div', 'p-2 rounded border border-slate-700 space-y-2'); panel.appendChild(box);
      box.appendChild(el('div', 'text-xs text-white', `Copy from ${source}, saved ${new Date(bundle.savedAt).toLocaleString()} on ${bundle.device || 'a device'}`));
      box.appendChild(note(`The copy: ${line(theirs)}`)); box.appendChild(note(`This device now: ${line(mine)}`));
      const mode = el('select', INPUT + ' w-full');
      for (const [v, t] of [['replace', 'Replace what is on this device with the copy'], ['add', 'Add what is missing here (formulas are joined)']]) { const o = el('option', '', t); o.value = v; mode.appendChild(o); }
      mode.value = mine.formulas === 0 ? 'replace' : 'add'; box.appendChild(mode);
      box.appendChild(note('You can undo a load right after (Undo last load).', 'text-[10px] text-slate-500'));
      const go = el('button', BTN_PRIMARY + ' w-full', 'Load now'); go.type = 'button';
      go.onclick = () => {
        const pl = plan(storage, bundle, mode.value);
        if (!Object.keys(pl.writes).length) { setMsg('Nothing to change: this device already has it.'); panel.innerHTML = ''; return; }
        const undo = apply(storage, pl);
        try { storage.setItem(UNDO_KEY, JSON.stringify({ at: Date.now(), items: undo })); } catch (e) { /* too big to keep: no undo */ }
        setMsg(`Loaded ${Object.keys(pl.writes).length} item${Object.keys(pl.writes).length === 1 ? '' : 's'}. ${pl.notes.join('. ')} The app reloads now…`);
        go.disabled = true; setTimeout(reload, 1200);
      };
      box.appendChild(go);
    }

    const download = () => {
      const { bundle } = collect(storage, { device: deviceName() });
      const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' })); a.download = `amibroker-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); setMsg(`Backup file made: ${line(summarize(bundle.items))}.`);
    };
    const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.style.display = 'none';
    file.onchange = async () => { try { const t = await file.files[0].text(); showChoice(checkBundle(JSON.parse(t)), 'the file'); setMsg(''); } catch (e) { setMsg(`Could not open that file: ${e.message}`, 'err'); } file.value = ''; };

    const row1 = el('div', 'grid grid-cols-2 gap-2'); row1.appendChild(mk('Save to GitHub', saveToGithub, BTN_PRIMARY)); row1.appendChild(mk('Load from GitHub', loadFromGithub, BTN_PRIMARY)); body.appendChild(row1);
    const row2 = el('div', 'grid grid-cols-2 gap-2'); row2.appendChild(mk('Download backup file', download)); row2.appendChild(mk('Open backup file…', () => file.click())); body.appendChild(row2); body.appendChild(file);
    // ---- the public library
    body.appendChild(note('Share with everyone (public library)', 'text-xs text-white pt-3'));
    body.appendChild(note('Publish puts your formulas, categories, watchlists, favorites, sheets, analysis settings and projects in a PUBLIC GitHub repo. Everyone who opens the app then gets them automatically, about a minute after you publish. No tokens or keys are included. A device where someone changed things keeps those changes.'));
    const sc = sharedCfg(storage);
    const srepo = el('input', INPUT + ' w-full'); srepo.value = sc.repo; srepo.placeholder = 'owner/amibroker-shared-data';
    const sauto = el('select', INPUT + ' w-full'); for (const [v, t] of [['1', 'Load the public library automatically when the app opens'], ['0', 'Do not load it automatically on this device']]) { const o = el('option', '', t); o.value = v; sauto.appendChild(o); } sauto.value = sc.auto ? '1' : '0';
    const keepCfg = () => saveSharedCfg({ repo: srepo.value.trim(), branch: branch.value.trim() || 'main', auto: sauto.value === '1' }, storage);
    sauto.onchange = keepCfg; srepo.onchange = keepCfg;
    body.appendChild(labeled('Public repo', srepo)); body.appendChild(sauto);
    const publish = async () => {
      const c = cur(); if (!/^[\w.-]+\/[\w.-]+$/.test(srepo.value.trim()) || !c.token) { setMsg('Enter the public repo (owner/name) and the token first.', 'warn'); return; }
      if (!confirm(`Publish to ${srepo.value.trim()}?\n\nANYONE can read your formulas, categories, watchlists, favorites, sheets, settings and projects, and every device that opens the app will load them.`)) { setMsg('Not published.', 'warn'); return; }
      keepCfg(); busy(true); setMsg('Publishing…', 'warn');
      try { const b = await publishShared({ cfg: { repo: srepo.value.trim(), branch: c.branch }, token: c.token, storage, device: deviceName() }); setMsg(`Published: ${line(summarize(b.items))}. Other devices get it within a minute or two.`); }
      catch (e) { setMsg(`Could not publish: ${e.message}`, 'err'); } finally { busy(false); }
    };
    const loadShared = async () => {
      if (!confirm('Replace what is on this device with the public library? (You can undo it right after.)')) return;
      keepCfg(); busy(true); setMsg('Reading the public library…', 'warn');
      try { const r = await autoLoadShared({ storage, force: true, reload, notify: (t) => setMsg(t), fetchFn: env.fetchFn }); setMsg(r.status === 'loaded' ? 'Loaded. The app reloads now…' : r.status === 'unavailable' ? `Nothing could be read from ${srepo.value.trim()} (is it public, and has anything been published?).` : 'Nothing to change: this device already has it.', r.status === 'unavailable' ? 'warn' : undefined); }
      catch (e) { setMsg(`Could not load: ${e.message}`, 'err'); } finally { busy(false); }
    };
    const row3 = el('div', 'grid grid-cols-2 gap-2'); row3.appendChild(mk('Publish my data to everyone', publish, BTN_PRIMARY)); row3.appendChild(mk('Load public library now', loadShared)); body.appendChild(row3);
    body.appendChild(msg); body.appendChild(panel);
    const undoRaw = (() => { try { return storage.getItem(UNDO_KEY); } catch (e) { return null; } })();
    if (undoRaw) {
      const u = JSON.parse(undoRaw);
      const b = el('button', BTN_DANGER + ' w-full', `Undo last load (${new Date(u.at).toLocaleString()})`); b.type = 'button';
      b.onclick = () => { restore(storage, u.items); try { storage.removeItem(UNDO_KEY); } catch (e) { /* ignore */ } setMsg('Undone. The app reloads now…'); b.disabled = true; setTimeout(reload, 1000); };
      body.appendChild(b);
    }
    body.appendChild(note('Where it goes: sync/app-data.json in the repo (each save is a commit, so older versions stay in the repo history).', 'text-[10px] text-slate-500'));
  });
}

/** Once, on a device that has no formulas and no GitHub setup: tells where to bring the data from. */
export function newDeviceHint(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try {
    if (!storage || storage.getItem('sync_hint_seen') === '1') return;
    storage.setItem('sync_hint_seen', '1');
    if (formulaStore.user.length === 0 && !cfgOk(loadCfg())) toast('New device? File → Sync data between devices brings your formulas and categories here.');
  } catch (e) { /* a hint only */ }
}
