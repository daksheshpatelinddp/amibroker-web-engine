// js/app.js
import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';

class App {
  constructor() {
    this.currentSymbol = 'RELIANCE';
  }

  async init() {
    // Initialize Charting Container
    chartEngine.init('chart-container');

    // Initialize DuckDB Data Engine & Load Data
    await dataEngine.init();
    await this.loadAndRenderSymbol(this.currentSymbol);

    this.setupEventListeners();
  }

  async loadAndRenderSymbol(symbol) {
    this.currentSymbol = symbol;
    const symbolData = await dataEngine.getSymbolData(symbol);
    if (symbolData && symbolData.length > 0) {
      chartEngine.updateData(symbolData);
    } else {
      console.warn(`No data found for symbol: ${symbol}`);
    }
  }

  setupEventListeners() {
    const symbolSearchInput = document.getElementById('symbol-search');
    if (symbolSearchInput) {
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