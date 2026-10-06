/**
 * AmiBroker Web Workstation - Application Controller
 */

document.addEventListener("DOMContentLoaded", () => {
    let currentSymbol = "RELIANCE.NS";

    // 1. Initialize CodeMirror AFL Editor
    const textArea = document.getElementById("afl-code-input");
    const defaultAFL = `// Default AmiBroker Formula\nPlot( Close, "Price", "#26a69a", "line", true );\nPlot( MA(Close, 20), "20 SMA", "#2962FF", "line", true );\nPlot( EMA(Close, 50), "50 EMA", "#FF6D00", "line", true );\nPlot( Volume, "Volume", "#26a69a", "histogram", false );`;
    
    textArea.value = defaultAFL;

    const editor = CodeMirror.fromTextArea(textArea, {
        mode: "javascript",
        theme: "dracula",
        lineNumbers: true,
        tabSize: 2
    });

    // 2. Sample Data Generator for Symbol Selection
    const fetchSymbolData = (symbol) => {
        let data = [];
        let baseTime = new Date(2025, 6, 1).getTime() / 1000;
        let price = 100 + (symbol.length * 35);

        for (let i = 0; i < 220; i++) {
            let change = (Math.random() - 0.48) * (price * 0.025);
            let open = price;
            let close = price + change;
            let high = Math.max(open, close) + Math.random() * (price * 0.01);
            let low = Math.min(open, close) - Math.random() * (price * 0.01);
            let volume = Math.floor(Math.random() * 80000) + 15000;

            let timeString = new Date((baseTime + i * 86400) * 1000).toISOString().split('T')[0];

            data.push({ time: timeString, open, high, low, close, volume });
            price = close;
        }
        return data;
    };

    let activeOHLCVData = fetchSymbolData(currentSymbol);

    // 3. Main Chart Execution Pipeline
    const loadAndRenderChart = () => {
        document.getElementById("active-symbol-name").innerText = currentSymbol;
        const code = editor.getValue();

        // Execute AFL Formula over active dataset
        const aflResult = window.aflEngine.execute(code, activeOHLCVData);

        if (aflResult.success) {
            window.chartEngine.renderAFLOutput(aflResult);
        } else {
            alert("AFL Parsing Error: " + aflResult.error);
        }
    };

    // Trigger initial render after canvas boot
    setTimeout(() => {
        loadAndRenderChart();
    }, 200);

    // 4. Symbol Search Box Logic
    const searchInput = document.getElementById("symbol-search-input");
    const dropdown = document.getElementById("search-dropdown");

    const sampleSymbols = [
        "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
        "TATAMOTORS.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "LTIM.NS"
    ];

    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toUpperCase().trim();
        if (!query) {
            dropdown.classList.add("hidden");
            return;
        }

        const matches = sampleSymbols.filter(s => s.includes(query));
        if (matches.length > 0) {
            dropdown.innerHTML = matches.map(s => `<div class="search-item" data-symbol="${s}">${s}</div>`).join("");
        } else {
            dropdown.innerHTML = `<div class="search-item" data-symbol="${query}">${query} (Custom Symbol)</div>`;
        }
        dropdown.classList.remove("hidden");
    });

    dropdown.addEventListener("click", (e) => {
        const item = e.target.closest(".search-item");
        if (item) {
            const selected = item.getAttribute("data-symbol");
            selectSymbol(selected);
            dropdown.classList.add("hidden");
            searchInput.value = selected;
        }
    });

    // Handle Symbol Selection Change
    const selectSymbol = (symbol) => {
        currentSymbol = symbol;
        activeOHLCVData = fetchSymbolData(currentSymbol);
        
        // Highlight active symbol in tree sidebar
        document.querySelectorAll(".symbol-item").forEach(el => {
            if (el.getAttribute("data-symbol") === symbol) {
                el.classList.add("active");
            } else {
                el.classList.remove("active");
            }
        });

        loadAndRenderChart();
    };

    // Sidebar Category Tree Item Selection
    document.querySelectorAll(".symbol-item").forEach(item => {
        item.addEventListener("click", (e) => {
            const selected = e.target.getAttribute("data-symbol");
            selectSymbol(selected);
            searchInput.value = selected;
        });
    });

    // Close dropdown on outside tap
    document.addEventListener("click", (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add("hidden");
        }
    });

    // 5. AFL Action Buttons
    document.getElementById("btn-apply-afl").addEventListener("click", loadAndRenderChart);

    document.getElementById("btn-reset-afl").addEventListener("click", () => {
        editor.setValue(defaultAFL);
        loadAndRenderChart();
    });

    // 6. AI Prompt Box Controls
    const aiPromptBar = document.getElementById("ai-prompt-bar");
    document.getElementById("btn-toggle-ai").addEventListener("click", () => {
        aiPromptBar.classList.toggle("hidden");
    });

    document.getElementById("btn-generate-ai").addEventListener("click", () => {
        const prompt = document.getElementById("ai-prompt-input").value;
        if (!prompt) return;

        let code = defaultAFL;
        if (prompt.toLowerCase().includes("rsi")) {
            code += `\nPlot( RSI(Close, 14), "RSI 14", "#ab47bc", "line", false );`;
        }
        editor.setValue(code);
        loadAndRenderChart();
    });
});