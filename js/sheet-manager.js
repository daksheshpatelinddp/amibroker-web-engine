/**
 * SheetManager - Handles dynamic sheet tabs placed below chart,
 * sheet creation, removal, inline renaming, and Link Groups with robust error safety.
 */

class SheetManager {
    constructor() {
        this.sheets = [];
        this.activeSheetId = null;
        this.nextSheetCounter = 1;
        this.linkColors = ['#94a3b8', '#f87171', '#4ade80', '#60a5fa', '#facc15'];
        this.onSheetChange = null;
    }

    init() {
        try {
            const saved = this.loadState();
            if (saved && saved.sheets && saved.sheets.length > 0) {
                this.sheets = saved.sheets;
                this.activeSheetId = saved.activeSheetId || this.sheets[0].id;
                this.nextSheetCounter = saved.nextSheetCounter || (this.sheets.length + 1);
            } else {
                this.addSheet('Sheet 1', false);
                this.addSheet('Sheet 2', false);
                this.addSheet('Sheet 3', false);
                this.activeSheetId = this.sheets[0].id;
            }

            this.bindEvents();
            this.renderTabs();
            console.log('[SheetManager] Initialized successfully.');
        } catch (e) {
            console.error('[SheetManager] Initialization error:', e);
            // Fallback so app never freezes
            if (this.sheets.length === 0) {
                this.addSheet('Sheet 1', false);
                this.activeSheetId = this.sheets[0].id;
            }
            this.renderTabs();
        }
    }

    bindEvents() {
        const addBtn = document.getElementById('btn-add-sheet');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const newSheet = this.addSheet();
                this.setActiveSheet(newSheet.id);
            });
        }

        const lockBtn = document.getElementById('btn-lock');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => this.toggleLock());
        }

        const symLinkBtn = document.getElementById('btn-sym-link');
        if (symLinkBtn) {
            symLinkBtn.addEventListener('click', () => this.cycleSymbolLink());
        }

        const intLinkBtn = document.getElementById('btn-int-link');
        if (intLinkBtn) {
            intLinkBtn.addEventListener('click', () => this.cycleIntervalLink());
        }
    }

    addSheet(customName = null, triggerRender = true) {
        const id = 'sheet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const name = customName || `Sheet ${this.nextSheetCounter++}`;
        
        const newSheet = {
            id,
            name,
            symbol: 'RELIANCE',
            interval: '1D',
            isLocked: false,
            symbolLinkGroup: 0,
            intervalLinkGroup: 0
        };

        this.sheets.push(newSheet);

        if (triggerRender) {
            this.saveState();
            this.renderTabs();
        }

        return newSheet;
    }

    removeSheet(sheetId) {
        if (this.sheets.length <= 1) return;

        const index = this.sheets.findIndex(s => s.id === sheetId);
        if (index === -1) return;

        this.sheets.splice(index, 1);

        if (this.activeSheetId === sheetId) {
            const newIndex = Math.max(0, index - 1);
            this.activeSheetId = this.sheets[newIndex].id;
        }

        this.saveState();
        this.renderTabs();

        if (this.onSheetChange) {
            this.onSheetChange(this.getActiveSheet());
        }
    }

    setActiveSheet(sheetId) {
        const target = this.sheets.find(s => s.id === sheetId);
        if (!target) return;

        this.activeSheetId = sheetId;
        this.saveState();
        this.renderTabs();

        if (this.onSheetChange) {
            this.onSheetChange(target);
        }
    }

    renameSheet(sheetId, newName) {
        const trimmed = newName ? newName.trim() : '';
        if (!trimmed) return;

        const sheet = this.sheets.find(s => s.id === sheetId);
        if (sheet) {
            sheet.name = trimmed;
            this.saveState();
            this.renderTabs();
        }
    }

    getActiveSheet() {
        return this.sheets.find(s => s.id === this.activeSheetId) || this.sheets[0];
    }

    updateActiveSheetSymbol(symbol) {
        const active = this.getActiveSheet();
        if (!active || active.isLocked) return;

        const linkGroup = active.symbolLinkGroup;
        if (linkGroup > 0) {
            this.sheets.forEach(s => {
                if (s.symbolLinkGroup === linkGroup && !s.isLocked) {
                    s.symbol = symbol;
                }
            });
        } else {
            active.symbol = symbol;
        }

        this.saveState();
    }

    updateActiveSheetInterval(interval) {
        const active = this.getActiveSheet();
        if (!active || active.isLocked) return;

        const linkGroup = active.intervalLinkGroup;
        if (linkGroup > 0) {
            this.sheets.forEach(s => {
                if (s.intervalLinkGroup === linkGroup && !s.isLocked) {
                    s.interval = interval;
                }
            });
        } else {
            active.interval = interval;
        }

        this.saveState();
    }

    toggleLock() {
        const active = this.getActiveSheet();
        if (!active) return;
        active.isLocked = !active.isLocked;
        this.saveState();
        this.updateHeaderControls();
    }

    cycleSymbolLink() {
        const active = this.getActiveSheet();
        if (!active) return;
        active.symbolLinkGroup = (active.symbolLinkGroup + 1) % this.linkColors.length;
        this.saveState();
        this.updateHeaderControls();
    }

    cycleIntervalLink() {
        const active = this.getActiveSheet();
        if (!active) return;
        active.intervalLinkGroup = (active.intervalLinkGroup + 1) % this.linkColors.length;
        this.saveState();
        this.updateHeaderControls();
    }

    renderTabs() {
        const listEl = document.getElementById('sheet-tabs-list');
        if (!listEl) return;

        listEl.innerHTML = '';

        this.sheets.forEach(sheet => {
            const isActive = sheet.id === this.activeSheetId;

            const tab = document.createElement('div');
            tab.className = `flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border cursor-pointer transition-all shrink-0 ${
                isActive 
                    ? 'bg-indigo-900/40 text-indigo-300 border-indigo-500' 
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border-slate-700/60'
            }`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'select-none truncate max-w-[80px]';
            nameSpan.textContent = sheet.name;

            tab.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.enableInlineRename(tab, sheet);
            });

            tab.addEventListener('click', () => {
                if (sheet.id !== this.activeSheetId) {
                    this.setActiveSheet(sheet.id);
                }
            });

            tab.appendChild(nameSpan);

            if (this.sheets.length > 1) {
                const delBtn = document.createElement('button');
                delBtn.className = 'text-slate-500 hover:text-red-400 ml-1 leading-none text-sm';
                delBtn.innerHTML = '×';
                delBtn.title = 'Remove Sheet';

                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeSheet(sheet.id);
                });

                tab.appendChild(delBtn);
            }

            listEl.appendChild(tab);
        });

        this.updateHeaderControls();
    }

    enableInlineRename(tabEl, sheet) {
        tabEl.innerHTML = '';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = sheet.name;
        input.className = 'bg-slate-950 text-indigo-300 text-xs px-1 py-0.5 rounded border border-indigo-500 focus:outline-none w-16';

        const save = () => {
            this.renameSheet(sheet.id, input.value);
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
            else if (e.key === 'Escape') this.renderTabs();
        });

        input.addEventListener('blur', save);

        tabEl.appendChild(input);
        input.focus();
        input.select();
    }

    updateHeaderControls() {
        const active = this.getActiveSheet();
        if (!active) return;

        const symbolInput = document.getElementById('symbol-input');
        if (symbolInput && document.activeElement !== symbolInput) {
            symbolInput.value = active.symbol;
        }

        const intervalSelect = document.getElementById('interval-select');
        if (intervalSelect) {
            intervalSelect.value = active.interval;
        }

        const lockBtn = document.getElementById('btn-lock');
        if (lockBtn) {
            lockBtn.textContent = active.isLocked ? '🔒' : '🔓';
        }

        const symLinkBtn = document.getElementById('btn-sym-link');
        if (symLinkBtn) {
            symLinkBtn.style.color = this.linkColors[active.symbolLinkGroup];
        }

        const intLinkBtn = document.getElementById('btn-int-link');
        if (intLinkBtn) {
            intLinkBtn.style.color = this.linkColors[active.intervalLinkGroup];
        }
    }

    saveState() {
        try {
            const state = {
                sheets: this.sheets,
                activeSheetId: this.activeSheetId,
                nextSheetCounter: this.nextSheetCounter
            };
            localStorage.setItem('amibroker_sheet_manager_v2', JSON.stringify(state));
        } catch (e) {
            console.warn('[SheetManager] Save error:', e);
        }
    }

    loadState() {
        try {
            const raw = localStorage.getItem('amibroker_sheet_manager_v2');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }
}

export const sheetManager = new SheetManager();
export default SheetManager;