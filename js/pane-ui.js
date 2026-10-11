// Screens for adding panes and editing a pane's moving averages.
import { PANE_KINDS, OVERLAY_COLORS, OVERLAY_TYPES, paneTitle, overlayTitle } from './workspace.js';
import { SOURCES } from './indicators.js';
import { el, openModal, colorPicker, labeled, select, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';
import { formulaStore } from './formula-store.js';
import { chartEngine } from './chart-engine.js';
import { renderParamControls } from './params-ui.js';

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
    add.onclick = () => { ws.addPane(sheet.id, 'afl', { formulaId: sel.value }); close(); onChange(); };
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
    // ---- a pane that shows an AFL formula: parameters, edit, move, remove
    function drawFormulaPane(body, close, redraw) {
      const info = chartEngine.paneInfo.get(pane.id) || { errors: [], params: [], notes: [] };
      const formula = formulaStore.get(pane.params.formulaId);

      if (info.errors.length) {
        const box = el('div', 'p-2 rounded border border-red-800 bg-red-950/40 text-[11px] text-red-200 space-y-1');
        box.appendChild(el('div', 'font-semibold', 'This formula has a problem'));
        info.errors.forEach((e) => box.appendChild(el('div', '', e)));
        body.appendChild(box);
      } else if (info.notes.length) {
        body.appendChild(el('div', 'p-2 rounded border border-amber-800 bg-amber-950/30 text-[11px] text-amber-200', info.notes.join(' ')));
      }

      // settings made by Param / ParamColor / ParamStr / ParamTime / ParamDate ... in the formula
      body.appendChild(el('div', 'text-[11px] text-slate-400', 'Parameters (change a value and the chart updates)'));
      const values = { ...(pane.params.values || {}) };
      const commit = () => { ws.setPaneParamValues(sheet.id, pane.id, values); onChange(); };
      const fire = (name) => { chartEngine.triggers = { [pane.id]: { [name]: 1 } }; onChange(); };
      const shown = renderParamControls(body, info.params, values, commit, fire);
      if (!shown) body.appendChild(el('div', 'text-xs text-slate-500', 'This formula has no parameters. Add Param("Name", default, min, max, step) in the formula editor to create one.'));
      else {
        const reset = el('button', BTN + ' w-full', 'Reset parameters to defaults');
        reset.type = 'button';
        reset.onclick = () => { ws.setPaneParamValues(sheet.id, pane.id, {}); onChange(); redraw(); };
        body.appendChild(reset);
      }

      // edit the formula itself
      const edit = el('button', BTN_PRIMARY + ' w-full', formula && formula.builtin ? 'View / edit formula (saves as your copy)' : 'Edit formula');
      edit.type = 'button';
      edit.onclick = async () => {
        const { openFormulaEditor } = await import('./formula-editor.js');
        close();
        openFormulaEditor({ formulaId: pane.params.formulaId, fromPane: true });
      };
      body.appendChild(edit);

      // move / remove
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
