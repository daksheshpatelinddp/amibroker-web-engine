import { DataEngine } from "./data-engine.js";
import { ChartEngine } from "./chart-engine.js";
import { SheetManager } from "./sheet-manager.js";
import { StudyRegistry } from "./study-registry.js";

class WorkstationApp {
  constructor() {
    this.dataEngine = new DataEngine();
    this.chartEngine = new ChartEngine("chart-container");
    this.sheetManager = new SheetManager("sheet-bar");
    this.studyRegistry = new StudyRegistry();
  }

  async start() {
    try {
      console.log("[App] Starting Workstation...");
      
      // 1. Initialize Sheet Bar
      this.sheetManager.render();

      // 2. Initialize Data Engine
      await this.dataEngine.initialize();

      // 3. Initialize Chart Canvas
      this.chartEngine.initChart();

      // 4. Fetch & Load Sample Data
      const symbol = document.getElementById("symbol-select")?.value || "RELIANCE";
      const data = await this.dataEngine.getHistoricalData(symbol);
      this.chartEngine.setData(data);

      // 5. Update UI Status Badge to Ready
      this.updateStatusBadge(true);

    } catch (err) {
      console.error("[App] Application startup failed:", err);
      this.updateStatusBadge(false, err.message);
    }
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

// Bootstrap application on DOM load
document.addEventListener("DOMContentLoaded", () => {
  const app = new WorkstationApp();
  app.start();
});