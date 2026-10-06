/**
 * AmiBroker Web Workstation - Main Application Controller
 */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize CodeMirror Editor
    const textArea = document.getElementById("afl-code-input");
    const defaultAFL = `// Default AmiBroker Formula\nPlot( Close, "Price", "#26a69a", "line", true );\nPlot( MA(Close, 20), "20 SMA", "#2962FF", "line", true );\nPlot( EMA(Close, 50), "50 EMA", "#FF6D00", "line", true );\nPlot( Volume, "Volume", "#26a69a", "histogram", false );`;
    
    textArea.value = defaultAFL;

    const editor = CodeMirror.fromTextArea(textArea, {
        mode: "javascript",
        theme: "dracula",
        lineNumbers: true,
        tabSize: 2
    });

    // 2. Generate Initial Synthetic OHLCV Sample Data
    const generateSampleData = () => {
        let data = [];
        let baseTime = new Date(2026, 0, 1).getTime() / 1000;
        let price = 100;

        for (let i = 0; i < 150; i++) {
            let change = (Math.random() - 0.48) * 3;
            let open = price;
            let close = price + change;
            let high = Math.max(open, close) + Math.random() * 1.5;
            let low = Math.min(open, close) - Math.random() * 1.5;
            let volume = Math.floor(Math.random() * 50000) + 10000;

            let timeString = new Date((baseTime + i * 86400) * 1000).toISOString().split('T')[0];

            data.push({ time: timeString, open, high, low, close, volume });
            price = close;
        }
        return data;
    };

    const currentData = generateSampleData();

    // 3. Render Execution Function
    const executeAndRender = () => {
        const code = editor.getValue();
        const aflResult = window.aflEngine.execute(code, currentData);

        if (aflResult.success) {
            window.chartEngine.renderAFLOutput(aflResult);
        } else {
            alert("AFL Syntax Error: " + aflResult.error);
        }
    };

    // 4. Initial Render
    executeAndRender();

    // 5. Button Event Listeners
    document.getElementById("btn-apply-afl").addEventListener("click", executeAndRender);

    document.getElementById("btn-reset-afl").addEventListener("click", () => {
        editor.setValue(defaultAFL);
        executeAndRender();
    });

    // AI Drawer Toggle
    const aiPromptBar = document.getElementById("ai-prompt-bar");
    document.getElementById("btn-toggle-ai").addEventListener("click", () => {
        aiPromptBar.classList.toggle("hidden");
    });

    // Simple AI Generator Simulator
    document.getElementById("btn-generate-ai").addEventListener("click", () => {
        const prompt = document.getElementById("ai-prompt-input").value;
        if (!prompt) return;

        let generatedCode = defaultAFL;
        if (prompt.toLowerCase().includes("rsi")) {
            generatedCode += `\nPlot( RSI(Close, 14), "RSI 14", "#ab47bc", "line", false );`;
        }
        
        editor.setValue(generatedCode);
        executeAndRender();
    });
});