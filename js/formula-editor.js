// Formula Editor: write / open / edit / save AFL formulas, check them against the chart on screen,
// and put them on the chart. Opened from Tools > Formula Editor, from the library, or from a pane.
import { el, openModal, toast, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';
import { aflEngine } from './afl-engine.js';
import { formulaStore } from './formula-store.js';
import { AFL_REFERENCE, AFL_EXAMPLE } from './afl-reference.js';
import { host } from './host.js';

const NEW_TEMPLATE = `// My formula
_SECTION_BEGIN("My formula");
Plot(Close, "Price", colorDefault, styleCandle);
Plot(EMA(Close, 20), "EMA 20", colorOrange, styleThick);
_SECTION_END();
`;

const count = (a) => (a ? a.reduce((s, v) => s + (v && !Number.isNaN(v) ? 1 : 0), 0) : 0);
const lastOf = (a) => { for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return a[i]; return NaN; };

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * opts: { formulaId, code, name, fromPane }
 *  formulaId  open this saved / built-in formula
 *  code,name  open an unsaved draft (used by the AI assistant)
 *  fromPane   opened from a chart pane: saving redraws that chart, extra "Save & show chart" button
 */
export function openFormulaEditor(opts = {}) {
  let cur = { id: null, builtin: false };
  let saved = '';           // text as last saved/opened, to know if there are unsaved changes
  let ta, nameIn, status, closeFn;
  let result = null;

  const dirty = () => ta && ta.value !== saved;
  const confirmDiscard = () => !dirty() || window.confirm('You have unsaved changes in the editor. Discard them?');

  openModal('Formula Editor', (body, close) => {
    closeFn = close;

    // --- name + save
    const top = el('div', 'flex items-center space-x-2 shrink-0');
    nameIn = el('input', INPUT + ' flex-1 min-w-0');
    nameIn.type = 'text'; nameIn.placeholder = 'Formula name'; nameIn.maxLength = 60;
    const saveBtn = el('button', BTN_PRIMARY, 'Save');
    saveBtn.type = 'button';
    top.appendChild(nameIn); top.appendChild(saveBtn);
    body.appendChild(top);

    // --- toolbar
    const bar = el('div', 'flex flex-wrap gap-1 shrink-0');
    const mk = (label, fn, cls = BTN) => { const b = el('button', cls + ' !px-2 !py-1.5', label); b.type = 'button'; b.onclick = fn; bar.appendChild(b); return b; };
    mk('New', () => { if (confirmDiscard()) load({ name: 'My formula', code: NEW_TEMPLATE }); });
    mk('Open…', async () => {
      const { openLibrary } = await import('./formula-library.js');
      openLibrary({ mode: 'open', onPick: (f) => { if (confirmDiscard()) load(f); } });
    });
    mk('Save as…', () => doSave({ asNew: true }));
    const delBtn = mk('Delete', () => doDelete(), BTN_DANGER + ' !px-2 !py-1.5');
    mk('Import', () => fileIn.click());
    mk('Export', () => {
      const n = (nameIn.value.trim() || 'formula').replace(/[^\w\- ]+/g, '_');
      download(`${n}.afl`, ta.value);
    });
    mk('✨ AI', async () => {
      const { openAIAssistant } = await import('./ai-assistant.js');
      openAIAssistant({ onCode: (code, name) => { if (confirmDiscard()) load({ name, code }, true); } });
    });
    mk('Help', () => openHelp());
    body.appendChild(bar);

    const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.afl,.txt,.json,text/plain,application/json'; fileIn.className = 'hidden';
    fileIn.onchange = async () => {
      const file = fileIn.files && fileIn.files[0]; fileIn.value = '';
      if (!file) return;
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        try { const n = formulaStore.importJSON(text); toast(`Imported ${n} formula${n === 1 ? '' : 's'}`); host.relayout(); }
        catch (e) { showMessage('error', ['Could not import: ' + e.message]); }
        return;
      }
      if (confirmDiscard()) load({ name: file.name.replace(/\.[^.]+$/, ''), code: text });
    };
    body.appendChild(fileIn);

    // --- code box
    ta = el('textarea', INPUT + ' flex-1 min-h-[140px] w-full font-mono text-[12px] leading-5 resize-none');
    ta.spellcheck = false; ta.autocapitalize = 'off'; ta.autocomplete = 'off'; ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('wrap', 'off'); ta.style.whiteSpace = 'pre'; ta.style.overflow = 'auto'; ta.style.tabSize = '2';
    ta.onkeydown = (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doCheck(); }
    };
    ta.oninput = () => refreshTitle();
    body.appendChild(ta);

    // --- messages
    status = el('div', 'shrink-0 max-h-32 overflow-y-auto text-[11px] rounded border border-slate-800 bg-slate-950 p-2 hidden');
    body.appendChild(status);

    // --- actions
    const act = el('div', 'flex flex-wrap gap-2 shrink-0');
    const mka = (label, fn, cls = BTN) => { const b = el('button', cls + ' flex-1 whitespace-nowrap', label); b.type = 'button'; b.onclick = fn; act.appendChild(b); return b; };
    mka('Check', () => doCheck());
    if (opts.fromPane) mka('Save & show chart', () => { if (doSave()) close.force(); }, BTN_PRIMARY);
    else {
      mka('Add to chart', () => addToChart(false), BTN_PRIMARY);
      mka('New sheet', () => addToChart(true));
    }
    body.appendChild(act);

    saveBtn.onclick = () => doSave();
    ta._del = delBtn;

    // --- start
    if (opts.formulaId && formulaStore.get(opts.formulaId)) load(formulaStore.get(opts.formulaId));
    else load({ name: opts.name || 'My formula', code: opts.code != null ? opts.code : NEW_TEMPLATE }, opts.code != null);
    setTimeout(() => ta.focus({ preventScroll: true }), 50);
  }, { stack: true, wide: true, beforeClose: () => confirmDiscard() });

  // ---------------------------------------------------------------- behaviour
  function refreshTitle() {
    if (ta && ta._del) { ta._del.disabled = !(cur.id && !cur.builtin); ta._del.classList.toggle('opacity-40', ta._del.disabled); }
  }

  function load(f, asDraft = false) {
    const isStored = !!f.id && !!formulaStore.get(f.id);
    cur = { id: isStored ? f.id : null, builtin: isStored && formulaStore.isBuiltin(f.id) };
    nameIn.value = f.name || '';
    ta.value = f.code || '';
    saved = asDraft ? '' : ta.value;      // an AI draft counts as unsaved until you save it
    showMessage(null);
    result = null;
    if (cur.builtin) showMessage('info', ['This is a built-in formula. You can change it freely; Save will store your own copy.']);
    refreshTitle();
  }

  function showMessage(kind, lines = [], extraNode = null) {
    if (!kind) { status.classList.add('hidden'); status.innerHTML = ''; return; }
    status.classList.remove('hidden');
    status.innerHTML = '';
    const color = kind === 'error' ? 'text-red-300' : kind === 'ok' ? 'text-emerald-300' : 'text-slate-300';
    lines.forEach((l) => status.appendChild(el('div', color, l)));
    if (extraNode) status.appendChild(extraNode);
  }

  function doSave({ asNew = false } = {}) {
    let name = nameIn.value.trim();
    if (!name) { showMessage('error', ['Type a name for the formula first.']); nameIn.focus(); return false; }
    if (asNew) {
      const p = window.prompt('Save as (new formula name)', name);
      if (p === null) return false;
      name = p.trim() || name;
    }
    if (!asNew && cur.builtin) {
      const b = formulaStore.get(cur.id);
      if (b && b.name.toLowerCase() === name.toLowerCase()) name = `${name} (mine)`;
    }
    try {
      const orig = !asNew && !cur.builtin ? cur.id : undefined;
      const prev = cur.id && formulaStore.get(cur.id);
      const f = formulaStore.save({ id: orig, name, code: ta.value, description: (prev && prev.description) || '', kind: guessKind(ta.value), weight: prev && prev.weight });
      cur = { id: f.id, builtin: false };
      nameIn.value = f.name; saved = ta.value;
      showMessage('ok', [`Saved "${f.name}".`]);
      refreshTitle();
      host.relayout();
      return true;
    } catch (e) {
      showMessage('error', [e.message]);
      return false;
    }
  }

  function guessKind(code) {
    if (/\bfilter\s*=/i.test(code) && !/\bplot\s*\(/i.test(code)) return 'exploration';
    if (/\bbuy\s*=/i.test(code)) return 'system';
    return 'chart';
  }

  function doDelete() {
    if (!cur.id || cur.builtin) return;
    const f = formulaStore.get(cur.id);
    if (!window.confirm(`Delete "${f.name}"? Panes that use it will show a warning.`)) return;
    formulaStore.remove(cur.id);
    host.relayout();
    toast('Formula deleted');
    load({ name: 'My formula', code: NEW_TEMPLATE });
  }

  function doCheck() {
    const bars = host.getBars();
    if (!bars || !bars.t || !bars.t.length) { showMessage('error', ['Load a chart first, then check the formula against it.']); return null; }
    const res = aflEngine.run(ta.value, bars, { symbol: host.symbol() });
    result = res;
    if (res.errors.length) {
      const goto = res.errorLine > 0 ? el('button', 'mt-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200', `Go to line ${res.errorLine}`) : null;
      if (goto) { goto.type = 'button'; goto.onclick = () => jumpToLine(res.errorLine); jumpToLine(res.errorLine, false); }
      showMessage('error', res.errors, goto);
      return res;
    }
    const lines = [`✓ Formula is valid for ${host.symbol()} (${bars.t.length} bars).`];
    if (res.plots.length) lines.push(`Draws ${res.plots.length} plot${res.plots.length === 1 ? '' : 's'}: ` + res.plots.map((p) => `${p.name || '(unnamed)'}=${fmt(lastOf(p.data))}`).join(', '));
    if (res.shapes.length) lines.push(`${res.shapes.length} arrow/shape series (${res.shapes.reduce((s, x) => s + count(x.shapes), 0)} marks).`);
    if (res.usesSignals) lines.push(`Signals: Buy ${count(res.buy)}, Sell ${count(res.sell)}${res.short ? `, Short ${count(res.short)}` : ''}${res.cover ? `, Cover ${count(res.cover)}` : ''}.`);
    if (res.filter) lines.push(`Scan filter true on ${count(res.filter)} bar(s); ${res.columns.length} column(s).`);
    if (res.params.length) lines.push(`Parameters: ${res.params.map((p) => p.name).join(', ')} (change them from the pane's ⋯ menu).`);
    if (!res.plots.length && !res.shapes.length) lines.push('Nothing to draw: fine for a Scanner / Exploration formula.');
    showMessage('ok', lines);
    return res;
  }
  const fmt = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(2)) : '-');

  function jumpToLine(n, focus = true) {
    const lines = ta.value.split('\n');
    let start = 0;
    for (let i = 0; i < n - 1 && i < lines.length; i++) start += lines[i].length + 1;
    const end = start + (lines[n - 1] || '').length;
    if (focus) ta.focus();
    ta.setSelectionRange(start, end);
    const lh = 20; ta.scrollTop = Math.max(0, (n - 3) * lh);
  }

  function addToChart(newSheet) {
    const res = doCheck();
    if (res && res.errors.length) return;                         // fix it first
    if (!cur.id || cur.builtin || dirty()) { if (!doSave()) return; }
    if (newSheet) host.newFormulaSheet(cur.id); else host.addFormulaPane(cur.id);
    closeFn.force();
  }

  function openHelp() {
    openModal('AFL quick reference', (b) => {
      const ins = el('button', BTN + ' w-full', 'Insert the example into the editor');
      ins.type = 'button';
      ins.onclick = () => { ta.value = AFL_EXAMPLE + '\n'; nameIn.value = nameIn.value || 'EMA crossover'; refreshTitle(); };
      b.appendChild(ins);
      const pre = el('pre', 'text-[10.5px] leading-4 text-slate-300 whitespace-pre-wrap break-words');
      pre.textContent = AFL_REFERENCE.trim();
      b.appendChild(pre);
    }, { stack: true });
  }
}
