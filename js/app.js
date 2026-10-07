// js/app.js
import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';
import { aflEngine } from './afl-engine.js';

class App {
  constructor() {
    this.currentSymbol = 'RELIANCE';
    this.currentData = [];
  }

  async init() {
    chartEngine.init('chart-container');
    await dataEngine.init();

    await this.loadAndRenderSymbol(this.currentSymbol);
    this.setupEventListeners();
  }

  async loadAndRenderSymbol(symbol) {
    this.currentSymbol = symbol;
    this.currentData = await dataEngine.getSymbolData(symbol);

    if (this.currentData && this.currentData.length > 0) {
      chartEngine.updateData(this.currentData);
      this.applyAFLFormula();
    }
  }

  applyAFLFormula() {
    const editorElement = document.getElementById('afl-editor-container');
    let aflCode = '';

    if (editorElement) {
      aflCode = editorElement.value || editorElement.innerText || editorElement.textContent;
    }

    if (!aflCode || this.currentData.length === 0) return;

    const result = aflEngine.execute(aflCode, this.currentData);

    if (result.errors && result.errors.length > 0) {
      console.warn('AFL Execution Errors:', result.errors);
    } else {
      chartEngine.renderAFLPlots(result.plots);
    }
  }

  setupEventListeners() {
    const symbolSearchInput = document.getElementById('symbol-search');
    if (symbolSearchInput) {
      symbolSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const selectedSymbol = e.target.value.trim().toUpperCase();
          if (selectedSymbol) this.loadAndRenderSymbol(selectedSymbol);
        }
      });
      symbolSearchInput.addEventListener('change', (e) => {
        const selectedSymbol = e.target.value.trim().toUpperCase();
        if (selectedSymbol) this.loadAndRenderSymbol(selectedSymbol);
      });
    }

    const applyBtn = document.getElementById('btn-apply-afl');
    if (applyBtn) {
      const handleApply = (e) => {
        e.preventDefault();
        this.applyAFLFormula();
      };
      applyBtn.addEventListener('click', handleApply);
      applyBtn.addEventListener('touchstart', handleApply);
    }

    const resetBtn = document.getElementById('btn-reset-afl');
    if (resetBtn) {
      const handleReset = (e) => {
        e.preventDefault();
        const editorElement = document.getElementById('afl-editor-container');
        if (editorElement) {
          editorElement.value = `// Default AmiBroker Formula\nPlot( Close, "Price", "#26a69a", "candle", true );\nPlot( MA(Close, 20), "SMA 20", "#3b82f6", "line" );\nPlot( EMA(Close, 50), "EMA 50", "#f97316", "line" );`;
          this.applyAFLFormula();
        }
      };
      resetBtn.addEventListener('click', handleReset);
      resetBtn.addEventListener('touchstart', handleReset);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});