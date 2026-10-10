// Screens for adding panes and editing a pane's moving averages.
import { PANE_KINDS, OVERLAY_COLORS, OVERLAY_TYPES, paneTitle, overlayTitle } from './workspace.js';
import { SOURCES } from './indicators.js';
import { el, openModal, colorPicker, labeled, select, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';

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

    const drawExtra = () => {
      extra.innerHTML = '';
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
      ws.addPane(sheet.id, kind.value, { period: period.value, source: source.value, transform: transform.value });
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
    draw();
  });
}
