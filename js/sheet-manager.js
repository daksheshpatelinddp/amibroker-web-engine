/**
 * SheetManager - Multi-Sheet Workstation Manager with AmiBroker Link & Lock Controls
 */
export class SheetManager {
  constructor(containerId, onSheetChange) {
    this.container = document.getElementById(containerId);
    this.onSheetChange = onSheetChange;
    this.linkColors = ["#64748b", "#ef4444", "#22c55e", "#3b82f6", "#eab308"]; // Gray, Red, Green, Blue, Yellow
    
    // Initialize 10 AmiBroker Workstation Sheets
    this.sheets = Array.from({ length: 10 }, (_, i) => ({
      id: `sheet-${i + 1}`,
      name: `Sheet ${i + 1}`,
      active: i === 0,
      locked: false,
      symbolLinkIdx: 0,   // 0 = Unlinked (Gray)
      intervalLinkIdx: 0, // 0 = Unlinked (Gray)
      chartId: 1000 + i + 1,
    }));
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = "";

    const activeSheet = this.sheets.find((s) => s.active) || this.sheets[0];

    // Left Controls: Sheet Lock, Symbol Link (S), Interval Link (I)
    const controlGroup = document.createElement("div");
    controlGroup.className = "flex items-center space-x-1 pr-3 border-r border-slate-800 shrink-0";

    // Lock Toggle Button
    const lockBtn = document.createElement("button");
    lockBtn.className = `p-1 text-[11px] rounded hover:bg-slate-800 transition ${
      activeSheet.locked ? "text-amber-400 font-bold" : "text-slate-500"
    }`;
    lockBtn.title = activeSheet.locked ? "Sheet Locked" : "Sheet Unlocked";
    lockBtn.innerHTML = activeSheet.locked ? "🔒" : "🔓";
    lockBtn.onclick = () => {
      activeSheet.locked = !activeSheet.locked;
      this.render();
    };

    // Symbol Link (S) Badge
    const symbolLinkBtn = document.createElement("button");
    symbolLinkBtn.className = "px-1.5 py-0.5 text-[10px] font-extrabold rounded text-slate-950 transition";
    symbolLinkBtn.style.backgroundColor = this.linkColors[activeSheet.symbolLinkIdx];
    symbolLinkBtn.textContent = "S";
    symbolLinkBtn.title = "Symbol Link Group";
    symbolLinkBtn.onclick = () => {
      activeSheet.symbolLinkIdx = (activeSheet.symbolLinkIdx + 1) % this.linkColors.length;
      this.render();
    };

    // Interval Link (I) Badge
    const intervalLinkBtn = document.createElement("button");
    intervalLinkBtn.className = "px-1.5 py-0.5 text-[10px] font-extrabold rounded text-slate-950 transition";
    intervalLinkBtn.style.backgroundColor = this.linkColors[activeSheet.intervalLinkIdx];
    intervalLinkBtn.textContent = "I";
    intervalLinkBtn.title = "Interval Link Group";
    intervalLinkBtn.onclick = () => {
      activeSheet.intervalLinkIdx = (activeSheet.intervalLinkIdx + 1) % this.linkColors.length;
      this.render();
    };

    controlGroup.appendChild(lockBtn);
    controlGroup.appendChild(symbolLinkBtn);
    controlGroup.appendChild(intervalLinkBtn);
    this.container.appendChild(controlGroup);

    // Sheet Tabs Scrollable Bar
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "flex items-center space-x-1 overflow-x-auto shrink-0 flex-1 scrollbar-none";

    this.sheets.forEach((sheet) => {
      const tab = document.createElement("button");
      tab.className = `px-3 py-1 text-xs font-medium rounded-t transition whitespace-nowrap ${
        sheet.active
          ? "bg-slate-800 text-sky-400 border-t-2 border-sky-400"
          : "bg-slate-900/50 text-slate-400 hover:text-slate-200"
      }`;
      tab.textContent = sheet.name;
      tab.onclick = () => this.selectSheet(sheet.id);
      tabsWrapper.appendChild(tab);
    });

    this.container.appendChild(tabsWrapper);
  }

  init() {
    this.render();
  }

  selectSheet(sheetId) {
    this.sheets.forEach((s) => (s.active = s.id === sheetId));
    this.render();
    const current = this.sheets.find((s) => s.id === sheetId);
    if (this.onSheetChange && current) {
      this.onSheetChange(current);
    }
  }

  getActiveSheet() {
    return this.sheets.find((s) => s.active) || this.sheets[0];
  }
}

// app.js imports this singleton
export const sheetManager = new SheetManager("sheet-bar");
