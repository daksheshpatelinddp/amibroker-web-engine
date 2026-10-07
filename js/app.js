/**
 * AmiBroker Web Workstation - Application Controller
 * Wires UI controls, CodeMirror editor, R2 data fetching, and chart rendering.
 */

document.addEventListener("DOMContentLoaded", () => {
    let currentSymbol = "RELIANCE.NS";

    // 1. Initialize CodeMirror AFL Editor with Default Candlestick AFL Formula
    const textArea = document.getElementById("afl-code-input");
    const defaultAFL = `// Default AmiBroker Formula
Plot( Close, "Price", "#26a69a", "candle", true );
Plot( MA(Close, 20), "20 SMA", "#2962FF", "line", true );
Plot( EMA(Close, 50), "50 EMA", "#FF6D00", "line", true );
Plot( Volume, "Volume", "#26a69a", "histogram", false );`;

    if (textArea) {
        textArea.value = defaultAFL;
    }

    const editor = CodeMirror.fromTextArea(textArea, {
        mode: "javascript",
        theme: "dracula",
        lineNumbers: true,
        tabSize: 2
    });

    // Helper: Strip symbol extension for R2 lookup matching
    const getCleanSymbol = (sym) => sym.toUpperCase().replace(/\.(NS|BO)$/i, "").trim();

    // 2. Main Chart Fetching & AFL Render Pipeline
    const loadAndRenderChart = async () => {
        const cleanKey = getCleanSymbol(currentSymbol);

        // Update Top Bar Symbol Badge
        const badge = document.getElementById("active-symbol-name");
        if (badge) {
            badge.innerText = `${cleanKey} (${currentSymbol.includes('.NS') ? 'NSE' : 'R2'})`;
        }

        // Fetch dataset (from Cloudflare R2 Parquet via DuckDB or local generator)
        const activeOHLCVData = await window.dataEngine.fetchHistoricalData(currentSymbol);
        const code = editor.getValue();

        // Run AFL Vector Interpreter
        const aflResult = window.aflEngine.execute(code, activeOHLCVData);

        if (aflResult.success) {
            window.chartEngine.renderAFLOutput(aflResult);
        } else {
            console.error("AFL Execution Error:", aflResult.error);
        }
    };

    // Ensure DOM layout is painted before initial chart plot
    requestAnimationFrame(() => {
        setTimeout(loadAndRenderChart, 350);
    });

    // 3. Symbol Search Input & Dropdown Controller
    const searchInput = document.getElementById("symbol-search-input");
    const dropdown = document.getElementById("search-dropdown");

    const sampleSymbols = [
        "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
        "TATAMOTORS", "SBIN", "BHARTIARTL", "ITC", "LTIM"
    ];

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
                        <strong>${s}</strong>
                        <span style="color:#787b86; font-size:0.75rem;">NSE</span>
                    </div>
                `).join("");
            } else {
                dropdown.innerHTML = `
                    <div class="search-item" data-symbol="${query}">
                        <strong>${query}</strong>
                        <span style="color:#787b86; font-size:0.75rem;">Custom R2 File</span>
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

        // Close dropdown when tapping outside
        document.addEventListener("click", (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add("hidden");
            }
        });
    }

    // 4. Sidebar Category Tree Item Selection
    document.querySelectorAll(".symbol-item").forEach(item => {
        item.addEventListener("click", (e) => {
            const selected = e.target.getAttribute("data-symbol");
            currentSymbol = selected;
            if (searchInput) searchInput.value = getCleanSymbol(selected);

            document.querySelectorAll(".symbol-item").forEach(el => el.classList.remove("active"));
            e.target.classList.add("active");

            loadAndRenderChart();
        });
    });

    // 5. AFL Action Buttons
    const applyBtn = document.getElementById("btn-apply-afl");
    if (applyBtn) {
        applyBtn.addEventListener("click", loadAndRenderChart);
    }

    const resetBtn = document.getElementById("btn-reset-afl");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            editor.setValue(defaultAFL);
            loadAndRenderChart();
        });
    }

    // 6. AI Assistant Panel Toggle & Code Generation
    const aiPromptBar = document.getElementById("ai-prompt-bar");
    const toggleAiBtn = document.getElementById("btn-toggle-ai");

    if (toggleAiBtn && aiPromptBar) {
        toggleAiBtn.addEventListener("click", () => {
            aiPromptBar.classList.toggle("hidden");
        });
    }

    const generateAiBtn = document.getElementById("btn-generate-ai");
    if (generateAiBtn) {
        generateAiBtn.addEventListener("click", () => {
            const promptInput = document.getElementById("ai-prompt-input");
            if (!promptInput || !promptInput.value) return;

            const prompt = promptInput.value.toLowerCase();
            let code = defaultAFL;

            if (prompt.includes("rsi")) {
                code += `\nPlot( RSI(Close, 14), "RSI 14", "#ab47bc", "line", false );`;
            }
            if (prompt.includes("ema") || prompt.includes("ma") || prompt.includes("moving average")) {
                code += `\nPlot( EMA(Close, 200), "200 EMA", "#e91e63", "line", true );`;
            }

            editor.setValue(code);
            loadAndRenderChart();
        });
    }
});