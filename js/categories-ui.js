// Symbols, Categories & Watchlists window (AmiBroker's Symbol > Categories / Organize Assignments / Watch lists).
import { el, openModal, toast, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';
import { host } from './host.js';
import { categoryStore, TYPES, typeInfo, UNASSIGNED, parseSymbolText } from './category-store.js';
import { DATABASES, addUserDatabase, removeUserDatabase } from './config.js';

const CHIP = 'px-2 py-1 rounded-full border text-[11px] whitespace-nowrap ';
const CHIP_ON = CHIP + 'bg-sky-600 border-sky-500 text-white', CHIP_OFF = CHIP + 'bg-slate-800 border-slate-700 text-slate-300';
let CUR = null;   // symbols of the database being browsed (null = the one on screen)
const allSymbols = () => CUR || host.symbols() || [];

function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** File text; understands UTF-8 and UTF-16 (Windows Notepad "Unicode") files. */
async function readText(f) {
  const b = new Uint8Array(await f.arrayBuffer());
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b);
  return new TextDecoder('utf-8').decode(b);
}
function pickFiles(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = true; i.style.display = 'none';
    i.onchange = async () => { const fs = [...(i.files || [])]; i.remove(); resolve(await Promise.all(fs.map(async (f) => ({ name: f.name, text: await readText(f) })))); };
    document.body.appendChild(i); i.click();
  });
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
    i.onchange = async () => { const f = i.files && i.files[0]; i.remove(); resolve(f ? { name: f.name, text: await readText(f) } : null); };
    document.body.appendChild(i); i.click();
  });
}
/** Small text prompt that stays inside the app (window.prompt is awkward on phones). */
export function ask(title, label, initial = '', extra = null) {
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openModal(title, (b, close) => {
      const inp = el('input', INPUT + ' w-full'); inp.value = initial; inp.autocomplete = 'off';
      b.appendChild(el('div', 'text-[11px] text-slate-400', label)); b.appendChild(inp);
      const ex = extra ? extra() : null; if (ex) b.appendChild(ex.node);
      const row = el('div', 'flex space-x-2');
      const ok = el('button', BTN_PRIMARY + ' flex-1', 'OK'); ok.type = 'button';
      const no = el('button', BTN + ' flex-1', 'Cancel'); no.type = 'button';
      ok.onclick = () => { const v = inp.value.trim(); if (!v) return; finish(ex ? { value: v, extra: ex.get() } : v); close.force(); };
      no.onclick = () => { finish(null); close.force(); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') ok.click(); };
      row.appendChild(ok); row.appendChild(no); b.appendChild(row); setTimeout(() => inp.focus(), 50);
    }, { stack: true, onClose: () => finish(null) });
  });
}

/** "Save these symbols as a watchlist" (used by Analysis results). Returns the name or null. */
export async function saveSymbolsAsWatchlist(symbols, suggestion = 'Scan results') {
  const st = categoryStore(); if (!symbols || !symbols.length) { toast('No symbols to save'); return null; }
  const name = await ask('Save as watchlist', `${symbols.length} symbols. Name of the watchlist (an existing name adds to it):`, suggestion);
  if (!name) return null;
  const hit = st.names('watchlists').find((n) => n.toLowerCase() === name.toLowerCase()) || (st.add('watchlists', name), name);
  const n = st.addSymbols('watchlists', hit, symbols);
  toast(`${n} symbol${n === 1 ? '' : 's'} added to watchlist "${hit}"`); return hit;
}

/** Checkbox list of the database for adding many symbols at once ("Organize assignments"). */
function openBulkAdd(title, already, onAdd) {
  openModal(title, (b, close) => {
    const all = allSymbols(); const have = new Set(already.map((s) => s.toUpperCase())); const picked = new Set();
    const q = el('input', INPUT + ' w-full'); q.placeholder = 'Filter (e.g. BANK)'; q.autocomplete = 'off';
    const info = el('div', 'text-[11px] text-slate-400');
    const list = el('div', 'max-h-72 overflow-y-auto border border-slate-800 rounded');
    const draw = () => {
      list.innerHTML = ''; const f = q.value.trim().toUpperCase(); let shown = 0;
      for (const s of all) {
        if (have.has(s.toUpperCase()) || (f && !s.toUpperCase().includes(f))) continue;
        if (++shown > 400) { list.appendChild(el('div', 'px-2 py-1 text-[11px] text-slate-500', 'Type in the filter box to narrow the list...')); break; }
        const row = el('label', 'flex items-center space-x-2 px-2 py-1 border-b border-slate-800');
        const c = document.createElement('input'); c.type = 'checkbox'; c.checked = picked.has(s);
        c.onchange = () => { if (c.checked) picked.add(s); else picked.delete(s); info.textContent = `${picked.size} selected`; };
        row.appendChild(c); row.appendChild(el('span', 'text-xs text-slate-200', s)); list.appendChild(row);
      }
      if (!shown) list.appendChild(el('div', 'px-2 py-2 text-[11px] text-slate-500', all.length ? 'Nothing to add.' : 'The symbol list is still loading. Open a symbol first, or use "Type symbols".'));
    };
    q.oninput = draw; draw();
    const sel = el('button', BTN + ' flex-1', 'Select all shown'); sel.type = 'button';
    sel.onclick = () => { const f = q.value.trim().toUpperCase(); all.forEach((s) => { if (!have.has(s.toUpperCase()) && (!f || s.toUpperCase().includes(f))) picked.add(s); }); info.textContent = `${picked.size} selected`; draw(); };
    const add = el('button', BTN_PRIMARY + ' flex-1', 'Add selected'); add.type = 'button';
    add.onclick = () => { if (!picked.size) { toast('Tick some symbols first'); return; } onAdd([...picked]); close.force(); };
    b.appendChild(q); b.appendChild(list); b.appendChild(info);
    const row = el('div', 'flex space-x-2'); row.appendChild(sel); row.appendChild(add); b.appendChild(row);
  }, { stack: true });
}

/** Add a database (market) whose files are in its own folder on R2. */
function openAddDatabase(onDone) {
  openModal('Add database', (b, close) => {
    b.appendChild(el('div', 'text-[11px] text-slate-400', 'A database is one market with its own symbols, categories, watchlists, favorites and indexes. Upload its files to the R2 bucket in a folder of its own (like nse/), then enter the folder name here.'));
    const nm = el('input', INPUT + ' w-full'); nm.placeholder = 'Name, e.g. BSE';
    const fo = el('input', INPUT + ' w-full'); fo.placeholder = 'R2 folder, e.g. bse';
    const cu = el('input', INPUT + ' w-full'); cu.value = 'INR';
    [['Name', nm], ['Folder on R2', fo], ['Currency', cu]].forEach(([l, c]) => { const w = el('label', 'block'); w.appendChild(el('div', 'text-[11px] text-slate-400 mb-1', l)); w.appendChild(c); b.appendChild(w); });
    const go = el('button', BTN_PRIMARY + ' w-full', 'Add'); go.type = 'button';
    go.onclick = () => {
      const id = addUserDatabase({ name: nm.value, folder: fo.value || nm.value, currency: cu.value.trim() || 'INR' });
      if (!id) { toast('Enter a name and a folder that is not already used.'); return; }
      close.force(); toast(`${nm.value.trim()} added. Reloading...`); setTimeout(() => { onDone(id); }, 600);
    };
    b.appendChild(go);
  }, { stack: true });
}

export function openCategories(opts = {}) {
  let st = categoryStore(opts.db);
  const state = { db: opts.db || host.activeDb(), type: opts.type || 'watchlists', name: opts.name || null, filter: '' };
  CUR = state.db === host.activeDb() ? null : [];
  openModal('Symbols · Categories · Watchlists', (b, close) => {
    const dbBar = el('div', 'space-y-1');
    b.appendChild(dbBar);
    const chips = el('div', 'flex space-x-1 overflow-x-auto pb-1');
    const help = el('div', 'text-[11px] text-slate-400');
    const cols = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-2');
    const left = el('div', 'space-y-2'), right = el('div', 'space-y-2');
    cols.appendChild(left); cols.appendChild(right);
    const foot = el('div', 'flex flex-wrap gap-2 pt-1 border-t border-slate-800');
    b.appendChild(chips); b.appendChild(help); b.appendChild(cols); b.appendChild(foot);

    const T = () => typeInfo(state.type);
    const names = () => st.names(state.type);
    const ensureName = () => { const n = names(); if (!n.includes(state.name)) state.name = n.find((x) => x !== UNASSIGNED) || n[0] || null; };

    const isActive = () => state.db === host.activeDb();
    const drawDb = () => {
      dbBar.innerHTML = '';
      const row = el('div', 'flex space-x-1 overflow-x-auto pb-1 items-center');
      row.appendChild(el('span', 'text-[10px] uppercase tracking-wide text-slate-500 shrink-0', 'Database'));
      Object.values(DATABASES).forEach((d) => {
        const c = el('button', d.id === state.db ? CHIP_ON : CHIP_OFF, (d.id === host.activeDb() ? '● ' : '') + d.name); c.type = 'button'; c.title = d.id === host.activeDb() ? 'Database on screen' : 'Browse this database';
        c.onclick = () => switchBrowse(d.id); row.appendChild(c);
      });
      const add = el('button', CHIP_OFF, '＋ Add'); add.type = 'button'; add.onclick = () => openAddDatabase(() => location.reload()); row.appendChild(add);
      dbBar.appendChild(row);
      const info = el('div', 'flex flex-wrap items-center gap-2 text-[11px] text-slate-400');
      const n = allSymbols().length;
      info.appendChild(el('span', '', `${(DATABASES[state.db] || {}).name || state.db}: ${n ? n.toLocaleString('en-IN') + ' symbols' : 'loading symbols…'} · its own categories, watchlists, favorites and indexes`));
      if (!isActive()) {
        const go = el('button', BTN_PRIMARY + ' !px-2 !py-1', 'Open this database ▶'); go.type = 'button';
        go.onclick = () => { if (confirm(`Show the ${(DATABASES[state.db] || {}).name} database on the chart? The app reloads.`)) host.switchDb(state.db); };
        info.appendChild(go);
      }
      if ((DATABASES[state.db] || {}).user) {
        const rm = el('button', BTN_DANGER + ' !px-2 !py-1', 'Remove database'); rm.type = 'button';
        rm.onclick = () => { if (confirm(`Remove ${DATABASES[state.db].name} from the list? Its saved categories stay in this browser.`)) { removeUserDatabase(state.db); location.reload(); } };
        info.appendChild(rm);
      }
      dbBar.appendChild(info);
    };
    const switchBrowse = (id) => {
      if (id === state.db) return;
      state.db = id; st = categoryStore(id); state.name = null; state.filter = '';
      CUR = id === host.activeDb() ? null : [];
      render();
      if (!isActive()) host.symbolsOf(id).then((list) => { if (state.db === id) { CUR = list; render(); } }).catch((e) => { if (state.db === id) { help.textContent = `Could not read the symbols of this database: ${e.message || e}`; } });
    };

    const drawChips = () => {
      chips.innerHTML = '';
      TYPES.forEach((t) => { const c = el('button', t.id === state.type ? CHIP_ON : CHIP_OFF, t.label); c.type = 'button'; c.onclick = () => { state.type = t.id; state.name = null; state.filter = ''; render(); }; chips.appendChild(c); });
    };

    const drawLeft = () => {
      left.innerHTML = '';
      const t = T(), all = allSymbols();
      const bar = el('div', 'flex flex-wrap gap-1');
      const mk = (label, fn, cls = BTN) => { const x = el('button', cls + ' !px-2 !py-1', label); x.type = 'button'; x.onclick = fn; bar.appendChild(x); return x; };
      if (!['all', 'fav'].includes(t.kind)) {
        mk('＋ New', async () => {
          if (t.kind === 'industry') {
            const r = await ask('New industry', 'Name of the industry:', '', () => { const s = el('select', INPUT + ' w-full'); [['', '(no sector)'], ...st.data.sectors.map((x) => [x, x])].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; s.appendChild(o); }); const w = el('div', 'space-y-1'); w.appendChild(el('div', 'text-[11px] text-slate-400', 'Belongs to sector')); w.appendChild(s); return { node: w, get: () => s.value }; });
            if (r && st.add('industries', r.value, { sector: r.extra })) { state.name = r.value; render(); } else if (r) toast('That name already exists');
            return;
          }
          const n = await ask(`New ${t.one}`, 'Name:'); if (n) { if (st.add(state.type, n)) { state.name = n; render(); } else toast('That name already exists'); }
        }, BTN_PRIMARY);
        mk('Rename', async () => { if (!state.name || state.name === UNASSIGNED) return; const n = await ask('Rename', 'New name:', state.name); if (n && st.rename(state.type, state.name, n)) { state.name = n; render(); } else if (n) toast('Could not rename (name already used?)'); });
        mk('Delete', () => {
          if (!state.name || state.name === UNASSIGNED) return;
          const cnt = st.count(state.type, state.name, all);
          if (confirm(`Delete ${t.one} "${state.name}"${cnt ? ` (${cnt} symbols stay in the database, they just lose this ${t.one})` : ''}?`)) { st.remove(state.type, state.name); state.name = null; render(); }
        }, BTN_DANGER);
      }
      if (t.kind === 'code') mk('Import code list…', async () => { const f = await pickFile('.txt,.csv'); if (f) { toast(`${st.importCodes(state.type, f.text)} categories added`); render(); } });
      if (t.kind === 'free') mk('Import lists…', async () => {
        const f = await pickFile('.txt,.tls,.csv,.lst,text/plain'); if (!f) return;
        const secs = parseSymbolText(f.text, all).sections;
        if (Object.keys(secs).length && confirm(`This file has ${Object.keys(secs).length} sections (###). Create one watchlist for each?`)) { const r = st.importSections(state.type, f.text, all); toast(`${r.length} lists created, ${r.reduce((a, x) => a + x.added, 0)} symbols added`); render(); return; }
        const base = f.name.replace(/\.[^.]+$/, '');
        const nm = await ask('Import into', 'Create / add to which list?', state.name || base); if (!nm) return;
        if (!st.names(state.type).some((x) => x.toLowerCase() === nm.toLowerCase())) st.add(state.type, nm);
        const hit = st.names(state.type).find((x) => x.toLowerCase() === nm.toLowerCase());
        const r = st.importInto(state.type, hit, f.text, all); state.name = hit;
        if (!r.total) { toast(`No symbols found in "${f.name}". It starts with: ${f.text.trim().slice(0, 60) || '(empty file)'}`, 7000); render(); return; }
        toast(`${r.added} added to "${hit}"${r.unknown.length ? `, ${r.unknown.length} not in database (${r.unknown.slice(0, 6).join(', ')}${r.unknown.length > 6 ? ' …' : ''})` : ''}`); render();
      });
      left.appendChild(bar);
      if (t.kind === 'industry') { /* sector shown on each row */ }
      const list = el('div', 'max-h-64 overflow-y-auto border border-slate-800 rounded');
      const idxRows = state.type === 'indexes' ? new Map(st.indexRows(all).map((x) => [x.name, x])) : null;
      const openIndex = (n) => {
        const sym = idxRows && idxRows.get(n) ? idxRows.get(n).symbol : '';
        if (!sym) { state.name = n; state.filter = ''; drawLeft(); drawRight(); toast(`No chart for "${n}" in this database. Use "Set chart symbol…" to choose one.`); return; }
        if (!isActive()) { toast('Open this database first (button at the top).'); return; }
        host.openSymbol(sym); close.force(); toast(`Opened ${sym}`);
      };
      const makeRow = (n, extra = '') => {
        if (idxRows) {   // Indexes tab: tap the name to open the index chart, ▤ shows the stocks inside
          const ir = idxRows.get(n) || { symbol: '', members: 0 };
          const r = el('div', 'w-full flex items-stretch border-b border-slate-800 ' + (n === state.name ? 'bg-sky-900/50' : ''));
          const nb = el('button', 'flex-1 min-w-0 flex items-center px-2 py-2 text-left text-slate-100 active:bg-slate-800'); nb.type = 'button'; nb.title = ir.symbol ? 'Open the chart' : 'This database has no chart for this index';
          nb.appendChild(el('span', 'text-sm mr-2', ir.symbol ? '📈' : '·'));
          const nm = el('span', 'min-w-0'); nm.appendChild(el('span', 'block text-xs truncate', n));
          nm.appendChild(el('span', 'block text-[10px] ' + (ir.symbol ? 'text-sky-300' : 'text-slate-500'), ir.symbol ? `chart: ${ir.symbol}` : 'no chart symbol in this database'));
          nb.appendChild(nm); nb.onclick = () => openIndex(n);
          const mb = el('button', 'px-3 text-[11px] text-slate-400 active:bg-slate-800 shrink-0', `▤ ${ir.members}`); mb.type = 'button'; mb.title = 'Stocks in this index';
          mb.onclick = () => { state.name = n; state.filter = ''; drawLeft(); drawRight(); };
          r.appendChild(nb); r.appendChild(mb); list.appendChild(r); return;
        }
        const c = st.count(state.type, n, all);
        const r = el('button', 'w-full flex items-center justify-between px-2 py-2 text-left border-b border-slate-800 ' + (n === state.name ? 'bg-sky-900/50 text-sky-100' : 'text-slate-200 active:bg-slate-800'));
        r.type = 'button';
        const l = el('span', 'text-xs truncate', n); if (extra) l.appendChild(el('span', 'text-[10px] text-slate-500 ml-1', extra));
        r.appendChild(l); r.appendChild(el('span', 'text-[10px] text-slate-400 ml-2 shrink-0', String(c)));
        r.onclick = () => { state.name = n; state.filter = ''; drawLeft(); drawRight(); };
        list.appendChild(r);
      };
      if (t.kind === 'industry') {
        const bySector = new Map(); st.data.industries.forEach((i) => { const k = i.sector || '(no sector)'; if (!bySector.has(k)) bySector.set(k, []); bySector.get(k).push(i.name); });
        for (const [sec, arr] of bySector) { list.appendChild(el('div', 'px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500 bg-slate-900 sticky top-0', sec)); arr.forEach((n) => makeRow(n)); }
        makeRow(UNASSIGNED);
      } else names().forEach((n) => makeRow(n));
      if (!names().length) list.appendChild(el('div', 'px-2 py-3 text-[11px] text-slate-500', 'No lists yet. Tap "＋ New" or "Import lists…".'));
      left.appendChild(list);
      if (t.kind === 'industry' && state.name && state.name !== UNASSIGNED) {
        const sel = el('select', INPUT + ' w-full'); [['', '(no sector)'], ...st.data.sectors.map((x) => [x, x])].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; if (v === st.sectorOfIndustry(state.name)) o.selected = true; sel.appendChild(o); });
        sel.onchange = () => { st.setIndustrySector(state.name, sel.value); render(); };
        const w = el('div', ''); w.appendChild(el('div', 'text-[11px] text-slate-400 mb-1', `Sector of "${state.name}"`)); w.appendChild(sel); left.appendChild(w);
      }
      if (t.kind === 'sector' && state.name && state.name !== UNASSIGNED) { const inds = st.industriesOf(state.name); if (inds.length) left.appendChild(el('div', 'text-[10px] text-slate-500', `${inds.length} industries: ${inds.slice(0, 6).join(', ')}${inds.length > 6 ? '…' : ''}`)); }
    };

    const drawRight = () => {
      right.innerHTML = '';
      const t = T(), all = allSymbols();
      if (!state.name) { right.appendChild(el('div', 'text-[11px] text-slate-500 py-6 text-center', 'Choose a list on the left.')); return; }
      const members = st.members(state.type, state.name, all);
      const known = new Set(all.map((s) => s.toUpperCase()));
      right.appendChild(el('div', 'text-xs font-semibold text-slate-100 truncate', `${state.name} · ${members.length} ${state.type === 'indexes' ? 'stock' : 'symbol'}${members.length === 1 ? '' : 's'}`));
      if (state.type === 'indexes') {
        const ir = st.indexRows(all).find((x) => x.name === state.name);
        const ib = el('div', 'flex flex-wrap gap-1 items-center');
        ib.appendChild(el('span', 'text-[11px] text-slate-400', ir && ir.symbol ? `Chart symbol: ${ir.symbol}` : 'No chart symbol found.'));
        const o = el('button', BTN_PRIMARY + ' !px-2 !py-1', 'Open index chart ▶'); o.type = 'button'; o.onclick = () => openIndex(state.name); if (!ir || !ir.symbol) o.disabled = true;
        const sb = el('button', BTN + ' !px-2 !py-1', 'Set chart symbol…'); sb.type = 'button';
        sb.onclick = async () => { const v = await ask('Chart symbol', `Which symbol of this database is "${state.name}"? (type AUTO for the automatic match)`, st.data.indexSym[state.name] || (ir && ir.symbol) || ''); if (v === null) return; st.setIndexSymbol(state.name, /^auto$/i.test(v) ? '' : v); render(); };
        ib.appendChild(o); ib.appendChild(sb); right.appendChild(ib);
      }
      const q = el('input', INPUT + ' w-full'); q.placeholder = 'Filter…'; q.value = state.filter; q.autocomplete = 'off';
      const list = el('div', 'max-h-56 overflow-y-auto border border-slate-800 rounded');
      const draw = () => {
        list.innerHTML = ''; const f = state.filter.toUpperCase(); let n = 0;
        for (const s of members) {
          if (f && !s.toUpperCase().includes(f)) continue; if (++n > 500) { list.appendChild(el('div', 'px-2 py-1 text-[10px] text-slate-500', 'Showing the first 500. Use the filter.')); break; }
          const r = el('div', 'flex items-center justify-between px-2 py-1 border-b border-slate-800');
          const nm = el('button', 'text-xs text-left truncate flex-1 ' + (known.size && !known.has(s.toUpperCase()) ? 'text-amber-300' : 'text-slate-200'), s); nm.type = 'button';
          nm.title = known.size && !known.has(s.toUpperCase()) ? 'Not in the database' : 'Open on the chart';
          nm.onclick = () => { if (!isActive()) { toast('Open this database first (button at the top).'); return; } if (host.openSymbol && known.has(s.toUpperCase())) { host.openSymbol(s); toast(`Opened ${s}`); } };
          const star = el('button', 'px-2 text-sm ' + (st.isFavorite(s) ? 'text-amber-400' : 'text-slate-600'), '★'); star.type = 'button';
          star.onclick = () => { st.toggleFavorite(s); drawRight(); };
          r.appendChild(nm); r.appendChild(star);
          if (t.kind !== 'all' && state.name !== UNASSIGNED) { const x = el('button', 'px-2 text-slate-500', '✕'); x.type = 'button'; x.title = 'Remove from this list'; x.onclick = () => { st.removeSymbols(state.type, state.name, [s]); render(); }; r.appendChild(x); }
          list.appendChild(r);
        }
        if (!n) list.appendChild(el('div', 'px-2 py-3 text-[11px] text-slate-500', members.length ? 'No match.' : (state.name === UNASSIGNED ? 'Every symbol has a category.' : 'Empty. Add symbols below or import a file.')));
      };
      q.oninput = () => { state.filter = q.value; draw(); }; draw();
      right.appendChild(q); right.appendChild(list);
      if (t.kind !== 'all' && state.name !== UNASSIGNED) {
        const row = el('div', 'flex space-x-1');
        const inp = el('input', INPUT + ' flex-1 min-w-0 uppercase'); inp.placeholder = 'Type symbols: TCS, INFY'; inp.autocomplete = 'off'; inp.setAttribute('list', 'cat-dl');
        const dl = el('datalist'); dl.id = 'cat-dl'; all.slice(0, 3000).forEach((s) => { const o = document.createElement('option'); o.value = s; dl.appendChild(o); });
        const go = el('button', BTN_PRIMARY + ' !px-3', 'Add'); go.type = 'button';
        go.onclick = () => { const syms = parseSymbolText(inp.value, all).symbols; if (!syms.length) return; const n = st.addSymbols(state.type, state.name, syms); toast(`${n} added`); render(); };
        inp.onkeydown = (e) => { if (e.key === 'Enter') go.click(); };
        row.appendChild(inp); row.appendChild(go); right.appendChild(row); right.appendChild(dl);
        const act = el('div', 'flex flex-wrap gap-1');
        const mk = (label, fn, cls = BTN) => { const x = el('button', cls + ' !px-2 !py-1', label); x.type = 'button'; x.onclick = fn; act.appendChild(x); };
        mk('Pick from database…', () => openBulkAdd(`Add to ${state.name}`, members, (syms) => { toast(`${st.addSymbols(state.type, state.name, syms)} added`); render(); }));
        mk('Paste a list…', () => openModal(`Paste symbols into ${state.name}`, (pb, pclose) => {   // for phones: copy the list anywhere, paste it here
          pb.appendChild(el('div', 'text-[11px] text-slate-400', 'Paste symbols separated by commas, spaces or new lines. TradingView lists (NSE:TCS), RELIANCE.NS, a CSV with a Symbol column, all work.'));
          const ta = el('textarea', INPUT + ' w-full h-40'); ta.placeholder = 'RELIANCE, TCS, INFY ...'; pb.appendChild(ta);
          const go = el('button', BTN_PRIMARY + ' w-full', 'Add to list'); go.type = 'button';
          go.onclick = () => { const r = st.importInto(state.type, state.name, ta.value, all); if (!r.total) { toast('No symbols found in the pasted text.'); return; } pclose.force(); toast(`${r.added} added to "${state.name}" (${r.total - r.added} already there)${r.unknown.length ? `, ${r.unknown.length} not in database (${r.unknown.slice(0, 6).join(', ')}${r.unknown.length > 6 ? ' …' : ''})` : ''}`); render(); };
          pb.appendChild(go);
        }, { stack: true }));
        mk('Import TXT / TLS file…', async () => {   // works for every list: Favorites, watchlists, groups, sectors ...
          const f = await pickFile('.txt,.tls,.csv,.lst,text/plain'); if (!f) return;
          const r = st.importInto(state.type, state.name, f.text, all);
          toast(r.total ? `${r.added} added to "${state.name}" (${r.total - r.added} already there)${r.unknown.length ? `, ${r.unknown.length} not in database (${r.unknown.slice(0, 6).join(', ')}${r.unknown.length > 6 ? ' …' : ''})` : ''}` : 'No symbols found in that file'); render();
        });
        if (t.kind === 'free' || t.kind === 'fav') mk('Clear', () => { if (members.length && confirm(`Remove all ${members.length} symbols from "${state.name}"?`)) { st.clear(state.type, state.name, all); render(); } }, BTN_DANGER);
        else mk('Unassign all', () => { if (members.length && confirm(`Move all ${members.length} symbols out of "${state.name}"?`)) { st.clear(state.type, state.name, all); render(); } }, BTN_DANGER);
        right.appendChild(act);
      } else if (state.name === UNASSIGNED) right.appendChild(el('div', 'text-[10px] text-slate-500', 'Symbols with no category yet. Pick a category on the left and use "Pick from database…" to move symbols into it.'));
      const ex = el('div', 'flex flex-wrap gap-1');
      const mkx = (label, fn) => { const x = el('button', BTN + ' !px-2 !py-1', label); x.type = 'button'; x.onclick = fn; ex.appendChild(x); };
      const fname = state.name.replace(/[^\w\- ]+/g, '').trim() || 'list';
      mkx('Export .txt', () => download(`${fname}.txt`, st.exportTxt(state.type, state.name, all)));
      mkx('Export .tls', () => download(`${fname}.tls`, st.exportTls(state.type, state.name, all)));
      mkx('Copy', async () => { try { await navigator.clipboard.writeText(members.join(', ')); toast('Copied'); } catch (e) { toast('Copy not allowed here'); } });
      if (opts.onPick && isActive()) mkx('Use this list ▶', () => { opts.onPick(`${state.type}|${state.name}`); close.force(); });
      right.appendChild(ex);
      const cats = el('div', 'text-[10px] text-slate-500'); right.appendChild(cats);
    };

    const render = () => { ensureName(); drawDb(); drawChips(); help.textContent = T().help; drawLeft(); drawRight(); };

    // footer: whole-database tools
    const fbtn = (label, fn, cls = BTN) => { const x = el('button', cls + ' !px-2 !py-1', label); x.type = 'button'; x.onclick = fn; foot.appendChild(x); };
    fbtn('Import classification CSV…', async () => {
      const f = await pickFile('.csv,.txt'); if (!f) return; const r = st.importClassification(f.text, allSymbols());
      if (r.error) toast(r.error); else { toast(`${r.rows} rows, ${r.assigned} assignments, ${r.created} new categories`); render(); }
    });
    fbtn('Import NSE index files…', async () => {
      if (!confirm('Pick the constituent CSV files you downloaded from niftyindices.com (for example ind_nifty50list.csv, ind_nifty500list.csv, ind_niftybanklist.csv). You can select many at once.\n\nEach file becomes a Group and an Index of that name; the Industry column becomes the Sector; sectoral indices (NIFTY BANK, NIFTY IT ...) also become an Industry.')) return;
      const files = await pickFiles('.csv,.txt'); if (!files.length) return;
      const all2 = allSymbols(); let tot = 0, miss = [], bad = [];
      for (const f of files) { const r = st.importNseIndex(f.text, f.name, all2); if (r.error) bad.push(r.error); else { tot++; r.unknown.forEach((u) => miss.push(u)); } }
      toast(`${tot} of ${files.length} files imported${miss.length ? `. ${miss.length} symbols not in database (${[...new Set(miss)].slice(0, 6).join(', ')}${miss.length > 6 ? ' …' : ''})` : ''}${bad.length ? '. ' + bad[0] : ''}`, 8000); state.type = 'groups'; state.name = null; render();
    });
    fbtn('Import classification from link…', async () => {   // e.g. the nse-categories.csv your GitHub Action wrote (raw.githubusercontent.com link)
      const u = (prompt('Link to the classification CSV (for example the raw link of nse-categories.csv in your GitHub repo):') || '').trim(); if (!u) return;
      try { const r0 = await fetch(u, { cache: 'no-store' }); if (!r0.ok) throw new Error('HTTP ' + r0.status); const r = st.importClassification(await r0.text(), allSymbols());
        if (r.error) toast(r.error); else { toast(`${r.rows} rows, ${r.assigned} assignments, ${r.created} new categories`, 6000); state.type = 'groups'; state.name = null; render(); } }
      catch (e) { toast('Could not load the link: ' + e.message); }
    });
    fbtn('Export everything (CSV)', () => download('symbol-categories.csv', st.exportCsv(allSymbols()), 'text/csv'));
    fbtn('Backup (JSON)', () => download('categories-backup.json', st.exportJson(), 'application/json'));
    fbtn('Restore backup…', async () => { const f = await pickFile('.json'); if (!f) return; try { st.importJson(f.text); toast('Restored'); render(); } catch (e) { toast('Not a valid backup: ' + e.message); } });
    fbtn('Reset to AmiBroker defaults', () => { if (confirm('Replace ALL categories, watchlists and favorites with the AmiBroker defaults? This cannot be undone.')) { st.resetDefaults(); state.name = null; render(); } }, BTN_DANGER);
    render();
    if (!isActive()) host.symbolsOf(state.db).then((list) => { CUR = list; render(); }).catch(() => {});
  }, { big: true, stack: true, onClose: () => { CUR = null; } });
}

/** A ★ button in the symbol bar that adds / removes the current symbol from Favorites. */
export function initFavoriteStar() {
  const inp = document.getElementById('symbol-input'), bar = inp && inp.parentNode; if (!bar || document.getElementById('btn-fav')) return;
  const st = categoryStore();
  const b = el('button', 'px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[13px] leading-none', '★'); b.type = 'button'; b.id = 'btn-fav'; b.title = 'Add / remove from Favorites';
  const paint = () => { const on = st.isFavorite(host.symbol() || ''); b.className = 'hidden min-[360px]:block px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[13px] leading-none ' + (on ? 'text-amber-400' : 'text-slate-500'); };
  b.onclick = () => { const s = host.symbol(); if (!s) return; toast(st.toggleFavorite(s) ? `${s} added to Favorites` : `${s} removed from Favorites`); paint(); };
  bar.parentNode.insertBefore(b, bar); paint();   // between the time frame and the symbol search
  st.onChange(paint); setInterval(paint, 1500);
}
