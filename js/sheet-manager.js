// js/sheet-manager.js

import { SheetWorkstation } from './chart-engine.js';

export class SheetManager {
  constructor(workspaceContainerId) {
    this.container = document.getElementById(workspaceContainerId);
    this.sheets = new Map(); // sheetId -> { metadata, instance }
    this.activeSheetId = null;
    this.currentGlobalSymbol = 'RELIANCE';
    this.currentGlobalInterval = '1D';
  }

  createSheet(sheetId, name, isLocked = false, symbol = null, interval = null) {
    const sheetDOMContainer = document.createElement('div');
    sheetDOMContainer.id = `sheet_container_${sheetId}`;
    sheetDOMContainer.className = 'sheet-container';
    sheetDOMContainer.style.display = 'none';
    sheetDOMContainer.style.width = '100%';
    sheetDOMContainer.style.height = '100%';
    sheetDOMContainer.style.overflowY = 'auto';

    this.container.appendChild(sheetDOMContainer);

    const workstation = new SheetWorkstation(sheetId, sheetDOMContainer);
    
    const sheetData = {
      id: sheetId,
      name: name,
      isLocked: isLocked,
      symbol: symbol || this.currentGlobalSymbol,
      interval: interval || this.currentGlobalInterval,
      instance: workstation,
      dom: sheetDOMContainer,
    };

    this.sheets.set(sheetId, sheetData);

    if (!this.activeSheetId) {
      this.activateSheet(sheetId);
    }

    return sheetData;
  }

  activateSheet(sheetId) {
    if (!this.sheets.has(sheetId)) return;

    this.sheets.forEach((sheet, id) => {
      if (id === sheetId) {
        sheet.dom.style.display = 'block';
        this.activeSheetId = id;
        sheet.instance.resizeAll();
      } else {
        sheet.dom.style.display = 'none';
      }
    });
  }

  toggleSheetLock(sheetId) {
    const sheet = this.sheets.get(sheetId);
    if (sheet) {
      sheet.isLocked = !sheet.isLocked;
      return sheet.isLocked;
    }
    return false;
  }

  // Global symbol/interval sync handler across unlocked sheets
  setGlobalSymbolAndInterval(symbol, interval) {
    this.currentGlobalSymbol = symbol;
    this.currentGlobalInterval = interval;

    this.sheets.forEach(sheet => {
      if (!sheet.isLocked) {
        sheet.symbol = symbol;
        sheet.interval = interval;
      }
    });
  }

  getActiveSheet() {
    return this.sheets.get(this.activeSheetId);
  }
}