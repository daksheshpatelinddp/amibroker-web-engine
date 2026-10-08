import { DataEngine } from "./data-engine.js";
import { ChartEngine } from "./chart-engine.js";
import { SheetManager } from "./sheet-manager.js";
import { StudyRegistry } from "./study-registry.js";

class WorkstationApp {
  constructor() {
    this.dataEngine = new DataEngine();
    this.chartEngine = new ChartEngine("chart-container");
    this.studyRegistry = new StudyRegistry();
    this.sheetManager = new SheetManager("sheet-bar", (sheet) => this.onSheetChanged(sheet));
    this.currentSymbol = "RELIANCE";
  }

  async start() {
    try {
      console.log("[App] Booting AmiBroker Web Workstation...");

      this.sheetManager.render();
      await this.dataEngine.initialize();
      this.chartEngine.initChart();

      // Bind responsive symbol search handlers
      this.setupSymbolSearchModal();

      // Load default symbol
      await this.loadSymbolData(this.currentSymbol);

      this.updateStatusBadge(true);
    } catch (err) {
      console.error("[App] Startup failed:", err);
      this.updateStatusBadge(false, err.message);
    }
  }

  async loadSymbolData(symbol) {
    this.currentSymbol = symbol;
    const label = document.getElementById("current-symbol-label");
    if (label) label.textContent = symbol;

    const data = await this.dataEngine.getHistoricalData(symbol);
    this.chartEngine.setSymbolAndInterval(symbol, "D");
    this.chartEngine.setData(data);
  }

  setupSymbolSearchModal() {
    const searchBtn = document.getElementById("symbol-search-btn");
    const closeBtn = document.getElementById("close-modal-btn");
    const modal = document.getElementById("symbol-modal");
    const searchInput = document.getElementById("symbol-search-input");
    const resultsList = document.getElementById("symbol-results-list");
    const countLabel = document.getElementById("total-symbols-count");

    if (!searchBtn || !modal || !searchInput) return;

    const openModal = async () => {
      modal.classList.remove("hidden");
      searchInput.value = "";
      setTimeout(() => searchInput.focus(), 100);

      const symbols = await this.dataEngine.getAllSymbols();
      if (countLabel) countLabel.textContent = `${symbols.length} symbols loaded`;
      this.renderSymbolList(symbols);
    };

    const closeModal = () => {
      modal.classList.add("hidden");
    };

    searchBtn.onclick = openModal;
    if (closeBtn) closeBtn.onclick = closeModal;

    // Close when tapping outside modal body on mobile backdrop
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    // Keyboard Shortcuts (Ctrl+K or Cmd+K to open, ESC to close)
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openModal();
      } else if (e.key === "Escape") {
        closeModal();
      }
    });

    // Real-time Search Input Filter
    searchInput.addEventListener("input", async (e) => {
      const q = e.target.value.trim().toUpperCase();
      const allSymbols = await this.dataEngine.getAllSymbols();
      const filtered = allSymbols.filter((s) => s.includes(q));
      this.renderSymbolList(filtered);
    });

    // Quick Ticker Chips Selection
    document.querySelectorAll(".quick-chip").forEach((chip) => {
      chip.onclick = async () => {
        const symbol = chip.textContent.trim();
        closeModal();
        await this.loadSymbolData(symbol);
      };
    });
  }

  renderSymbolList(symbols) {
    const resultsList = document.getElementById("symbol-results-list");
    if (!resultsList) return;

    resultsList.innerHTML = "";

    if (symbols.length === 0) {
      resultsList.innerHTML = `<div class="p-4 text-slate-500 text-center text-xs">No matching symbols found</div>`;
      return;
    }

    symbols.forEach((sym) => {
      const row = document.createElement("button");
      row.className = "w-full text-left px-3 py-2.5 active:bg-sky-900/40 sm:hover:bg-slate-800 flex items-center justify-between text-xs text-slate-200 transition touch-manipulation";
      row.innerHTML = `
        <div class="flex items-center space-x-2">
          <span class="font-bold text-sky-400 tracking-wider text-sm">${sym}</span>
        </div>
        <span class="text-[10px] text-slate-500 font-mono">NSE / EQ</span>
      `;
      
      row.onclick = async () => {
        const modal = document.getElementById("symbol-modal");
        if (modal) modal.classList.add("hidden");
        await this.loadSymbolData(sym);
      };

      resultsList.appendChild(row);
    });
  }

  onSheetChanged(sheet) {
    console.log(`[App] Switched to ${sheet.name} (Chart ID: ${sheet.chartId})`);
  }

  updateStatusBadge(isReady, errorMsg = "") {
    const badge = document.getElementById("status-badge");
    if (!badge) return;

    if (isReady) {
      badge.textContent = "● Ready";
      badge.className = "px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    } else {
      badge.textContent = `● Error: ${errorMsg || 'Failed'}`;
      badge.className = "px-2 py-0.5 text-[10px] font-medium rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new WorkstationApp();
  app.start();
});