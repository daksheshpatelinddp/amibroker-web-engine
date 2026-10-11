// The Parameters dialog controls (AmiBroker's Ctrl+R window): one control per Param / ParamColor / ParamStr /
// ParamTime / ParamDate / ParamToggle / ParamList in the formula. Changing a value redraws the chart at once.
import { el, labeled, select, BTN, INPUT } from './ui.js';
import { hexToColor, colorToHex } from './afl-engine.js';

/**
 * container   element to fill
 * params      res.params from the engine
 * values      current user values { name: value }   (changed in place)
 * commit()    called after every change so the caller can save + redraw
 */
export function renderParamControls(container, params, values, commit) {
  const seen = new Set();
  let shown = 0;
  for (const prm of params) {
    if (seen.has(prm.name)) continue;
    seen.add(prm.name); shown++;
    const cur = values[prm.name];
    let control;

    if (prm.type === 'number') {
      const min = Number.isFinite(prm.min) ? prm.min : 0, max = Number.isFinite(prm.max) ? prm.max : 100, step = prm.step > 0 ? prm.step : 1;
      const num = el('input', INPUT + ' w-24 shrink-0');
      num.type = 'number'; num.min = min; num.max = max; num.step = step; num.inputMode = 'decimal';
      num.value = cur !== undefined ? cur : prm.def;
      const range = el('input', 'flex-1 min-w-0 accent-sky-500');
      range.type = 'range'; range.min = min; range.max = max; range.step = step; range.value = num.value;
      const apply = (raw) => {
        let v = Number(raw);
        if (!Number.isFinite(v)) { num.value = cur !== undefined ? cur : prm.def; return; }
        v = Math.min(max, Math.max(min, v));
        values[prm.name] = v; num.value = v; range.value = v; commit();
      };
      num.onchange = () => apply(num.value);              // type a number, press Enter / leave the box
      range.oninput = () => { num.value = range.value; };   // slider moves the number live...
      range.onchange = () => apply(range.value);            // ...and redraws when released
      const row = el('div', 'flex items-center space-x-2');
      row.appendChild(num); row.appendChild(range);
      row.appendChild(el('span', 'text-[10px] text-slate-500 w-16 shrink-0 text-right', `${min}–${max}`));
      control = row;
    } else if (prm.type === 'list') {                      // ParamToggle: stored as the item number
      const opts = {}; prm.items.forEach((it, i) => { opts[i] = it; });
      control = select(opts, cur !== undefined ? cur : prm.def);
      control.onchange = () => { values[prm.name] = Number(control.value); commit(); };
    } else if (prm.type === 'text') {                      // ParamList: stored as the item text
      const opts = {}; prm.items.forEach((it) => { opts[it] = it; });
      control = select(opts, cur !== undefined ? cur : prm.def);
      control.onchange = () => { values[prm.name] = control.value; commit(); };
    } else if (prm.type === 'color') {
      control = el('input', 'w-full h-9 bg-slate-800 border border-slate-700 rounded');
      control.type = 'color';
      control.value = colorToHex(cur !== undefined ? cur : prm.def) || '#ffffff';
      control.onchange = () => { values[prm.name] = hexToColor(control.value); commit(); };
    } else if (prm.type === 'str') {
      control = el('input', INPUT + ' w-full');
      control.type = 'text'; control.value = cur !== undefined ? cur : prm.def;
      control.onchange = () => { values[prm.name] = control.value; commit(); };
    } else if (prm.type === 'time') {
      control = el('input', INPUT + ' w-full');
      control.type = 'time'; control.step = 1; control.value = cur !== undefined ? cur : prm.def;
      control.onchange = () => { if (control.value) { values[prm.name] = control.value; commit(); } };
    } else if (prm.type === 'date') {
      control = el('input', INPUT + ' w-full');
      control.type = 'date'; control.value = cur !== undefined ? cur : prm.def;
      control.onchange = () => { if (control.value) { values[prm.name] = control.value; commit(); } };
    }
    if (control) container.appendChild(labeled(prm.name, control));
  }
  return shown;
}
