/**
 * SheetManager - Handles dynamic sheet creation, deletion, switching, 
 * inline renaming, lock toggling, and link groups (Symbol/Interval).
 */

class SheetManager {
    constructor() {
        this.sheets = [];
        this.activeSheetId = null;
        this.nextSheetCounter = 1;
        
        this.linkColors = ['gray', 'red', 'green', 'blue', 'yellow'];
        
        this.onSheetChange = null; // Callback when active sheet switches or updates
        
        this.containerEl = null;
        this.listEl = null;
    }

    init() {
        this.listEl = document.getElementById('sheet-tabs-list');
        
        // Load persisted state or construct defaults
        const saved = this.loadState();
        if (saved && saved.sheets && saved.sheets.length > 0) {
            this.sheets = saved.sheets;
            this.activeSheetId = saved.activeSheetId || this.sheets[0].id;
            this.nextSheetCounter = saved.nextSheetCounter || (this.sheets.length + 1);
        } else {
            // Create default initial sheets
            this.addSheet('Sheet 1', false);
            this.addSheet('Sheet 2', false);
            this.addSheet('Sheet 3', false);
            this.activeSheetId = this.sheets[0].id;
        }

        this.bindEvents();
        this.renderTabs();
    }

    bindEvents() {
        const addBtn = document.getElementById('add-sheet-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const newSheet = this.addSheet();
                this.setActiveSheet(newSheet.id);
            });
        }

        const lockBtn = document.getElementById('sheet-lock-btn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => this.toggleLock());
        }

        const symbolLinkBtn = document.getElementById('symbol-link-btn');
        if (symbolLinkBtn) {
            symbolLinkBtn.addEventListener('click', () => this.cycleSymbolLink());
        }

        const intervalLinkBtn = document.getElementById('interval-link-btn');
        if (intervalLinkBtn) {
            intervalLinkBtn.addEventListener('click', () => this.cycleIntervalLink());
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
            symbolLinkGroup: 0,   // 0 = Gray (Unlinked), 1 = Red, 2 = Green, etc.
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
        if (this.sheets.length <= 1) {
            alert('Cannot remove the last remaining sheet.');
            return;
        }

        const index = this.sheets.findIndex(s => s.id === sheetId);
        if (index === -1) return;

        this.sheets.splice(index, 1);

        // If removed active sheet, select adjacent sheet
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
        
        // Update all sheets sharing same symbol link group if group > 0
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
        if (!this.listEl) return;

        this.listEl.innerHTML = '';

        this.sheets.forEach(sheet => {
            const isActive = sheet.id === this.activeSheetId;

            const tab = document.createElement('div');
            tab.className = `group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 cursor-pointer transition-all ${
                isActive 
                    ? 'bg-slate-800/90 text-indigo-400 border-indigo-500 rounded-t-sm' 
                    : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/40'
            }`;

            // Name display span
            const nameSpan = document.createElement('span');
            nameSpan.className = 'select-none truncate max-w-[100px]';
            nameSpan.textContent = sheet.name;

            // Double click / long press inline editor
            tab.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.enableInlineRename(tab, sheet);
            });

            tab.addEventListener('click', (e) => {
                if (sheet.id !== this.activeSheetId) {
                    this.setActiveSheet(sheet.id);
                }
            });

            tab.appendChild(nameSpan);

            // Delete button (visible on tab or hover)
            if (this.sheets.length > 1) {
                const delBtn = document.createElement('button');
                delBtn.className = 'text-slate-500 hover:text-red-400 ml-1 rounded p-0.5 leading-none transition-colors opacity-70 group-hover:opacity-100';
                delBtn.innerHTML = '×';
                delBtn.title = 'Remove Sheet';

                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeSheet(sheet.id);
                });

                tab.appendChild(delBtn);
            }

            this.listEl.appendChild(tab);
        });

        this.updateHeaderControls();
    }

    enableInlineRename(tabEl, sheet) {
        tabEl.innerHTML = '';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = sheet.name;
        input.className = 'bg-slate-950 text-indigo-300 text-xs px-1 py-0.5 rounded border border-indigo-500 focus:outline-none w-20';

        const save = () => {
            this.renameSheet(sheet.id, input.value);
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                save();
            } else if (e.key === 'Escape') {
                this.renderTabs();
            }
        });

        input.addEventListener('blur', save);

        tabEl.appendChild(input);
        input.focus();
        input.select();
    }

    updateHeaderControls() {
        const active = this.getActiveSheet();
        if (!active) return;

        // Symbol input
        const symbolInput = document.getElementById('symbol-search-input');
        if (symbolInput && document.activeElement !== symbolInput) {
            symbolInput.value = active.symbol;
        }

        // Interval select
        const intervalSelect = document.getElementById('interval-select');
        if (intervalSelect) {
            intervalSelect.value = active.interval;
        }

        // Lock icon
        const lockIcon = document.getElementById('lock-icon');
        if (lockIcon) {
            lockIcon.textContent = active.isLocked ? '🔒' : '🔓';
        }

        // Link group buttons color styling
        const symbolLinkBtn = document.getElementById('symbol-link-btn');
        if (symbolLinkBtn) {
            symbolLinkBtn.style.color = this.getLinkColorHex(active.symbolLinkGroup);
        }

        const intervalLinkBtn = document.getElementById('interval-link-btn');
        if (intervalLinkBtn) {
            intervalLinkBtn.style.color = this.getLinkColorHex(active.intervalLinkGroup);
        }
    }

    getLinkColorHex(groupIndex) {
        const colors = ['#94a3b8', '#f87171', '#4ade80', '#60a5fa', '#facc15'];
        return colors[groupIndex] || colors[0];
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
            console.warn('[SheetManager] State save failed:', e);
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