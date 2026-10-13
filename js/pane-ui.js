// Screens for adding panes and editing a pane's moving averages.
import { PANE_KINDS, OVERLAY_COLORS, OVERLAY_TYPES, paneTitle, overlayTitle } from './workspace.js';
import { SOURCES } from './indicators.js';
import { el, openModal, colorPicker, labeled, select, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';
import { formulaStore } from './formula-store.js';
import { chartEngine } from './chart-engine.js';
import { renderParamControls } from './params-ui.js';
import { aflEngine } from './afl-engine.js';
import { host } from './host.js';

/** "+ Pane": choose a formula (built-in or your own) for the new pane. */
export function openAddPane(ws, sheet, onChange) {
  openModal('Add pane', (body, close) => {
    body.appendChild(el('div', 'text-[11px] text-slate-400', 'Choose what the new pane should show. Every formula has parameters you can change afterwards (tap the pane title). Write your own from Tools > Formula Editor.'));

    const sel = el('select', INPUT + ' w-full');
    const addGroup = (label, list) => {
      if (!list.length) return;
      const g = document.createElement('optgroup'); g.label = label;
      list.forEach((f) => { const o = el('option', '', f.name); o.value = f.id; g.appendChild(o); });
      sel.appendChild(g);
    };
    const usable = formulaStore.all().filter((f) => f.kind !== 'exploration');
    addGroup('My formulas', usable.filter((f) => !f.builtin));
    for (const cat of formulaStore.categories()) addGroup(cat, usable.filter((f) => f.builtin && f.category === cat));
    sel.value = 'b:rsi';
    body.appendChild(labeled('Formula', sel));
    const desc = el('div', 'text-[11px] text-slate-500');
    const showDesc = () => { const f = formulaStore.get(sel.value); desc.textContent = f ? (f.description || '') : ''; };
    sel.onchange = showDesc; showDesc();
    body.appendChild(desc);

    const add = el('button', BTN_PRIMARY + ' w-full', 'Add pane');
    add.type = 'button';
    add.onclick = () => { placeFormula(sel.value); close(); onChange(); };
    body.appendChild(add);

    const more = el('div', 'flex gap-2 pt-1');
    const lib = el('button', BTN + ' flex-1', 'Formula Library…'); lib.type = 'button';
    lib.onclick = async () => { close(); (await import('./formula-library.js')).openLibrary({ mode: 'manage' }); };
    const edt = el('button', BTN + ' flex-1', 'New formula…'); edt.type = 'button';
    edt.onclick = async () => { close(); (await import('./formula-editor.js')).openFormulaEditor(); };
    more.appendChild(lib); more.appendChild(edt);
    body.appendChild(more);
  });
}

/** Tap on a pane title: edit its moving averages, move it, remove it. */
export function openPaneEditor(ws, sheet, paneId, onChange) {
  const pane = ws.getPane(sheet.id, paneId);
  if (!pane) return;

  openModal(paneTitle(pane), (body, close) => {
    const draw = () => {
      body.innerHTML = '';
      if (pane.kind === 'afl') { drawFormulaPane(body, close, draw); return; }

      // current moving averages
      body.appendChild(el('div', 'text-[11px] text-slate-400', 'Moving averages on this pane'));
      const list = el('div', 'flex flex-wrap gap-2');
      if (pane.overlays.length === 0) list.appendChild(el('div', 'text-xs text-slate-500', 'None yet'));
      pane.overlays.forEach((o) => {
        const chip = el('div', 'flex items-center space-x-2 px-2 py-1 rounded-full bg-slate-800 border border-slate-700');
        const dot = el('span', 'w-3 h-3 rounded-full inline-block');
        dot.style.backgroundColor = o.color;
        chip.appendChild(dot);
        chip.appendChild(el('span', 'text-xs text-slate-100', overlayTitle(o)));
        const rm = el('button', 'text-slate-400 px-1', '✕');
        rm.type = 'button';
        rm.onclick = () => { ws.removeOverlay(sheet.id, pane.id, o.id); onChange(); draw(); };
        chip.appendChild(rm);
        list.appendChild(chip);
      });
      body.appendChild(list);

      // add one
      const box = el('div', 'p-2 rounded border border-slate-800 space-y-2');
      box.appendChild(el('div', 'text-[11px] text-slate-400', 'Add a moving average'));
      const row = el('div', 'grid grid-cols-2 gap-2');
      const type = select(OVERLAY_TYPES, 'sma');
      const period = el('input', INPUT + ' w-full');
      period.type = 'number'; period.min = '2'; period.max = '500'; period.value = '20';
      row.appendChild(labeled('Type', type));
      row.appendChild(labeled('Period', period));
      box.appendChild(row);
      let color = OVERLAY_COLORS[pane.overlays.length % OVERLAY_COLORS.length];
      box.appendChild(colorPicker(OVERLAY_COLORS, color, (c) => { color = c; }));
      const add = el('button', BTN_PRIMARY + ' w-full', 'Add to this pane');
      add.type = 'button';
      add.onclick = () => { ws.addOverlay(sheet.id, pane.id, { type: type.value, period: period.value, color }); onChange(); draw(); };
      box.appendChild(add);
      body.appendChild(box);

      // pane actions
      const actions = el('div', 'grid grid-cols-3 gap-2');
      const up = el('button', BTN, '↑ Move up');
      const down = el('button', BTN, '↓ Move down');
      const rem = el('button', BTN_DANGER, 'Remove pane');
      [up, down, rem].forEach(b => (b.type = 'button'));
      const idx = sheet.panes.findIndex(p => p.id === pane.id);
      up.disabled = idx <= 0; down.disabled = idx >= sheet.panes.length - 1; rem.disabled = sheet.panes.length <= 1;
      [up, down, rem].forEach(b => { if (b.disabled) b.classList.add('opacity-40'); });
      up.onclick = () => { if (ws.movePane(sheet.id, pane.id, -1)) { onChange(); close(); } };
      down.onclick = () => { if (ws.movePane(sheet.id, pane.id, 1)) { onChange(); close(); } };
      rem.onclick = () => { if (ws.removePane(sheet.id, pane.id)) { onChange(); close(); } };
      actions.appendChild(up); actions.appendChild(down); actions.appendChild(rem);
      body.appendChild(actions);
      if (sheet.panes.length <= 1) body.appendChild(el('div', 'text-[11px] text-slate-500', 'A sheet always keeps at least one pane.'));
    };
    // ---- a pane that shows AFL formulas: parameters of each, insert more, edit, move, remove
    function drawFormulaPane(body, close, redraw) {
      const paneInfo = chartEngine.paneInfo.get(pane.id) || { errors: [], params: [], notes: [], layers: [] };
      if (paneInfo.errors.length) {
        const box = el('div', 'p-2 rounded border border-red-800 bg-red-950/40 text-[11px] text-red-200 space-y-1');
        box.appendChild(el('div', 'font-semibold', 'A formula in this pane has a problem'));
        paneInfo.errors.forEach((e) => box.appendChild(el('div', '', e)));
        body.appendChild(box);
      } else if (paneInfo.notes.length) {
        body.appendChild(el('div', 'p-2 rounded border border-amber-800 bg-amber-950/30 text-[11px] text-amber-200', paneInfo.notes.join(' ')));
      }

      const refs = [{ key: pane.id, ref: pane.params, primary: true }, ...(pane.params.layers || []).map((l) => ({ key: l.id, ref: l }))];
      refs.forEach(({ key, ref, primary }) => {
        const formula = formulaStore.get(ref.formulaId);
        const info = (primary ? paneInfo : chartEngine.paneInfo.get(key)) || { params: [], errors: [] };
        const card = el('div', 'rounded border border-slate-800 p-2 space-y-2');
        const head = el('div', 'flex items-center space-x-2');
        head.appendChild(el('div', 'text-xs font-semibold text-slate-100 flex-1 truncate', formula ? formula.name : 'Formula (missing)'));
        if (!primary) {
          const rm = el('button', BTN_DANGER + ' !px-2 !py-1', 'Remove'); rm.type = 'button';
          rm.onclick = () => { ws.removeLayer(sheet.id, pane.id, key); onChange(); redraw(); };
          head.appendChild(rm);
        } else if (refs.length > 1) head.appendChild(el('span', 'text-[10px] text-slate-500', 'main formula'));
        card.appendChild(head);

        const values = { ...(ref.values || {}) };
        const commit = () => { ws.setPaneParamValues(sheet.id, key, values); onChange(); };
        const fire = (k) => { chartEngine.triggers = { [key]: { [k]: 1 } }; onChange(); };
        const shown = renderParamControls(card, info.params || [], values, commit, fire);
        if (!shown) card.appendChild(el('div', 'text-[11px] text-slate-500', 'No parameters. Add Param("Name", default, min, max, step) in the formula to create one.'));
        const row = el('div', 'grid grid-cols-2 gap-2');
        if (shown) {
          const reset = el('button', BTN, 'Reset parameters'); reset.type = 'button';
          reset.onclick = () => { ws.setPaneParamValues(sheet.id, key, {}); onChange(); redraw(); };
          row.appendChild(reset);
        }
        const edit = el('button', BTN, formula && formula.builtin ? 'View / edit formula' : 'Edit formula'); edit.type = 'button';
        edit.onclick = async () => { const { openFormulaEditor } = await import('./formula-editor.js'); close(); openFormulaEditor({ formulaId: ref.formulaId, fromPane: true }); };
        row.appendChild(edit);
        if (formula && (formula.commentary || formula.text || /actionCommentary|EnableTextOutput/i.test(formula.code))) {
          const tx = el('button', BTN, 'Text output / Commentary'); tx.type = 'button';
          tx.onclick = () => showTextOutput(formula, ref);
          row.appendChild(tx);
        }
        card.appendChild(row);
        body.appendChild(card);
      });

      // Insert: put another formula (moving average, bands ...) into this pane
      const ins = el('button', BTN_PRIMARY + ' w-full', '＋ Insert another formula into this pane'); ins.type = 'button';
      ins.onclick = async () => {
        const { openLibrary } = await import('./formula-library.js');
        openLibrary({ mode: 'open', onPick: (f) => { ws.addLayer(sheet.id, pane.id, f.id); onChange(); close(); } });
      };
      body.appendChild(ins);

      const actions = el('div', 'grid grid-cols-3 gap-2');
      const up = el('button', BTN, '↑ Move up');
      const down = el('button', BTN, '↓ Move down');
      const rem = el('button', BTN_DANGER, 'Remove pane');
      [up, down, rem].forEach(b => (b.type = 'button'));
      const idx = sheet.panes.findIndex(p => p.id === pane.id);
      up.disabled = idx <= 0; down.disabled = idx >= sheet.panes.length - 1; rem.disabled = sheet.panes.length <= 1;
      [up, down, rem].forEach(b => { if (b.disabled) b.classList.add('opacity-40'); });
      up.onclick = () => { if (ws.movePane(sheet.id, pane.id, -1)) { onChange(); close(); } };
      down.onclick = () => { if (ws.movePane(sheet.id, pane.id, 1)) { onChange(); close(); } };
      rem.onclick = () => { if (ws.removePane(sheet.id, pane.id)) { onChange(); close(); } };
      actions.appendChild(up); actions.appendChild(down); actions.appendChild(rem);
      body.appendChild(actions);
    }
    draw();
  });
}

/** Runs a formula in Commentary mode (Status("action") == actionCommentary) and shows what printf() wrote. HTML output is rendered as HTML. */
export function showTextOutput(formula, ref) {
  const res = aflEngine.run(formula.code, chartEngine.arrays, {
    symbol: (chartEngine.sheet && chartEngine.sheet.symbol) || '', formulaName: formula.name, params: ref.values || {}, action: 2,
    interval: (chartEngine.sheet && chartEngine.sheet.interval) || 'D', foreign: chartEngine._foreignMap ? chartEngine._foreignMap() : {},
  });
  openModal(formula.name + ' - text output', (body) => {
    if (res.errors.length) body.appendChild(el('div', 'text-xs text-red-300', res.errors[0]));
    const box = el('div', 'text-xs text-slate-200 leading-5 overflow-auto');
    if (/^\s*</.test(res.text)) box.innerHTML = res.text.replace(/<script[\s\S]*?<\/script>/gi, '');
    else { box.style.whiteSpace = 'pre-wrap'; box.textContent = res.text || '(the formula wrote no text)'; }
    body.appendChild(box);
  }, { stack: true });
}

/**
 * Put a formula on the chart. Formulas marked overlay (moving averages, bands...) go into the price pane; everything else gets its own pane.
 * The caller can force a target: 'new' or an existing pane id.
 */
export function placeFormula(formulaId, target) {
  const ws = host.ws(), sheet = ws.active(), f = formulaStore.get(formulaId);
  if (!f) return;
  let t = target;
  if (!t) t = f.overlay ? (sheet.panes.find((p) => p.kind === 'afl') || {}).id || 'new' : 'new';
  if (t === 'new') ws.addPane(sheet.id, 'afl', { formulaId });
  else ws.addLayer(sheet.id, t, formulaId);
  host.relayout();
}

/** "Where should it go?" picker: a new pane, or inserted into one of the existing panes. */
export function openPlacePicker(formulaId, done = () => {}) {
  const ws = host.ws(), sheet = ws.active(), f = formulaStore.get(formulaId);
  openModal(`Add "${f ? f.name : ''}"`, (body, close) => {
    const go = (t) => { placeFormula(formulaId, t); close(); done(); };
    const nb = el('button', BTN_PRIMARY + ' w-full', '＋ New pane below'); nb.type = 'button'; nb.onclick = () => go('new'); body.appendChild(nb);
    body.appendChild(el('div', 'text-[11px] text-slate-400 pt-1', 'or insert it into an existing pane'));
    sheet.panes.filter((p) => p.kind === 'afl').forEach((p) => {
      const b = el('button', BTN + ' w-full text-left', paneTitle(p)); b.type = 'button'; b.onclick = () => go(p.id); body.appendChild(b);
    });
  }, { stack: true });
}
