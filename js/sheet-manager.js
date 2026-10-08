/**
 * SheetManager - Multi-Sheet Workstation Manager with Dynamic Add/Remove and Link/Lock
 */
export class SheetManager {
  constructor(containerId, onSheetChange) {
    this.container = document.getElementById(containerId);
    this.onSheetChange = onSheetChange;
    this.linkColors = ["#64748b", "#ef4444", "#22c55e", "#3b82f6", "#eab308"];
    this.sheets = [
      { id: "sheet-1", name: "Main Chart", active: true, locked: false, symbolLinkIdx: 0, intervalLinkIdx: 0, chartId: 1001 },
      { id: "sheet-2", name: "Multi-Pane", active: false, locked: false, symbolLinkIdx: 0, intervalLinkIdx: 0, chartId: 1002 },
      { id: "sheet-3", name: "Scanner", active: false, locked: false, symbolLinkIdx: 0, intervalLinkIdx: 0, chartId: 1003 },
    ];
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = "";

    const activeSheet = this.getActiveSheet();

    // Controls Left: Lock, Symbol Link (S), Interval Link (I)
    const ctrlGroup = document.createElement("div");
    ctrlGroup.className = "flex items-center space-x-1 pr-2 border-r border-slate-800 shrink-0";

    const lockBtn = document.createElement("button");
    lockBtn.className = `p-1 text-[11px] rounded hover:bg-slate-800 ${activeSheet.locked ? "text-amber-400 font-bold" : "text-slate-500"}`;
    lockBtn.innerHTML = activeSheet.locked ? "🔒" : "🔓";
    lockBtn.onclick = () => { activeSheet.locked = !activeSheet.locked; this.render(); };

    const symbolLinkBtn = document.createElement("button");
    symbolLinkBtn.className = "px-1.5 py-0.5 text-[10px] font-bold rounded text-slate-950";
    symbolLinkBtn.style.backgroundColor = this.linkColors[activeSheet.symbolLinkIdx];
    symbolLinkBtn.textContent = "S";
    symbolLinkBtn.onclick = () => { activeSheet.symbolLinkIdx = (activeSheet.symbolLinkIdx + 1) % this.linkColors.length; this.render(); };

    const intervalLinkBtn = document.createElement("button");
    intervalLinkBtn.className = "px-1.5 py-0.5 text-[10px] font-bold rounded text-slate-950";
    intervalLinkBtn.style.backgroundColor = this.linkColors[activeSheet.intervalLinkIdx];
    intervalLinkBtn.textContent = "I";
    intervalLinkBtn.onclick = () => { activeSheet.intervalLinkIdx = (activeSheet.intervalLinkIdx + 1) % this.linkColors.length; this.render(); };

    ctrlGroup.appendChild(lockBtn);
    ctrlGroup.appendChild(symbolLinkBtn);
    ctrlGroup.appendChild(intervalLinkBtn);
    this.container.appendChild(ctrlGroup);

    // Scrollable Sheet Tabs
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "flex items-center space-x-1 overflow-x-auto shrink-0 flex-1";

    this.sheets.forEach((sheet) => {
      const tab = document.createElement("div");
      tab.className = `px-3 py-1 text-xs font-medium rounded-t flex items-center space-x-1 cursor-pointer transition ${
        sheet.active ? "bg-slate-800 text-sky-400 border-t-2 border-sky-400" : "bg-slate-900/50 text-slate-400 hover:text-slate-200"
      }`;

      const label = document.createElement("span");
      label.textContent = sheet.name;
      label.onclick = () => this.selectSheet(sheet.id);

      tab.appendChild(label);

      if (this.sheets.length > 1) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "text-[10px] text-slate-500 hover:text-rose-400 ml-1";
        removeBtn.textContent = "✕";
        removeBtn.onclick = (e) => { e.stopPropagation(); this.removeSheet(sheet.id); };
        tab.appendChild(removeBtn);
      }

      tabsWrapper.appendChild(tab);
    });

    // Add Sheet Button (+)
    const addBtn = document.createElement("button");
    addBtn.className = "px-2 py-1 text-xs text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded font-bold";
    addBtn.textContent = "+";
    addBtn.onclick = () => this.addSheet();
    tabsWrapper.appendChild(addBtn);

    this.container.appendChild(tabsWrapper);
  }

  addSheet() {
    const nextIdx = this.sheets.length + 1;
    const newSheet = {
      id: `sheet-${Date.now()}`,
      name: `Sheet ${nextIdx}`,
      active: true,
      locked: false,
      symbolLinkIdx: 0,
      intervalLinkIdx: 0,
      chartId: 1000 + nextIdx,
    };
    this.sheets.forEach((s) => (s.active = false));
    this.sheets.push(newSheet);
    this.render();
  }

  removeSheet(sheetId) {
    if (this.sheets.length <= 1) return;
    this.sheets = this.sheets.filter((s) => s.id !== sheetId);
    if (!this.sheets.some((s) => s.active)) this.sheets[0].active = true;
    this.render();
  }

  selectSheet(sheetId) {
    this.sheets.forEach((s) => (s.active = s.id === sheetId));
    this.render();
    if (this.onSheetChange) this.onSheetChange(this.getActiveSheet());
  }

  getActiveSheet() {
    return this.sheets.find((s) => s.active) || this.sheets[0];
  }
}