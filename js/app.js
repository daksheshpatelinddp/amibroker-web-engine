// js/app.js
import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';

class App {
  constructor() {
    this.currentSymbol = 'RELIANCE';
  }

  async init() {
    // 1. Initialize Charting Container
    chartEngine.init('chart-container');

    // 2. Initialize DuckDB Data Engine & Load/Cache Data
    await dataEngine.init();

    // 3. Initial load
    await this.loadAndRenderSymbol(this.currentSymbol);

    // 4. Bind Search Input Events
    this.setupEventListeners();
  }

  async loadAndRenderSymbol(symbol) {
    this.currentSymbol = symbol;

    const symbolData = await dataEngine.getSymbolData(symbol);
    if (symbolData && symbolData.length > 0) {
      chartEngine.updateData(symbolData);
    }
  }

  setupEventListeners() {
    const symbolSearchInput = document.getElementById('symbol-search');
    if (symbolSearchInput) {
      symbolSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const selectedSymbol = e.target.value.trim().toUpperCase();
          if (selectedSymbol) {
            this.loadAndRenderSymbol(selectedSymbol);
          }
        }
      });

      symbolSearchInput.addEventListener('change', (e) => {
        const selectedSymbol = e.target.value.trim().toUpperCase();
        if (selectedSymbol) {
          this.loadAndRenderSymbol(selectedSymbol);
        }
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});