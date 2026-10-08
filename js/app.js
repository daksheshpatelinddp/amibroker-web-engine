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
  }

  async start() {
    try {
      console.log("[App] Booting AmiBroker Web Workstation...");

      // 1. Render Workstation Tabs & Controls
      this.sheetManager.render();

      // 2. Initialize Data Engine (DuckDB / R2 Cache)
      await this.dataEngine.initialize();

      // 3. Initialize Multi-Pane Chart Stack
      this.chartEngine.initChart();

      // 4. Fetch & Load Initial Symbol Data
      const symbolSelect = document.getElementById("symbol-select");
      const symbol = symbolSelect ? symbolSelect.value : "RELIANCE";
      
      const historicalData = await this.dataEngine.getHistoricalData(symbol);
      this.chartEngine.setData(historicalData);

      // 5. Update Status Badge to Ready
      this.updateStatusBadge(true);

      // Event listener for symbol selector changes
      if (symbolSelect) {
        symbolSelect.addEventListener("change", async (e) => {
          const newSymbol = e.target.value;
          const activeSheet = this.sheetManager.getActiveSheet();
          
          if (!activeSheet.locked) {
            this.chartEngine.setSymbolAndInterval(newSymbol, "D");
            const freshData = await this.dataEngine.getHistoricalData(newSymbol);
            this.chartEngine.setData(freshData);
          }
        });
      }

    } catch (err) {
      console.error("[App] Workstation startup failed:", err);
      this.updateStatusBadge(false, err.message);
    }
  }

  onSheetChanged(sheet) {
    console.log(`[App] Switched to ${sheet.name} (Chart ID: ${sheet.chartId})`);
    // Load drawings and AFL study formulas registered for this Chart ID
    const studies = this.studyRegistry.getStudiesForChart(sheet.chartId);
    console.log(`[App] Active studies for Chart ID ${sheet.chartId}:`, studies);
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