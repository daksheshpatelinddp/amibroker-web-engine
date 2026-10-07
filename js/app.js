// js/app.js

import { DataEngine } from './data-engine.js';
import { AFLEngine } from './afl-engine.js';
import { SheetManager } from './sheet-manager.js';
import { StudyRegistry } from './study-registry.js';

let dataEngine;
let aflEngine;
let sheetManager;
let studyRegistry;

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Core Engines
  dataEngine = new DataEngine();
  aflEngine = new AFLEngine();
  studyRegistry = new StudyRegistry();
  sheetManager = new SheetManager('workspace-viewport');

  // 1. Initialize Default AmiBroker Workspace Layout (Sheet 1: Main Workstation)
  const mainSheet = sheetManager.createSheet('sheet_1', 'Main Chart', false);
  
  // Add AmiBroker-style stacked panes (Price Pane + Indicator Pane)
  const pricePane = mainSheet.instance.addPane('pane_price', 400);
  const indicatorPane = mainSheet.instance.addPane('pane_indicators', 200);

  // 2. Initial Data Fetch & Render
  await loadAndRenderSymbol('RELIANCE');

  // 3. Bind UI Controls (Symbol Switcher, AFL Apply Formula, Drawer Toggle)
  setupUIEventListeners();
});

async function loadAndRenderSymbol(symbol) {
  sheetManager.setGlobalSymbolAndInterval(symbol, '1D');
  const activeSheet = sheetManager.getActiveSheet();
  
  if (!activeSheet) return;

  const bars = await dataEngine.fetchBars(activeSheet.symbol);
  if (!bars || bars.length === 0) return;

  // Retrieve Pane instances
  const pricePane = activeSheet.instance.panes.get('pane_price');
  const indicatorPane = activeSheet.instance.panes.get('pane_indicators');

  // Register and Render Candlesticks on Price Pane
  const priceStudyId = `${activeSheet.id}_pane_price_candles`;
  studyRegistry.registerStudy(priceStudyId, activeSheet.id, 'pane_price', { type: 'CANDLESTICK' });
  pricePane.setCandlestickData(priceStudyId, bars);

  // Render Default Volume Histogram on Indicator Pane
  const volumeStudyId = `${activeSheet.id}_pane_indicators_volume`;
  studyRegistry.registerStudy(volumeStudyId, activeSheet.id, 'pane_indicators', { type: 'HISTOGRAM' });
  
  const volumeData = bars.map(b => ({
    time: b.time,
    value: b.volume || 0,
    color: b.close >= b.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
  }));
  indicatorPane.plotHistogramStudy(volumeStudyId, volumeData);

  // Double-pass frame request to prevent blank mobile canvas initialization
  requestAnimationFrame(() => {
    activeSheet.instance.resizeAll();
  });
}

function setupUIEventListeners() {
  // AFL Apply Formula Click
  const applyBtn = document.getElementById('btn-apply-formula');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const formula = document.getElementById('afl-editor')?.value;
      if (!formula) return;

      const activeSheet = sheetManager.getActiveSheet();
      const currentBars = dataEngine.getCurrentData();
      
      // Evaluate AFL Formula
      const results = aflEngine.evaluate(formula, currentBars);

      if (results && results.plots) {
        const pricePane = activeSheet.instance.panes.get('pane_price');
        
        results.plots.forEach((plot, idx) => {
          const studyId = `${activeSheet.id}_pane_price_afl_plot_${idx}`;
          studyRegistry.registerStudy(studyId, activeSheet.id, 'pane_price', { title: plot.title });
          
          pricePane.plotLineStudy(studyId, plot.data, {
            color: plot.color || '#2962FF',
            title: plot.title || `Plot ${idx + 1}`
          });
        });
      }
    });
  }

  // Handle Window Resizing Across All Panes
  window.addEventListener('resize', () => {
    const activeSheet = sheetManager.getActiveSheet();
    if (activeSheet) activeSheet.instance.resizeAll();
  });
}