document.addEventListener("DOMContentLoaded", () => {
    let currentSymbol = "RELIANCE.NS";

    // Initialize AFL Editor
    const textArea = document.getElementById("afl-code-input");
    const defaultAFL = `// Default AmiBroker Formula\nPlot( Close, "Price", "#26a69a", "line", true );\nPlot( MA(Close, 20), "20 SMA", "#2962FF", "line", true );\nPlot( EMA(Close, 50), "50 EMA", "#FF6D00", "line", true );\nPlot( Volume, "Volume", "#26a69a", "histogram", false );`;
    
    textArea.value = defaultAFL;

    const editor = CodeMirror.fromTextArea(textArea, {
        mode: "javascript",
        theme: "dracula",
        lineNumbers: true,
        tabSize: 2
    });

    // Helper: Strip extension for R2 requests
    const getCleanSymbol = (sym) => sym.toUpperCase().replace(/\.(NS|BO)$/i, "").trim();

    // Main Chart Execution & R2 Fetch Pipeline
    const loadAndRenderChart = async () => {
        const cleanKey = getCleanSymbol(currentSymbol);
        
        // Update header label
        const badge = document.getElementById("active-symbol-name");
        if (badge) {
            badge.innerText = `${cleanKey} (${currentSymbol.includes('.NS') ? 'NSE' : 'R2'})`;
        }

        // Load data from R2 engine
        const activeOHLCVData = await window.dataEngine.fetchHistoricalData(currentSymbol);
        const code = editor.getValue();

        // Execute AFL engine
        const aflResult = window.aflEngine.execute(code, activeOHLCVData);

        if (aflResult.success) {
            window.chartEngine.renderAFLOutput(aflResult);
        } else {
            console.error("AFL Parsing Error:", aflResult.error);
        }
    };

    // Initial load
    setTimeout(loadAndRenderChart, 200);

    // Symbol Search & Dropdown Handler
    const searchInput = document.getElementById("symbol-search-input");
    const dropdown = document.getElementById("search-dropdown");

    const sampleSymbols = [
        "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
        "TATAMOTORS", "SBIN", "BHARTIARTL", "ITC", "LTIM"
    ];

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toUpperCase().replace(/\.(NS|BO)$/i, "").trim();
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
                        <strong>${query}</strong> <span style="color:#787b86; font-size:0.75rem;">Custom R2 Key</span>
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

    // AFL Apply Button
    const applyBtn = document.getElementById("btn-apply-afl");
    if (applyBtn) {
        applyBtn.addEventListener("click", loadAndRenderChart);
    }
});