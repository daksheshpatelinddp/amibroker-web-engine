/**
 * AmiBroker Web Workstation - Main App Controller
 */

document.addEventListener("DOMContentLoaded", () => {
    let currentSymbol = "RELIANCE.NS";

    // 1. Initialize CodeMirror Editor
    const textArea = document.getElementById("afl-code-input");
    const defaultAFL = `// Default AmiBroker Formula\nPlot( Close, "Price", "#26a69a", "line", true );\nPlot( MA(Close, 20), "20 SMA", "#2962FF", "line", true );\nPlot( EMA(Close, 50), "50 EMA", "#FF6D00", "line", true );\nPlot( Volume, "Volume", "#26a69a", "histogram", false );`;
    
    if (textArea) textArea.value = defaultAFL;

    const editor = CodeMirror.fromTextArea(textArea, {
        mode: "javascript",
        theme: "dracula",
        lineNumbers: true,
        tabSize: 2
    });

    const getCleanSymbol = (sym) => sym.toUpperCase().replace(/\.(NS|BO)$/i, "").trim();

    // 2. Async Execution Pipeline
    const loadAndRenderChart = async () => {
        const cleanKey = getCleanSymbol(currentSymbol);
        
        const badge = document.getElementById("active-symbol-name");
        if (badge) badge.innerText = `${cleanKey} (NSE)`;

        const activeOHLCVData = await window.dataEngine.fetchHistoricalData(currentSymbol);
        const code = editor.getValue();

        const aflResult = window.aflEngine.execute(code, activeOHLCVData);

        if (aflResult.success) {
            window.chartEngine.renderAFLOutput(aflResult);
        } else {
            console.error("AFL Execution Error:", aflResult.error);
        }
    };

    // Trigger Initial Render after DOM is painted
    requestAnimationFrame(() => {
        setTimeout(loadAndRenderChart, 300);
    });

    // 3. Search & Dropdown Events
    const searchInput = document.getElementById("symbol-search-input");
    const dropdown = document.getElementById("search-dropdown");

    const sampleSymbols = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "TATAMOTORS", "SBIN", "BHARTIARTL"];

    if (searchInput && dropdown) {
        searchInput.addEventListener("input", (e) => {
            const query = getCleanSymbol(e.target.value);
            if (!query) {
                dropdown.classList.add("hidden");
                return;
            }

            const matches = sampleSymbols.filter(s => s.includes(query));
            if (matches.length > 0) {
                dropdown.innerHTML = matches.map(s => `
                    <div class="search-item" data-symbol="${s}.NS">
                        <strong>${s}</strong> <span style="color:#787b86; font-size:0.75rem;">NSE</span>
                    </div>
                `).join("");
            } else {
                dropdown.innerHTML = `
                    <div class="search-item" data-symbol="${query}">
                        <strong>${query}</strong> <span style="color:#787b86; font-size:0.75rem;">Custom</span>
                    </div>`;
            }
            dropdown.classList.remove("hidden");
        });

        dropdown.addEventListener("click", (e) => {
            const item = e.target.closest(".search-item");
            if (item) {
                const selected = item.getAttribute("data-symbol");
                currentSymbol = selected;
                searchInput.value = getCleanSymbol(selected);
                dropdown.classList.add("hidden");
                loadAndRenderChart();
            }
        });
    }

    // 4. Action Buttons
    const applyBtn = document.getElementById("btn-apply-afl");
    if (applyBtn) applyBtn.addEventListener("click", loadAndRenderChart);

    const resetBtn = document.getElementById("btn-reset-afl");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            editor.setValue(defaultAFL);
            loadAndRenderChart();
        });
    }
});