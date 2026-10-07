// js/app.js

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize AFL CodeMirror Editor
    if (window.aflEngine) {
        window.aflEngine.initEditor('afl-editor');
    }

    const currentSymbolLabel = document.getElementById('current-symbol-label');
    const symbolSearchInput = document.getElementById('symbol-search-input');
    const applyFormulaBtn = document.getElementById('apply-formula-btn');

    let activeSymbol = "RELIANCE";

    async function loadAndRenderSymbol(symbol) {
        const cleanSymbol = symbol.trim().toUpperCase();
        if (!cleanSymbol) return;

        activeSymbol = cleanSymbol;

        if (currentSymbolLabel) {
            currentSymbolLabel.textContent = `Symbol: ${activeSymbol} (NSE)`;
        }

        try {
            const data = await window.dataEngine.loadSymbolData(activeSymbol);
            if (data && data.length > 0) {
                window.chartEngine.render(data);
            } else {
                console.warn(`No data found for ${activeSymbol}`);
            }
        } catch (err) {
            console.error(`Error loading symbol ${activeSymbol}:`, err);
        }
    }

    // Trigger DuckDB init and render initial symbol
    await window.dataEngine.init();
    await loadAndRenderSymbol(activeSymbol);

    // Fix Symbol Search Input Listeners
    if (symbolSearchInput) {
        symbolSearchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await loadAndRenderSymbol(symbolSearchInput.value);
                symbolSearchInput.blur();
            }
        });

        symbolSearchInput.addEventListener('change', async () => {
            if (symbolSearchInput.value) {
                await loadAndRenderSymbol(symbolSearchInput.value);
            }
        });
    }

    // Apply AFL Formula Handler
    if (applyFormulaBtn) {
        applyFormulaBtn.addEventListener('click', async () => {
            await loadAndRenderSymbol(activeSymbol);
        });
    }

    // Force recalculation of chart container dimensions after mount
    setTimeout(() => {
        if (window.chartEngine) {
            window.chartEngine.handleResize();
        }
    }, 200);
});