// Add or verify inside your main initial load and 'Apply Formula' handler in js/app.js:

import { ChartEngine } from './chart-engine.js';
import { DataEngine } from './data-engine.js';
import { AFLEngine } from './afl-engine.js';

let chartEngine;
let dataEngine;
let aflEngine;

document.addEventListener('DOMContentLoaded', async () => {
  chartEngine = new ChartEngine('chart-container');
  dataEngine = new DataEngine();
  aflEngine = new AFLEngine();

  // Load Initial Ticker Data (e.g., RELIANCE)
  await loadAndRenderTicker('RELIANCE');

  // Handle AFL Apply Formula button click
  const applyFormulaBtn = document.getElementById('btn-apply-formula');
  if (applyFormulaBtn) {
    applyFormulaBtn.addEventListener('click', () => {
      const code = document.getElementById('afl-editor')?.value;
      if (!code) return;

      chartEngine.clearIndicators();
      const currentData = dataEngine.getCurrentData();
      const results = aflEngine.evaluate(code, currentData);

      if (results && results.plots) {
        results.plots.forEach((plot, index) => {
          chartEngine.plotIndicator(`plot_${index}`, plot.data, {
            color: plot.color || '#2962FF',
            title: plot.title || `Plot ${index + 1}`
          });
        });
      }
    });
  }
});

async function loadAndRenderTicker(symbol) {
  const bars = await dataEngine.fetchBars(symbol);
  if (bars && bars.length > 0) {
    chartEngine.setCandleData(bars);
    
    // Ensure viewport recalculation after DOM rendering pass
    requestAnimationFrame(() => {
      chartEngine.resize();
    });
  }
}