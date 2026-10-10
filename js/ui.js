// Tiny helpers for building screens without a framework.

export function el(tag, className = '', text = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export const BTN = 'px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 text-xs active:bg-slate-700';
export const BTN_PRIMARY = 'px-3 py-2 rounded bg-sky-600 text-white text-xs font-semibold active:bg-sky-700';
export const BTN_DANGER = 'px-3 py-2 rounded bg-red-900/60 border border-red-700 text-red-200 text-xs active:bg-red-800';
export const INPUT = 'select-text bg-slate-800 border border-slate-700 text-slate-100 rounded px-2 py-2 text-xs outline-none focus:border-sky-500';

/** Opens a bottom-sheet style dialog. build(body, close) fills it. Returns close(). */
export function openModal(title, build) {
  const old = document.getElementById('modal-root');
  if (old) old.remove();

  const root = el('div', 'fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60');
  root.id = 'modal-root';
  const panel = el('div', 'w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-xl sm:rounded-xl p-3 max-h-[85vh] overflow-y-auto select-text');
  const head = el('div', 'flex items-center justify-between mb-3');
  head.appendChild(el('div', 'text-sm font-semibold text-slate-100', title));
  const x = el('button', 'px-2 py-1 text-slate-400 text-base', '✕');
  x.type = 'button';
  head.appendChild(x);
  const body = el('div', 'space-y-3');
  panel.appendChild(head);
  panel.appendChild(body);
  root.appendChild(panel);
  document.body.appendChild(root);

  const close = () => root.remove();
  x.onclick = close;
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  build(body, close);
  return close;
}

export function colorPicker(colors, initial, onPick) {
  const wrap = el('div', 'flex flex-wrap gap-2');
  let current = initial;
  const dots = [];
  colors.forEach((c) => {
    const d = el('button', 'w-6 h-6 rounded-full border-2');
    d.type = 'button';
    d.style.backgroundColor = c;
    d.style.borderColor = c === current ? '#ffffff' : 'transparent';
    d.onclick = () => { current = c; dots.forEach(x => (x.el.style.borderColor = x.c === current ? '#ffffff' : 'transparent')); onPick(c); };
    dots.push({ el: d, c });
    wrap.appendChild(d);
  });
  return wrap;
}

export function labeled(label, control) {
  const w = el('label', 'block');
  w.appendChild(el('div', 'text-[11px] text-slate-400 mb-1', label));
  w.appendChild(control);
  return w;
}

export function select(options, value) {
  const s = el('select', INPUT + ' w-full');
  Object.entries(options).forEach(([k, label]) => {
    const o = el('option', '', label);
    o.value = k;
    if (k === value) o.selected = true;
    s.appendChild(o);
  });
  return s;
}
