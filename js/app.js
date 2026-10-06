document.addEventListener('DOMContentLoaded', () => {
    const mgr = window.categoryManager;
    let activeSymbol = "HDFCBANK.NS";

    // UI Elements
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const btnCloseSidebar = document.getElementById('btnCloseSidebar');
    const sidebarPanel = document.getElementById('sidebarPanel');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const catTabBtns = document.querySelectorAll('.cat-tab-btn');
    const subFilterSelect = document.getElementById('categorySubFilter');
    const symbolListUI = document.getElementById('symbolList');
    
    const txtNewCategoryName = document.getElementById('txtNewCategoryName');
    const btnCreateCategory = document.getElementById('btnCreateCategory');
    const txtAddSymbol = document.getElementById('txtAddSymbol');
    const btnAddSingleSymbol = document.getElementById('btnAddSingleSymbol');
    const fileImportTxt = document.getElementById('fileImportTxt');
    const btnClearCurrentCategory = document.getElementById('btnClearCurrentCategory');
    
    const symbolSearchInput = document.getElementById('symbolSearchInput');
    const searchResults = document.getElementById('searchResults');
    const lblActiveSymbol = document.getElementById('lblActiveSymbol');
    const btnToggleFavorite = document.getElementById('btnToggleFavorite');

    // Drawer Logic
    function openSidebar() {
        if (sidebarPanel) {
            sidebarPanel.classList.remove('collapsed');
            if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
        }
    }

    function closeSidebar() {
        if (sidebarPanel) {
            sidebarPanel.classList.add('collapsed');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
        }
    }

    if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', openSidebar);
    if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

    // Chart Symbol Loader
    function loadSymbolToChart(symbol) {
        activeSymbol = symbol;
        if (lblActiveSymbol) lblActiveSymbol.textContent = symbol;
        
        // Sync Favorite Button State
        if (btnToggleFavorite) {
            btnToggleFavorite.textContent = mgr.isFavorite(symbol) ? "★ Favorited" : "⭐ Favorite";
        }
        
        closeSidebar();
        if (searchResults) searchResults.classList.add('hidden');
    }

    // Toggle Favorite Action
    if (btnToggleFavorite) {
        btnToggleFavorite.addEventListener('click', () => {
            mgr.toggleFavorite(activeSymbol);
            loadSymbolToChart(activeSymbol);
            if (mgr.activeCategoryType === 'favorites') renderCategoryUI();
        });
    }

    // Category & Sub-Filter UI Rendering
    function renderCategoryUI() {
        const currentType = mgr.activeCategoryType;
        const folders = mgr.getFolderNames(currentType);

        // Render Folder Dropdown
        subFilterSelect.innerHTML = '';
        if (currentType === 'favorites') {
            subFilterSelect.innerHTML = '<option value="ALL">All Favorites</option>';
            subFilterSelect.disabled = true;
            if (txtNewCategoryName) txtNewCategoryName.disabled = true;
        } else {
            subFilterSelect.disabled = false;
            if (txtNewCategoryName) txtNewCategoryName.disabled = false;

            const optAll = document.createElement('option');
            optAll.value = "ALL";
            optAll.textContent = `All ${currentType.toUpperCase()}`;
            subFilterSelect.appendChild(optAll);

            folders.forEach(folder => {
                const opt = document.createElement('option');
                opt.value = folder;
                opt.textContent = folder;
                if (folder === mgr.activeSubFilter) opt.selected = true;
                subFilterSelect.appendChild(opt);
            });
        }

        renderSymbolList();
    }

    function renderSymbolList() {
        const symbols = mgr.getSymbolsForCurrentFilter();
        symbolListUI.innerHTML = '';

        if (!symbols || symbols.length === 0) {
            symbolListUI.innerHTML = '<li class="symbol-item"><span class="symbol-sub">No symbols found.</span></li>';
            return;
        }

        symbols.forEach(item => {
            const li = document.createElement('li');
            li.className = 'symbol-item';
            li.innerHTML = `
                <div class="symbol-row-main">
                    <span class="symbol-ticker">${item.symbol}</span>
                    <button class="btn-erase" style="background:none; border:none; color:#ff5252; cursor:pointer;">&times;</button>
                </div>
                <div class="symbol-sub">${item.name}</div>
            `;

            // Open Chart on Click
            li.addEventListener('click', (e) => {
                if (!e.target.classList.contains('btn-erase')) {
                    loadSymbolToChart(item.symbol);
                }
            });

            // Erase Single Symbol
            li.querySelector('.btn-erase').addEventListener('click', (e) => {
                e.stopPropagation();
                mgr.removeSymbolFromFolder(mgr.activeCategoryType, mgr.activeSubFilter, item.symbol);
                renderSymbolList();
            });

            symbolListUI.appendChild(li);
        });
    }

    // Category Tab Handler
    catTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            catTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            mgr.activeCategoryType = btn.getAttribute('data-cat');
            mgr.activeSubFilter = "ALL";
            renderCategoryUI();
        });
    });

    if (subFilterSelect) {
        subFilterSelect.addEventListener('change', (e) => {
            mgr.activeSubFilter = e.target.value;
            renderSymbolList();
        });
    }

    // Create New Folder Action
    if (btnCreateCategory) {
        btnCreateCategory.addEventListener('click', () => {
            const name = txtNewCategoryName.value.trim();
            if (name && mgr.createFolder(mgr.activeCategoryType, name)) {
                txtNewCategoryName.value = '';
                mgr.activeSubFilter = name;
                renderCategoryUI();
            }
        });
    }

    // Add Single Symbol
    if (btnAddSingleSymbol) {
        btnAddSingleSymbol.addEventListener('click', () => {
            const sym = txtAddSymbol.value.trim();
            if (sym) {
                mgr.addSymbolToFolder(mgr.activeCategoryType, mgr.activeSubFilter, sym);
                txtAddSymbol.value = '';
                renderSymbolList();
            }
        });
    }

    // Import TXT File (One Symbol Per Line)
    if (fileImportTxt) {
        fileImportTxt.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                mgr.importTxtToFolder(mgr.activeCategoryType, mgr.activeSubFilter, event.target.result);
                renderSymbolList();
                fileImportTxt.value = '';
            };
            reader.readAsText(file);
        });
    }

    // Clear Current Category
    if (btnClearCurrentCategory) {
        btnClearCurrentCategory.addEventListener('click', () => {
            if (confirm("Are you sure you want to erase all symbols in this selection?")) {
                mgr.clearFolder(mgr.activeCategoryType, mgr.activeSubFilter);
                renderSymbolList();
            }
        });
    }

    // Top Header Search Box Logic
    if (symbolSearchInput) {
        symbolSearchInput.addEventListener('input', (e) => {
            const q = e.target.value.trim().toUpperCase();
            if (!q) {
                searchResults.classList.add('hidden');
                return;
            }

            const matches = mgr.masterSymbols.filter(s => s.symbol.includes(q) || s.name.toUpperCase().includes(q));
            searchResults.innerHTML = '';

            if (matches.length > 0) {
                searchResults.classList.remove('hidden');
                matches.forEach(m => {
                    const li = document.createElement('li');
                    li.className = 'symbol-item';
                    li.innerHTML = `<span class="symbol-ticker">${m.symbol}</span> <span class="symbol-sub">${m.name}</span>`;
                    li.addEventListener('click', () => {
                        loadSymbolToChart(m.symbol);
                        symbolSearchInput.value = '';
                    });
                    searchResults.appendChild(li);
                });
            } else {
                searchResults.classList.add('hidden');
            }
        });
    }

    // Initial Setup
    renderCategoryUI();
});