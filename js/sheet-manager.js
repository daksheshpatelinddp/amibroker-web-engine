export class SheetManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.sheets = [
      { id: "sheet-1", name: "Main Chart", active: true },
      { id: "sheet-2", name: "Multi-Pane", active: false },
      { id: "sheet-3", name: "Scanner", active: false },
    ];
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = "";

    this.sheets.forEach((sheet) => {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1 text-xs rounded-t font-medium transition-colors ${
        sheet.active
          ? "bg-slate-800 text-sky-400 border-t-2 border-sky-400"
          : "bg-slate-900/50 text-slate-400 hover:text-slate-200"
      }`;
      btn.textContent = sheet.name;
      btn.onclick = () => this.selectSheet(sheet.id);
      this.container.appendChild(btn);
    });
  }

  selectSheet(sheetId) {
    this.sheets.forEach((s) => (s.active = s.id === sheetId));
    this.render();
  }
}