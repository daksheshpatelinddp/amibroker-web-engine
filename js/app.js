/**
 * js/app.js
 * App Orchestrator linking Layout, CategoryManager, and DataEngine.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Category Manager
    const categoryMgr = new CategoryManager();
    
    // 2. DOM Element Handles
    const drawer = document.getElementById('category-drawer');
    const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
    const btnCloseDrawer = document.getElementById('btn-close-drawer');
    const quickSearchInput = document.getElementById('quick-search-input');
    const searchResultsDropdown = document.getElementById('search-results-dropdown');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const statusBadge = document.getElementById('data-status-badge');
    const activeSymbolTitle = document.getElementById('active-symbol-title');
    const workspaceTabsBar = document.getElementById('workspace-tabs-bar');

    let openSymbolTabs = [];
    let activeSymbol = null;

    // 3. Initialize DataEngine & populate symbols
    try {
        if (statusBadge) {
            statusBadge.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting R2 Parquet...`;
        }
        
        await window.dataEngine.init();
        const availableSymbols = await window.dataEngine.getAvailableSymbols();

        // Populate Category Manager with discovered symbols if local storage is empty
        if (categoryMgr.getAllSymbols().length === 0 && availableSymbols.length > 0) {
            availableSymbols.forEach(sym => {
                categoryMgr.addSymbol(sym, "NSE", "General", "Equities");
            });
        }

        if (statusBadge) {
            statusBadge.classList.add('ready');
            statusBadge.innerHTML = `<i class="fa-solid fa-database"></i> DuckDB R2 Ready (${window.dataEngine.availableYears.length} Yrs)`;
        }
    } catch (err) {
        console.error("Failed to initialize DataEngine:", err);
        if (statusBadge) {
            statusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Data Engine Error`;
        }
    }

    // 4. Drawer Toggle Logic
    btnToggleDrawer?.addEventListener('click', () => drawer.classList.toggle('open'));
    btnCloseDrawer?.addEventListener('click', () => drawer.classList.remove('open'));

    // 5. Drawer Tab Switcher
    document.querySelectorAll('.drawer-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', (e) => {
            document.querySelectorAll('.drawer-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

            e.target.classList.add('active');
            const paneId = e.target.getAttribute('data-tab');
            document.getElementById(paneId)?.classList.add('active');
        });
    });

    // 6. Global Symbol Load Function
    window.loadSymbol = async function(symbol) {
        if (!symbol) return;
        const cleanSym = symbol.trim().toUpperCase();
        activeSymbol = cleanSym;

        // Add to workspace tab pills if not present
        if (!openSymbolTabs.includes(cleanSym)) {
            openSymbolTabs.push(cleanSym);
            renderSymbolTabs();
        } else {
            renderSymbolTabs();
        }

        if (activeSymbolTitle) {
            activeSymbolTitle.textContent = cleanSym;
        }

        if (statusBadge) {
            statusBadge.className = 'data-status-badge loading';
            statusBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Fetching ${cleanSym}...`;
        }

        try {
            // Queries across 2000 -> currentYear parquet range
            const data = await window.dataEngine.getSymbolData(cleanSym);
            console.log(`[App] Successfully fetched ${data.length} EOD records for ${cleanSym}`, data);

            if (statusBadge) {
                statusBadge.className = 'data-status-badge ready';
                statusBadge.innerHTML = `<i class="fa-solid fa-check"></i> ${data.length} Bars Loaded`;
            }

            // Phase 3 Chart Rendering call:
            // if (window.chartEngine) window.chartEngine.render('chart-render-1', data);

        } catch (err) {
            console.error(`[App] Error loading symbol ${cleanSym}:`, err);
            if (statusBadge) {
                statusBadge.className = 'data-status-badge error';
                statusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Fetch Error`;
            }
        }
    };

    // Render workspace tabs
    function renderSymbolTabs() {
        if (!workspaceTabsBar) return;
        workspaceTabsBar.innerHTML = '';

        openSymbolTabs.forEach(sym => {
            const tabPill = document.createElement('div');
            tabPill.className = `symbol-tab-pill ${sym === activeSymbol ? 'active' : ''}`;
            
            tabPill.innerHTML = `
                <span>${sym}</span>
                <i class="fa-solid fa-xmark close-pill" data-sym="${sym}"></i>
            `;

            tabPill.addEventListener('click', (e) => {
                if (e.target.classList.contains('close-pill')) {
                    e.stopPropagation();
                    const targetSym = e.target.getAttribute('data-sym');
                    openSymbolTabs = openSymbolTabs.filter(s => s !== targetSym);
                    if (activeSymbol === targetSym) {
                        activeSymbol = openSymbolTabs.length > 0 ? openSymbolTabs[openSymbolTabs.length - 1] : null;
                        if (activeSymbol) window.loadSymbol(activeSymbol);
                        else if (activeSymbolTitle) activeSymbolTitle.textContent = 'Select a Symbol';
                    }
                    renderSymbolTabs();
                } else {
                    window.loadSymbol(sym);
                }
            });

            workspaceTabsBar.appendChild(tabPill);
        });
    }

    // 7. Quick Search Interactions
    quickSearchInput?.addEventListener('input', (e) => {
        const query = e.target.value.trim().toUpperCase();
        if (query.length > 0) {
            btnClearSearch?.classList.remove('hidden');
            const allSymbols = categoryMgr.getAllSymbols();
            const filtered = allSymbols.filter(s => s.symbol.includes(query)).slice(0, 10);

            if (filtered.length > 0) {
                searchResultsDropdown.innerHTML = filtered.map(item => `
                    <div class="search-result-item" data-symbol="${item.symbol}">
                        <strong>${item.symbol}</strong>
                        <small>${item.group} / ${item.sector}</small>
                    </div>
                `).join('');
                searchResultsDropdown.classList.remove('hidden');
            } else {
                searchResultsDropdown.innerHTML = `<div class="search-result-item empty">No symbol found for "${query}"</div>`;
                searchResultsDropdown.classList.remove('hidden');
            }
        } else {
            btnClearSearch?.classList.add('hidden');
            searchResultsDropdown.classList.add('hidden');
        }
    });

    searchResultsDropdown?.addEventListener('click', (e) => {
        const item = e.target.closest('.search-result-item');
        if (item && item.dataset.symbol) {
            window.loadSymbol(item.dataset.symbol);
            searchResultsDropdown.classList.add('hidden');
            if (quickSearchInput) quickSearchInput.value = '';
            btnClearSearch?.classList.add('hidden');
        }
    });

    btnClearSearch?.addEventListener('click', () => {
        if (quickSearchInput) quickSearchInput.value = '';
        btnClearSearch.classList.add('hidden');
        searchResultsDropdown?.classList.add('hidden');
    });
});