/**
 * js/app.js
 * AmiBroker Web Workstation - Application Entrypoint & Orchestrator
 */

import { dataEngine } from './data-engine.js';
import { chartEngine } from './chart-engine.js';
import { sheetManager } from './sheet-manager.js';

class App {
  async init() {
    try {
      console.log('Initializing AmiBroker Web Workstation...');

      // 1. Initialize Sheet UI Manager & Link Engine
      sheetManager.init();

      // 2. Register symbol change handler
      dataEngine.onSymbolChangeCallback = async (symbol) => {
        sheetManager.handleSymbolChange(symbol);
      };

      // 3. Start DuckDB WASM Data Engine & Parquet Download/Cache
      await dataEngine.init();

      // 4. Initialize Main Chart Engine Stack
      chartEngine.init();

      console.log('AmiBroker Web Workstation Ready.');
    } catch (err) {
      console.error('App initialization failed:', err);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});