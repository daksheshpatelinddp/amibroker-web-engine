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
  const statusBadge = document.getElementById('engine-status-badge');

  try {
    // 1. Initialize Subsystems
    dataEngine = new DataEngine();
    aflEngine = new AFLEngine();
    studyRegistry = new StudyRegistry();

    const workspaceElem = document.getElementById('workspace-viewport');
    sheetManager = new SheetManager(workspaceElem);

    // 2. Initialize Data Engine (3s Timeout Protected)
    await dataEngine.init();

    // 3. Build Multi-Pane Chart Stack
    const mainSheet = sheetManager.createSheet('sheet_1', 'Main Workstation', false);
    mainSheet.instance.addPane('pane_price', 380);
    mainSheet.instance.addPane('pane_indicators', 180);

    // 4. Render Initial Ticker Data
    await loadAndRenderSymbol('RELIANCE');

    // 5. Update UI Status Badge to Ready
    if (statusBadge) {
      statusBadge.textContent = '● Ready';
      statusBadge.className = 'status-indicator text-xs font-semibold text-emerald-400';
    }

    setupUIEventListeners();

  } catch (error) {
    console.error('Startup initialization error:', error);
    if (statusBadge) {
      statusBadge.textContent = '● Ready (Fallback)';
      statusBadge.className = 'status-indicator text-xs font-semibold text-emerald-400';
    }
  }
});

async function loadAndRenderSymbol(symbol) {
  sheetManager.setGlobalSymbolAndInterval(symbol, '1D');
  const activeSheet = sheetManager.getActiveSheet();
  if (!activeSheet) return;

  const bars = await dataEngine.fetchBars(activeSheet.symbol);

  const pricePane = activeSheet.instance.panes.get('pane_price');
  const indicatorPane = activeSheet.instance.panes.get('pane_indicators');

  if (pricePane && bars.length > 0) {
    const priceStudyId = `${activeSheet.id}_pane_price_candles`;
    studyRegistry.registerStudy(priceStudyId, activeSheet.id, 'pane_price', { type: 'CANDLESTICK' });
    pricePane.setCandlestickData(priceStudyId, bars);
  }

  if (indicatorPane && bars.length > 0) {
    const volumeStudyId = `${activeSheet.id}_pane_indicators_volume`;
    studyRegistry.registerStudy(volumeStudyId, activeSheet.id, 'pane_indicators', { type: 'HISTOGRAM' });

    const volumeData = bars.map(b => ({
      time: b.time,
      value: b.volume || 0,
      color: b.close >= b.open ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)',
    }));
    indicatorPane.plotHistogramStudy(volumeStudyId, volumeData);
  }

  requestAnimationFrame(() => {
    activeSheet.instance.resizeAll();
  });
}

function setupUIEventListeners() {
  // Toggle Analysis Drawer
  const toggleDrawerBtn = document.getElementById('btn-toggle-analysis');
  const closeDrawerBtn = document.getElementById('btn-close-drawer');
  const drawer = document.getElementById('analysis-drawer');

  if (toggleDrawerBtn && drawer) {
    toggleDrawerBtn.addEventListener('click', () => {
      drawer.classList.remove('translate-x-full');
    });
  }

  if (closeDrawerBtn && drawer) {
    closeDrawerBtn.addEventListener('click', () => {
      drawer.classList.add('translate-x-full');
    });
  }

  // AFL Apply Formula Execution
  const applyBtn = document.getElementById('btn-apply-formula');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const formula = document.getElementById('afl-editor')?.value;
      if (!formula) return;

      const activeSheet = sheetManager.getActiveSheet();
      const currentBars = dataEngine.getCurrentData(activeSheet.symbol);

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

      if (drawer) drawer.classList.add('translate-x-full');
    });
  }

  window.addEventListener('resize', () => {
    const activeSheet = sheetManager.getActiveSheet();
    if (activeSheet) activeSheet.instance.resizeAll();
  });
}