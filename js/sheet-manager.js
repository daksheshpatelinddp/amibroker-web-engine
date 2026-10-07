// js/sheet-manager.js

import { SheetWorkstation } from './chart-engine.js';

export class SheetManager {
  constructor(workspaceContainerId) {
    this.container = typeof workspaceContainerId === 'string'
      ? document.getElementById(workspaceContainerId)
      : workspaceContainerId;

    this.sheets = new Map();
    this.activeSheetId = null;
    this.currentGlobalSymbol = 'RELIANCE';
    this.currentGlobalInterval = '1D';
  }

  createSheet(sheetId, name, isLocked = false) {
    const sheetDOM = document.createElement('div');
    sheetDOM.id = `sheet_container_${sheetId}`;
    sheetDOM.style.display = 'none';
    sheetDOM.style.width = '100%';
    sheetDOM.style.height = '100%';

    this.container.appendChild(sheetDOM);

    const workstation = new SheetWorkstation(sheetId, sheetDOM);
    const sheetData = {
      id: sheetId,
      name: name,
      isLocked: isLocked,
      symbol: this.currentGlobalSymbol,
      interval: this.currentGlobalInterval,
      instance: workstation,
      dom: sheetDOM,
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