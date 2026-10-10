/**
 * SheetManager - the tab bar below the chart: any number of sheets, rename, remove,
 * plus the lock / symbol-link / interval-link buttons of the active sheet.
 */
import { el } from './ui.js';

export class SheetManager {
  constructor(containerId, workspace, { onSelect, onAdd, onRemove, onChange } = {}) {
    this.container = document.getElementById(containerId);
    this.ws = workspace;
    this.onSelect = onSelect || (() => {});
    this.onAdd = onAdd || (() => {});
    this.onRemove = onRemove || (() => {});
    this.onChange = onChange || (() => {});
    this.linkColors = ['#64748b', '#ef4444', '#22c55e', '#3b82f6', '#eab308']; // none, red, green, blue, yellow
  }

  init() { this.render(); }

  render() {
    if (!this.container) return;
    const ws = this.ws;
    const active = ws.active();
    this.container.innerHTML = '';

    // lock + link badges of the active sheet
    const controls = el('div', 'flex items-center space-x-1 pr-2 mr-1 border-r border-slate-800 shrink-0');
    const lock = el('button', `p-1 text-[11px] rounded ${active.locked ? 'text-amber-400' : 'text-slate-500'}`, active.locked ? '🔒' : '🔓');
    lock.type = 'button';
    lock.title = active.locked ? 'Sheet locked: ignores linked symbol changes' : 'Sheet unlocked';
    lock.onclick = () => { ws.toggleLock(active.id); this.render(); };
    controls.appendChild(lock);
    [['symbol', 'S', 'symbolLinkIdx', 'Symbol link group'], ['interval', 'I', 'intervalLinkIdx', 'Interval link group']].forEach(([which, letter, key, title]) => {
      const b = el('button', 'px-1.5 py-0.5 text-[10px] font-extrabold rounded text-slate-950', letter);
      b.type = 'button';
      b.title = title;
      b.style.backgroundColor = this.linkColors[active[key]];
      b.onclick = () => { ws.cycleLink(active.id, which); this.render(); };
      controls.appendChild(b);
    });
    this.container.appendChild(controls);

    // tabs
    const tabs = el('div', 'flex items-center space-x-1 flex-1 min-w-0 overflow-x-auto');
    tabs.id = 'sheet-tabs';
    ws.sheets.forEach((sheet) => {
      const isActive = sheet.id === active.id;
      const tab = el('div', `flex items-center rounded-b whitespace-nowrap shrink-0 ${isActive ? 'bg-slate-800 border-b-2 border-sky-400' : 'bg-slate-900/50'}`);
      tab.dataset.sheetId = sheet.id;
      const name = el('button', `px-3 py-1.5 text-xs font-medium ${isActive ? 'text-sky-400' : 'text-slate-400'}`, sheet.name);
      name.type = 'button';
      name.onclick = () => this.select(sheet.id);
      tab.appendChild(name);
      if (isActive) {
        const edit = el('button', 'px-1.5 py-1.5 text-[11px] text-slate-400', '✎');
        edit.type = 'button'; edit.title = 'Rename sheet'; edit.className += ' tab-rename';
        edit.onclick = () => this.rename(sheet.id);
        tab.appendChild(edit);
        if (ws.sheets.length > 1) {
          const del = el('button', 'px-1.5 py-1.5 text-[11px] text-slate-400', '✕');
          del.type = 'button'; del.title = 'Remove sheet'; del.className += ' tab-remove';
          del.onclick = () => this.remove(sheet.id);
          tab.appendChild(del);
        }
      }
      tabs.appendChild(tab);
    });
    this.container.appendChild(tabs);

    const add = el('button', 'ml-1 px-3 py-1.5 text-sm text-sky-400 shrink-0 rounded bg-slate-800/60', '＋');
    add.type = 'button'; add.id = 'btn-add-sheet'; add.title = 'Add a sheet';
    add.onclick = () => this.add();
    this.container.appendChild(add);

    // keep the active tab in view when there are many
    const activeTab = tabs.querySelector(`[data-sheet-id="${active.id}"]`);
    if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  select(id) {
    if (this.ws.activeId === id) return;
    this.ws.setActive(id);
    this.render();
    this.onSelect(this.ws.active());
  }

  add() {
    const sheet = this.ws.addSheet();
    this.render();
    this.onAdd(sheet);
  }

  rename(id) {
    const sheet = this.ws.get(id);
    if (!sheet) return;
    const name = window.prompt('Sheet name', sheet.name);
    if (name === null) return;
    if (!this.ws.renameSheet(id, name)) return;
    this.render();
    this.onChange();
  }

  remove(id) {
    const sheet = this.ws.get(id);
    if (!sheet || this.ws.sheets.length <= 1) return;
    if (!window.confirm(`Remove "${sheet.name}"?`)) return;
    const wasActive = this.ws.activeId === id;
    this.ws.removeSheet(id);
    this.render();
    this.onRemove(wasActive ? this.ws.active() : null);
  }

  getActiveSheet() { return this.ws.active(); }
}
