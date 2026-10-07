// js/app.js

document.addEventListener('DOMContentLoaded', async () => {
    const currentSymbolLabel = document.getElementById('current-symbol-label');
    const symbolSearchInput = document.getElementById('symbol-search-input');
    const applyFormulaBtn = document.getElementById('apply-formula-btn');
    
    let activeSymbol = "RELIANCE";

    async function loadAndRenderSymbol(symbol) {
        try {
            if (currentSymbolLabel) {
                currentSymbolLabel.textContent = `Symbol: ${symbol} (NSE)`;
            }

            // Load Parquet data via DuckDB
            const data = await window.dataEngine.loadSymbolData(symbol);
            
            if (data && data.length > 0) {
                window.chartEngine.render(data);
                console.log(`Successfully plotted ${data.length} candles for ${symbol}`);
            } else {
                console.warn(`No valid data returned for symbol: ${symbol}`);
            }
        } catch (error) {
            console.error(`Failed to load and render symbol ${symbol}:`, error);
        }
    }

    // Initialize DuckDB & render RELIANCE on startup
    await window.dataEngine.init();
    await loadAndRenderSymbol(activeSymbol);

    // Handle Symbol Search Input / Change
    if (symbolSearchInput) {
        symbolSearchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const newSymbol = symbolSearchInput.value.trim().toUpperCase();
                if (newSymbol) {
                    activeSymbol = newSymbol;
                    await loadAndRenderSymbol(activeSymbol);
                    symbolSearchInput.value = '';
                }
            }
        });
    }

    // Apply AFL Formula Handler
    if (applyFormulaBtn) {
        applyFormulaBtn.addEventListener('click', async () => {
            console.log("Applying AFL Formula...");
            await loadAndRenderSymbol(activeSymbol);
        });
    }
});