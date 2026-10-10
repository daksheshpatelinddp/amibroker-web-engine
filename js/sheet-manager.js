class SheetManager {
  constructor(app) {
    this.app = app;
    this.sheets = [];
    this.activeSheetId = null;
    this.sheetCounter = 1;

    this.container = document.getElementById('sheets-list');
    this.addBtn = document.getElementById('add-sheet-btn');

    this.init();
  }

  init() {
    if (this.addBtn) {
      this.addBtn.addEventListener('click', () => this.addSheet());
    }
    // Initialize default sheet
    this.addSheet();
  }

  addSheet(name = null) {
    const id = 'sheet_' + Date.now() + Math.random().toString(36.substring(2, 5));
    const sheetName = name || `Sheet ${this.sheetCounter++}`;
    
    const sheet = {
      id: id,
      name: sheetName,
      drawings: [],
      studies: []
    };

    this.sheets.push(sheet);
    this.setActiveSheet(id);
    this.render();
  }

  removeSheet(id, e) {
    if (e) e.stopPropagation();
    if (this.sheets.length <= 1) {
      alert("At least one sheet must remain.");
      return;
    }

    const index = this.sheets.findIndex(s => s.id === id);
    if (index !== -1) {
      this.sheets.splice(index, 1);
      
      if (this.activeSheetId === id) {
        const nextActive = this.sheets[Math.max(0, index - 1)];
        this.setActiveSheet(nextActive.id);
      } else {
        this.render();
      }
    }
  }

  setActiveSheet(id) {
    this.activeSheetId = id;
    this.render();
    if (this.app && typeof this.app.onSheetChange === 'function') {
      this.app.onSheetChange(this.getActiveSheet());
    }
  }

  getActiveSheet() {
    return this.sheets.find(s => s.id === this.activeSheetId);
  }

  renameSheet(id, newName) {
    const sheet = this.sheets.find(s => s.id === id);
    if (sheet && newName.trim()) {
      sheet.name = newName.trim();
    }
    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    this.sheets.forEach(sheet => {
      const tab = document.createElement('div');
      tab.className = `sheet-tab ${sheet.id === this.activeSheetId ? 'active' : ''}`;
      
      const titleSpan = document.exit ? null : document.createElement('span');
      titleSpan.textContent = sheet.name;
      tab.appendChild(titleSpan);

      // Inline renaming on double click
      tab.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'sheet-tab-input';
        input.value = sheet.name;

        const finishRename = () => {
          this.renameSheet(sheet.id, input.value);
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') {
            finishRename();
          } else if (evt.key === 'Escape') {
            this.render();
          }
        });

        tab.replaceChild(input, titleSpan);
        input.focus();
        input.select();
      });

      // Tab selection click
      tab.addEventListener('click', () => {
        if (this.activeSheetId !== sheet.id) {
          this.setActiveSheet(sheet.id);
        }
      });

      // Remove button (×) if more than 1 sheet exists
      if (this.sheets.length > 1) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Remove Sheet';
        closeBtn.addEventListener('click', (e) => this.removeSheet(sheet.id, e));
        tab.appendChild(closeBtn);
      }

      this.container.appendChild(tab);
    });
  }
}

window.SheetManager = SheetManager;