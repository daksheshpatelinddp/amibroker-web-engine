/**
 * sheet-manager.js
 * Dynamic Multi-Sheet & Multi-Pane Manager for AmiBroker Web
 */

export class SheetManager {
    constructor(appInstance) {
        this.app = appInstance;
        this.sheets = [];
        this.activeSheetId = null;
        this.nextSheetIndex = 1;
        
        // Initialize with default sheets
        this.initDefaultSheets();
    }

    initDefaultSheets() {
        this.addSheet("Sheet 1");
        this.addSheet("Sheet 2");
        this.setActiveSheet(this.sheets[0].id);
    }

    addSheet(name = null) {
        const id = 'sheet_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const sheetName = name || `Sheet ${this.nextSheetIndex++}`;
        
        const newSheet = {
            id: id,
            name: sheetName,
            symbol: this.app.currentSymbol || 'NIFTY 50',
            timeframe: 'D',
            panes: [
                { id: 'pane_' + Date.now() + '_1', type: 'candlestick', height: '60%', indicators: [] },
                { id: 'pane_' + Date.now() + '_2', type: 'volume', height: '20%', indicators: [{ type: 'SMA', period: 20, color: '#ff9800' }] },
                { id: 'pane_' + Date.now() + '_3', type: 'delivery', height: '20%', indicators: [] }
            ]
        };

        this.sheets.push(newSheet);
        this.renderTabs();
        this.setActiveSheet(id);
        return newSheet;
    }

    removeSheet(id) {
        if (this.sheets.length <= 1) {
            console.warn("At least one sheet must remain.");
            return;
        }

        const index = this.sheets.findIndex(s => s.id === id);
        if (index !== -1) {
            this.sheets.splice(index, 1);
            if (this.activeSheetId === id) {
                const nextActive = this.sheets[Math.max(0, index - 1)];
                this.setActiveSheet(nextActive.id);
            } else {
                this.renderTabs();
            }
        }
    }

    renameSheet(id, newName) {
        const sheet = this.sheets.find(s => s.id === id);
        if (sheet && newName.trim()) {
            sheet.name = newName.trim();
            this.renderTabs();
        }
    }

    setActiveSheet(id) {
        const sheet = this.sheets.find(s => s.id === id);
        if (!sheet) return;

        this.activeSheetId = id;
        this.renderTabs();
        
        if (this.app && typeof this.app.renderActiveSheet === 'function') {
            this.app.renderActiveSheet(sheet);
        }
    }

    getActiveSheet() {
        return this.sheets.find(s => s.id === this.activeSheetId) || this.sheets[0];
    }

    addPaneToActiveSheet(type = 'indicator', subType = 'RSI') {
        const sheet = this.getActiveSheet();
        if (!sheet) return;

        const newPane = {
            id: 'pane_' + Date.now(),
            type: type,
            subType: subType,
            height: '20%',
            indicators: []
        };
        sheet.panes.push(newPane);
        this.app.renderActiveSheet(sheet);
    }

    removePaneFromActiveSheet(paneId) {
        const sheet = this.getActiveSheet();
        if (!sheet || sheet.panes.length <= 1) return;

        sheet.panes = sheet.panes.filter(p => p.id !== paneId);
        this.app.renderActiveSheet(sheet);
    }

    addOverlayToPane(paneId, indicatorConfig) {
        const sheet = this.getActiveSheet();
        if (!sheet) return;

        const pane = sheet.panes.find(p => p.id === paneId);
        if (pane) {
            if (!pane.indicators) pane.indicators = [];
            pane.indicators.push(indicatorConfig);
            this.app.renderActiveSheet(sheet);
        }
    }

    renderTabs() {
        let container = document.getElementById('sheet-tabs-container');
        if (!container) return;

        container.innerHTML = '';
        
        this.sheets.forEach(sheet => {
            const tabEl = document.createElement('div');
            tabEl.className = `sheet-tab ${sheet.id === this.activeSheetId ? 'active' : ''}`;
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'sheet-title';
            titleSpan.textContent = sheet.name;
            titleSpan.title = "Double-click to rename";
            
            titleSpan.addEventListener('dblclick', () => {
                const input = document.createElement('input');
                input.type = 'text';
                input.value = sheet.name;
                input.className = 'sheet-rename-input';
                input.onblur = (e) => this.renameSheet(sheet.id, e.target.value);
                input.onkeydown = (e) => { if (e.key === 'Enter') this.renameSheet(sheet.id, e.target.value); };
                tabEl.replaceChild(input, titleSpan);
                input.focus();
            });

            tabEl.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                    this.setActiveSheet(sheet.id);
                }
            });

            if (this.sheets.length > 1) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'sheet-close-btn';
                closeBtn.innerHTML = '&times;';
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.removeSheet(sheet.id);
                };
                tabEl.appendChild(closeBtn);
            }

            tabEl.insertBefore(titleSpan, tabEl.firstChild);
            container.appendChild(tabEl);
        });

        // Add New Sheet Button (+)
        const addBtn = document.createElement('button');
        addBtn.className = 'sheet-add-btn';
        addBtn.innerHTML = '+ Add Sheet';
        addBtn.onclick = () => this.addSheet();
        container.appendChild(addBtn);
    }
}