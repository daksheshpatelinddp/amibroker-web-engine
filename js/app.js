import { DataEngine } from "./data-engine.js";
import { ChartEngine } from "./chart-engine.js";
import { SheetManager } from "./sheet-manager.js";
import { AFLEngine } from "./afl-engine.js";

class WorkstationApp {
  constructor() {
    this.dataEngine = new DataEngine();
    this.chartEngine = new ChartEngine("pane-container");
    this.aflEngine = new AFLEngine();
    this.sheetManager = new SheetManager("sheet-bar", (sheet) => this.onSheetChanged(sheet));

    // Full Stock Symbol Database Catalog
    this.stockDatabase = [
      { symbol: "RELIANCE", name: "Reliance Industries Ltd.", exchange: "NSE" },
      { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE" },
      { symbol: "INFY", name: "Infosys Limited", exchange: "NSE" },
      { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", exchange: "NSE" },
      { symbol: "ICICIBANK", name: "ICICI Bank Ltd.", exchange: "NSE" },
      { symbol: "TATAMOTORS", name: "Tata Motors Ltd.", exchange: "NSE" },
      { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd.", exchange: "NSE" },
      { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
      { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ" },
    ];
    this.currentSymbol = "RELIANCE";
  }

  async start() {
    try {
      console.log("[App] Booting AmiBroker Web Workstation...");
      this.sheetManager.render();
      await this.dataEngine.initialize();

      // Bind Search Modal Controls
      this.setupSymbolSearchModal();

      // Load initial stock data via AFL Execution Engine
      await this.loadSymbol(this.currentSymbol);

      this.updateStatusBadge(true);
    } catch (err) {
      console.error("[App] Workstation startup failed:", err);
      this.updateStatusBadge(false, err.message);
    }
  }

  async loadSymbol(symbol) {
    this.currentSymbol = symbol;
    document.getElementById("active-symbol-label").textContent = symbol;

    const data = await this.dataEngine.getHistoricalData(symbol);
    this.aflEngine.execute(this.aflEngine.defaultFormula, data, this.chartEngine);
  }

  setupSymbolSearchModal() {
    const modal = document.getElementById("symbol-modal");
    const btn = document.getElementById("symbol-search-btn");
    const menuSearchBtn = document.getElementById("menu-symbol-search");
    const closeBtn = document.getElementById("close-symbol-modal");
    const input = document.getElementById("symbol-search-input");
    const resultsContainer = document.getElementById("symbol-results");

    const openModal = () => {
      modal.classList.remove("hidden");
      input.value = "";
      this.renderSymbolResults(this.stockDatabase);
      input.focus();
    };

    const closeModal = () => modal.classList.add("hidden");

    btn.onclick = openModal;
    if (menuSearchBtn) menuSearchBtn.onclick = openModal;
    closeBtn.onclick = closeModal;

    // Hotkey: Ctrl+K or '/' to open search
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey && e.key === "k") || e.key === "/") {
        e.preventDefault();
        openModal();
      } else if (e.key === "Escape") {
        closeModal();
      }
    });

    input.oninput = (e) => {
      const q = e.target.value.toUpperCase();
      const filtered = this.stockDatabase.filter(
        (s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q)
      );
      this.renderSymbolResults(filtered);
    };
  }

  renderSymbolResults(items) {
    const container = document.getElementById("symbol-results");
    container.innerHTML = "";

    if (items.length === 0) {
      container.innerHTML = `<div class="p-4 text-center text-slate-500">No symbols found matching query</div>`;
      return;
    }

    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "p-2.5 hover:bg-sky-600 hover:text-white flex justify-between items-center cursor-pointer rounded transition";
      div.innerHTML = `
        <div>
          <span class="font-bold text-slate-100 group-hover:text-white">${item.symbol}</span>
          <span class="text-[10px] text-slate-400 ml-2">${item.name}</span>
        </div>
        <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">${item.exchange}</span>
      `;
      div.onclick = () => {
        this.loadSymbol(item.symbol);
        document.getElementById("symbol-modal").classList.add("hidden");
      };
      container.appendChild(div);
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