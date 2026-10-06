document.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing Workstation Application Controller...");

    // Safe Category Manager Reference
    const catManager = window.categoryManager || {
        currentDatabase: "NSE",
        activeCategoryType: "all",
        activeSubFilter: "ALL",
        categories: { groups: [], sectors: [], industries: [], watchlists: ["Favorites"] },
        getSymbolsForCurrentFilter: () => [],
        addWatchlist: () => false,
        toggleFavorite: () => false,
        isFavorite: () => false
    };

    // 1. Tab Switching Controller
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTabId = button.getAttribute('data-tab');

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            if (targetTabId === 'tab-chart' && window.chartEngine) {
                setTimeout(() => window.chartEngine.resize(), 50);
            }
        });
    });

    // 2. Initialize Chart Engine
    if (window.chartEngine) {
        window.chartEngine.init();
    }

    // 3. Category & Sidebar Drawer Controller
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const btnCloseSidebar = document.getElementById('btnCloseSidebar');
    const sidebarPanel = document.getElementById('sidebarPanel');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    function openSidebar() {
        if (!sidebarPanel) return;
        sidebarPanel.classList.remove('collapsed');
        sidebarPanel.style.transform = 'translateX(0)';
        if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    }

    function closeSidebar() {
        if (!sidebarPanel) return;
        sidebarPanel.classList.add('collapsed');
        sidebarPanel.style.transform = 'translateX(-100%)';
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
        setTimeout(() => {
            if (window.chartEngine) window.chartEngine.resize();
        }, 250);
    }

    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sidebarPanel && sidebarPanel.classList.contains('collapsed')) {
                openSidebar();
            } else {
                closeSidebar();
            }
        });
    }

    if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

    // 4. Category UI View Rendering Logic
    const catTabBtns = document.querySelectorAll('.cat-tab-btn');
    const subFilterSelect = document.getElementById('categorySubFilter');
    const createWatchlistBar = document.getElementById('createWatchlistBar');
    const symbolListUI = document.getElementById('symbolList');

    function renderCategoryUI() {
        if (!subFilterSelect || !symbolListUI) return;
        const mgr = window.categoryManager || catManager;
        const currentCat = mgr.activeCategoryType;

        subFilterSelect.innerHTML = '';
        if (currentCat === 'all') {
            subFilterSelect.innerHTML = '<option value="ALL">All Symbols</option>';
            if (createWatchlistBar) createWatchlistBar.classList.add('hidden');
        } else {
            const options = mgr.categories[currentCat] || [];
            if (currentCat !== 'watchlists') {
                const optAll = document.createElement('option');
                optAll.value = "ALL";
                optAll.textContent = `All ${currentCat}`;
                subFilterSelect.appendChild(optAll);
            }
            options.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                opt.textContent = item;
                subFilterSelect.appendChild(opt);
            });

            if (createWatchlistBar) {
                if (currentCat === 'watchlists') createWatchlistBar.classList.remove('hidden');
                else createWatchlistBar.classList.add('hidden');
            }
        }

        renderSymbolList();
    }

    function renderSymbolList() {
        if (!symbolListUI) return;
        const mgr = window.categoryManager || catManager;
        const symbols = mgr.getSymbolsForCurrentFilter();
        symbolListUI.innerHTML = '';

        if (!symbols || symbols.length === 0) {
            symbolListUI.innerHTML = '<li class="symbol-item"><span class="symbol-sub">No symbols in this category.</span></li>';
            return;
        }

        symbols.forEach(item => {
            const li = document.createElement('li');
            li.className = 'symbol-item';
            li.innerHTML = `
                <div class="symbol-row-main">
                    <span class="symbol-ticker">${item.symbol}</span>
                    <span class="symbol-sub">${item.market}</span>
                </div>
                <div class="symbol-sub">${item.name}</div>
            `;

            li.addEventListener('click', () => {
                const lblActiveSymbol = document.getElementById('lblActiveSymbol');
                if (lblActiveSymbol) lblActiveSymbol.textContent = item.symbol;
                closeSidebar();
            });

            symbolListUI.appendChild(li);
        });
    }

    catTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            catTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mgr = window.categoryManager || catManager;
            mgr.activeCategoryType = btn.getAttribute('data-cat');
            mgr.activeSubFilter = "ALL";
            renderCategoryUI();
        });
    });

    if (subFilterSelect) {
        subFilterSelect.addEventListener('change', (e) => {
            const mgr = window.categoryManager || catManager;
            mgr.activeSubFilter = e.target.value;
            renderSymbolList();
        });
    }

    renderCategoryUI();
});