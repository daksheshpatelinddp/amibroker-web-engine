document.addEventListener('DOMContentLoaded', async () => {
    // Initialize CodeMirror AFL Editor
    if (window.aflEngine) {
        window.aflEngine.initEditor('afl-editor');
    }

    const currentSymbolLabel = document.getElementById('current-symbol-label');
    const symbolSearchInput = document.getElementById('symbol-search-input');
    const applyFormulaBtn = document.getElementById('apply-formula-btn');
    const symbolList = document.getElementById('symbol-list');

    let activeSymbol = "RELIANCE";

    async function loadAndRenderSymbol(symbol) {
        const cleanSymbol = symbol.trim().toUpperCase();
        if (!cleanSymbol) return;

        activeSymbol = cleanSymbol;

        if (currentSymbolLabel) {
            currentSymbolLabel.textContent = `Symbol: ${activeSymbol} (NSE)`;
        }

        // Highlight selected symbol in sidebar list
        if (symbolList) {
            Array.from(symbolList.children).forEach(li => {
                if (li.dataset.symbol === activeSymbol) {
                    li.classList.add('active');
                } else {
                    li.classList.remove('active');
                }
            });
        }

        try {
            const data = await window.dataEngine.loadSymbolData(activeSymbol);
            if (data && data.length > 0) {
                window.chartEngine.render(data);
            } else {
                console.warn(`No parquet data returned for ${activeSymbol}`);
            }
        } catch (err) {
            console.error(`Error rendering ${activeSymbol}:`, err);
        }
    }

    // Sidebar Item Clicks
    if (symbolList) {
        symbolList.addEventListener('click', async (e) => {
            if (e.target && e.target.nodeName === 'LI') {
                const selectedSymbol = e.target.dataset.symbol;
                if (selectedSymbol) {
                    await loadAndRenderSymbol(selectedSymbol);
                }
            }
        });
    }

    // Search Input Listener
    if (symbolSearchInput) {
        symbolSearchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await loadAndRenderSymbol(symbolSearchInput.value);
                symbolSearchInput.value = '';
                symbolSearchInput.blur();
            }
        });
    }

    // Formula Apply Button Listener
    if (applyFormulaBtn) {
        applyFormulaBtn.addEventListener('click', async () => {
            await loadAndRenderSymbol(activeSymbol);
        });
    }

    // Initialize DuckDB and render default RELIANCE symbol
    await window.dataEngine.init();
    await loadAndRenderSymbol(activeSymbol);

    // Initial resize trigger for TradingView canvas
    setTimeout(() => {
        if (window.chartEngine) {
            window.chartEngine.handleResize();
        }
    }, 250);
});