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

/**
 * Opens a bottom-sheet style dialog. build(body, close) fills it. Returns close().
 * opts.stack      keep other dialogs open underneath (editor -> library -> AI ...)
 * opts.wide       big dialog for the formula editor (does not close when you tap outside it)
 * opts.beforeClose  () => false cancels closing (used for "unsaved changes?")
 * close.force()   closes without asking
 */
export function openModal(title, build, opts = {}) {
  if (!opts.stack) { const old = document.getElementById('modal-root'); if (old) old.remove(); }

  const root = el('div', 'fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60');
  if (!opts.stack) root.id = 'modal-root';
  const panel = el('div', opts.wide
    ? 'w-full max-w-4xl h-[94vh] sm:h-[90vh] bg-slate-900 border border-slate-700 rounded-t-xl sm:rounded-xl p-3 flex flex-col select-text'
    : 'w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-xl sm:rounded-xl p-3 max-h-[85vh] overflow-y-auto select-text');
  const head = el('div', 'flex items-center justify-between mb-2 shrink-0');
  head.appendChild(el('div', 'text-sm font-semibold text-slate-100 truncate', title));
  const x = el('button', 'px-2 py-1 text-slate-400 text-base', '✕');
  x.type = 'button';
  head.appendChild(x);
  const body = el('div', opts.wide ? 'flex-1 min-h-0 flex flex-col space-y-2' : 'space-y-3');
  panel.appendChild(head);
  panel.appendChild(body);
  root.appendChild(panel);
  document.body.appendChild(root);

  const close = () => {
    if (opts.beforeClose && opts.beforeClose() === false) return;
    root.remove();
    if (opts.onClose) opts.onClose();
  };
  close.force = () => { root.remove(); if (opts.onClose) opts.onClose(); };
  x.onclick = close;
  if (!opts.wide) root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  build(body, close);
  return close;
}

/** A short message at the bottom of the screen. */
export function toast(text, ms = 2600) {
  const t = el('div', 'fixed left-1/2 -translate-x-1/2 bottom-12 z-[90] px-3 py-2 rounded bg-slate-700 text-slate-100 text-xs shadow-lg max-w-[90vw]', text);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
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
