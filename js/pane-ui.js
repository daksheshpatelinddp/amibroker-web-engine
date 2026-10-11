// Screens for adding panes and editing a pane's moving averages.
import { PANE_KINDS, OVERLAY_COLORS, OVERLAY_TYPES, paneTitle, overlayTitle } from './workspace.js';
import { SOURCES } from './indicators.js';
import { el, openModal, colorPicker, labeled, select, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';
import { formulaStore } from './formula-store.js';
import { chartEngine } from './chart-engine.js';
import { hexToColor, colorToHex } from './afl-engine.js';

/** "+ Pane": choose what the new pane shows. */
export function openAddPane(ws, sheet, onChange) {
  openModal('Add pane', (body, close) => {
    body.appendChild(el('div', 'text-[11px] text-slate-400', 'Choose what the new pane should show. You can add moving averages to it afterwards.'));

    const kind = select(PANE_KINDS, 'volume');
    body.appendChild(labeled('Pane type', kind));

    const extra = el('div', 'space-y-3');
    body.appendChild(extra);
    const period = el('input', INPUT + ' w-full');
    period.type = 'number'; period.min = '2'; period.max = '500';
    const source = select(SOURCES, 'close');
    const transform = select({ none: 'Raw values', sma: 'Simple average (SMA)', ema: 'Exponential average (EMA)', rsi: 'RSI', roc: 'Rate of change %' }, 'none');

    const formulaOptions = {};
    formulaStore.all().filter((f) => f.kind !== 'exploration').forEach((f) => { formulaOptions[f.id] = f.builtin ? f.name : `★ ${f.name}`; });
    const formulaSel = select(formulaOptions, 'b:rsi');

    const drawExtra = () => {
      extra.innerHTML = '';
      if (kind.value === 'afl') {
        extra.appendChild(labeled('Formula (★ = yours). Write or generate more from the Tools menu.', formulaSel));
      }
      if (kind.value === 'rsi') { period.value = '14'; extra.appendChild(labeled('RSI period', period)); }
      if (kind.value === 'custom') {
        period.value = '20';
        extra.appendChild(labeled('Data', source));
        extra.appendChild(labeled('Calculation', transform));
        extra.appendChild(labeled('Period (used by SMA / EMA / RSI / rate of change)', period));
      }
    };
    kind.onchange = drawExtra;
    drawExtra();

    const add = el('button', BTN_PRIMARY + ' w-full', 'Add pane');
    add.type = 'button';
    add.onclick = () => {
      ws.addPane(sheet.id, kind.value, { period: period.value, source: source.value, transform: transform.value, formulaId: formulaSel.value });
      close();
      onChange();
    };
    body.appendChild(add);
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

      // settings made by Param(...) in the formula
      body.appendChild(el('div', 'text-[11px] text-slate-400', 'Settings'));
      const values = { ...(pane.params.values || {}) };
      const commit = () => { ws.setPaneParamValues(sheet.id, pane.id, values); onChange(); redraw(); };
      if (!info.params.length) body.appendChild(el('div', 'text-xs text-slate-500', 'This formula has no settings.'));
      const seen = new Set();
      for (const prm of info.params) {
        if (seen.has(prm.name)) continue; seen.add(prm.name);
        let control;
        const cur = values[prm.name];
        if (prm.type === 'number') {
          control = el('input', INPUT + ' w-full');
          control.type = 'number'; control.min = prm.min; control.max = prm.max; control.step = prm.step || 'any';
          control.value = cur !== undefined ? cur : prm.def;
          control.onchange = () => {
            const v = Number(control.value);
            if (Number.isFinite(v)) values[prm.name] = Math.min(prm.max, Math.max(prm.min, v)); commit();
          };
        } else if (prm.type === 'list' || prm.type === 'text') {
          const opts = {}; prm.items.forEach((it, i) => { opts[prm.type === 'list' ? i : it] = it; });
          control = select(opts, cur !== undefined ? cur : prm.def);
          control.onchange = () => { values[prm.name] = prm.type === 'list' ? Number(control.value) : control.value; commit(); };
        } else if (prm.type === 'color') {
          control = el('input', 'w-full h-9 bg-slate-800 border border-slate-700 rounded');
          control.type = 'color';
          control.value = colorToHex(cur !== undefined ? cur : prm.def) || '#ffffff';
          control.onchange = () => { values[prm.name] = hexToColor(control.value); commit(); };
        }
        if (control) body.appendChild(labeled(prm.name, control));
      }
      if (info.params.length) {
        const reset = el('button', BTN + ' w-full', 'Reset settings to defaults');
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
