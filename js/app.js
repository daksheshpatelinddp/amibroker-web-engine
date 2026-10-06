document.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing Workstation Application Controller...");

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

            logConsole(`Switched tab to: ${button.textContent.trim()}`);
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
        sidebarPanel.classList.remove('collapsed');
        if (window.innerWidth <= 768) {
            sidebarBackdrop.classList.add('active');
        }
    }

    function closeSidebar() {
        sidebarPanel.classList.add('collapsed');
        sidebarBackdrop.classList.remove('active');
        setTimeout(() => {
            if (window.chartEngine) window.chartEngine.resize();
        }, 250);
    }

    if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', openSidebar);
    if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

    // 4. Category UI View Rendering Logic
    const catTabBtns = document.querySelectorAll('.cat-tab-btn');
    const subFilterSelect = document.getElementById('categorySubFilter');
    const createWatchlistBar = document.getElementById('createWatchlistBar');
    const symbolListUI = document.getElementById('symbolList');

    function renderCategoryUI() {
        const catManager = window.categoryManager;
        const currentCat = catManager.activeCategoryType;

        // Render sub-filter choices
        subFilterSelect.innerHTML = '';
        if (currentCat === 'all') {
            subFilterSelect.innerHTML = '<option value="ALL">All Symbols</option>';
            createWatchlistBar.classList.add('hidden');
        } else {
            const options = catManager.categories[currentCat] || [];
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

            if (currentCat === 'watchlists') {
                createWatchlistBar.classList.remove('hidden');
            } else {
                createWatchlistBar.classList.add('hidden');
            }
        }

        renderSymbolList();
    }

    function renderSymbolList() {
        const catManager = window.categoryManager;
        const symbols = catManager.getSymbolsForCurrentFilter();
        symbolListUI.innerHTML = '';

        if (symbols.length === 0) {
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
                <div class="symbol-tags">
                    <span class="tag-badge">${item.sector}</span>
                    <span class="tag-badge">${item.industry}</span>
                </div>
            `;

            li.addEventListener('click', () => {
                document.querySelectorAll('.symbol-item').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                
                // Update chart header symbol
                const lblActiveSymbol = document.getElementById('lblActiveSymbol');
                if (lblActiveSymbol) lblActiveSymbol.textContent = item.symbol;

                // Update Star Button state
                updateStarButton(item.symbol.split('.')[0]);

                logConsole(`Selected Symbol: ${item.symbol}`);
                if (window.innerWidth <= 768) closeSidebar();
            });

            symbolListUI.appendChild(li);
        });
    }

    // Category Sub-Tab Click Handler
    catTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            catTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.categoryManager.activeCategoryType = btn.getAttribute('data-cat');
            window.categoryManager.activeSubFilter = "ALL";
            renderCategoryUI();
        });
    });

    subFilterSelect.addEventListener('change', (e) => {
        window.categoryManager.activeSubFilter = e.target.value;
        renderSymbolList();
    });

    // Create New Watchlist
    const btnCreateWatchlist = document.getElementById('btnCreateWatchlist');
    const txtNewWatchlist = document.getElementById('txtNewWatchlist');
    if (btnCreateWatchlist && txtNewWatchlist) {
        btnCreateWatchlist.addEventListener('click', () => {
            const name = txtNewWatchlist.value.trim();
            if (name && window.categoryManager.addWatchlist(name)) {
                txtNewWatchlist.value = '';
                logConsole(`Created Watchlist: "${name}"`);
                renderCategoryUI();
            }
        });
    }

    // Favorite Toggle Star
    const btnToggleFavorite = document.getElementById('btnToggleFavorite');
    function updateStarButton(tickerKey) {
        if (!btnToggleFavorite) return;
        const isFav = window.categoryManager.isFavorite(tickerKey);
        if (isFav) {
            btnToggleFavorite.classList.add('active');
            btnToggleFavorite.textContent = '★';
        } else {
            btnToggleFavorite.classList.remove('active');
            btnToggleFavorite.textContent = '☆';
        }
    }

    if (btnToggleFavorite) {
        btnToggleFavorite.addEventListener('click', () => {
            const currentSymbolText = document.getElementById('lblActiveSymbol').textContent;
            const tickerKey = currentSymbolText.split('.')[0];
            const nowFav = window.categoryManager.toggleFavorite(tickerKey);
            updateStarButton(tickerKey);
            logConsole(`${nowFav ? 'Added' : 'Removed'} ${currentSymbolText} ${nowFav ? 'to' : 'from'} Favorites`);
        });
    }

    // Database Switcher
    const dbSelect = document.getElementById('dbSelect');
    if (dbSelect) {
        dbSelect.addEventListener('change', (e) => {
            window.categoryManager.currentDatabase = e.target.value;
            logConsole(`Switched Market Database to: ${e.target.value}`);
            renderSymbolList();
        });
    }

    // Initialize Category Drawer State
    renderCategoryUI();

    // 5. Console Dock Toggle
    const toggleConsoleBtn = document.getElementById('toggleConsole');
    const bottomDock = document.querySelector('.bottom-dock');
    if (toggleConsoleBtn && bottomDock) {
        toggleConsoleBtn.addEventListener('click', () => {
            bottomDock.classList.toggle('collapsed');
            const icon = toggleConsoleBtn.querySelector('.dock-icon');
            if (icon) icon.textContent = bottomDock.classList.contains('collapsed') ? '▲' : '▼';
            setTimeout(() => {
                if (window.chartEngine) window.chartEngine.resize();
            }, 250);
        });
    }

    function logConsole(message, type = 'info') {
        const consoleLog = document.getElementById('consoleLog');
        if (!consoleLog) return;
        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        consoleLog.appendChild(line);
        consoleLog.scrollTop = consoleLog.scrollHeight;
    }

    window.logConsole = logConsole;
});