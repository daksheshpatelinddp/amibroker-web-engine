// Formula Library: every built-in formula plus the user's own, searchable.
// mode 'manage': rows have Add to chart / New sheet / Edit.   mode 'open': tapping a row hands it back (used by the editor's Open).
import { el, openModal, toast, BTN, INPUT } from './ui.js';
import { formulaStore } from './formula-store.js';
import { host } from './host.js';

const KIND_LABEL = { system: 'Buy/Sell', exploration: 'Scanner' };

export function openLibrary({ mode = 'manage', onPick = null } = {}) {
  openModal(mode === 'open' ? 'Open formula' : 'Formula Library', (body, close) => {
    const search = el('input', INPUT + ' w-full');
    search.type = 'search'; search.placeholder = 'Search formulas…'; search.autocomplete = 'off';
    body.appendChild(search);

    const list = el('div', 'space-y-3');
    body.appendChild(list);

    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.innerHTML = '';
      const match = (f) => !q || f.name.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q) || (f.category || '').toLowerCase().includes(q);

      const groups = [];
      const mine = formulaStore.user.filter(match);
      if (mine.length) groups.push({ title: `My formulas (${mine.length})`, items: mine });
      for (const cat of formulaStore.categories()) {
        const items = formulaStore.builtin.filter((f) => f.category === cat && match(f));
        if (items.length) groups.push({ title: cat, items });
      }
      if (!groups.length) { list.appendChild(el('div', 'text-xs text-slate-500 py-4 text-center', q ? 'No formula matches your search.' : 'No formulas yet.')); return; }

      for (const g of groups) {
        const box = el('div', 'space-y-1');
        box.appendChild(el('div', 'text-[11px] uppercase tracking-wide text-slate-500 pt-1', g.title));
        for (const f of g.items) box.appendChild(row(f));
        list.appendChild(box);
      }
    };

    const row = (f) => {
      const r = el('div', 'rounded border border-slate-800 bg-slate-800/40 p-2');
      const head = el('div', 'flex items-center space-x-2');
      head.appendChild(el('div', 'text-xs font-semibold text-slate-100 truncate flex-1', f.name));
      if (KIND_LABEL[f.kind]) head.appendChild(el('span', 'px-1.5 py-0.5 rounded text-[9px] bg-sky-900/60 text-sky-300 shrink-0', KIND_LABEL[f.kind]));
      r.appendChild(head);
      if (f.description) r.appendChild(el('div', 'text-[11px] text-slate-400 mt-0.5', f.description));

      const act = el('div', 'flex flex-wrap gap-1 mt-1.5');
      const b = (label, fn, extra = '') => { const x = el('button', BTN + ' !px-2 !py-1 ' + extra, label); x.type = 'button'; x.onclick = (e) => { e.stopPropagation(); fn(); }; act.appendChild(x); };
      if (mode === 'open') {
        b('Open', () => { close(); onPick && onPick(f); });
      } else {
        if (f.kind !== 'exploration') {
          b('＋ Add to chart', () => { host.addFormulaPane(f.id); close(); toast(`Added "${f.name}"`); });
          b('▢ New sheet', () => { host.newFormulaSheet(f.id); close(); });
        }
        b('✎ Edit', async () => { const { openFormulaEditor } = await import('./formula-editor.js'); close(); openFormulaEditor({ formulaId: f.id }); });
        if (!f.builtin) b('Delete', () => {
          if (!window.confirm(`Delete "${f.name}"?`)) return;
          formulaStore.remove(f.id); host.relayout(); draw();
        }, 'text-red-300');
        else b('Duplicate', () => { const c = formulaStore.duplicate(f.id); toast(`Copied to My formulas as "${c.name}"`); draw(); });
      }
      r.appendChild(act);
      return r;
    };

    search.oninput = draw;
    draw();

    // backup / restore of the user's own formulas
    if (mode === 'manage') {
      const foot = el('div', 'flex gap-2 pt-2 border-t border-slate-800');
      const exp = el('button', BTN + ' flex-1', 'Backup my formulas');
      exp.type = 'button';
      exp.onclick = () => {
        if (!formulaStore.user.length) { toast('You have no saved formulas yet'); return; }
        const url = URL.createObjectURL(new Blob([formulaStore.exportAll()], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'my-formulas.json'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
      const imp = el('button', BTN + ' flex-1', 'Restore from file');
      imp.type = 'button';
      const fin = el('input'); fin.type = 'file'; fin.accept = '.json,application/json'; fin.className = 'hidden';
      imp.onclick = () => fin.click();
      fin.onchange = async () => {
        const file = fin.files && fin.files[0]; fin.value = '';
        if (!file) return;
        try { const n = formulaStore.importJSON(await file.text()); toast(`Restored ${n} formula${n === 1 ? '' : 's'}`); draw(); }
        catch (e) { toast('Could not read that file: ' + e.message, 4000); }
      };
      foot.appendChild(exp); foot.appendChild(imp); foot.appendChild(fin);
      body.appendChild(foot);
    }
  }, { stack: true });
}
