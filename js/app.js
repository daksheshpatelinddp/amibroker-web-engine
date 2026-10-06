document.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing Workstation Application Controller...");

    // 1. Tab Switching Controller
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTabId = button.getAttribute('data-tab');

            // Deactivate all
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Activate chosen tab
            button.classList.add('active');
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Trigger chart resize if Chart tab becomes visible
            if (targetTabId === 'tab-chart' && window.chartEngine) {
                setTimeout(() => {
                    window.chartEngine.resize();
                }, 50);
            }

            logConsole(`Switched workspace to: ${button.textContent.trim()}`);
        });
    });

    // 2. Initialize Chart Engine
    if (window.chartEngine) {
        window.chartEngine.init();
    }

    // 3. Sidebar Collapsible Toggle
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    const sidebarPanel = document.getElementById('sidebarPanel');
    if (toggleSidebarBtn && sidebarPanel) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebarPanel.classList.toggle('collapsed');
            toggleSidebarBtn.textContent = sidebarPanel.classList.contains('collapsed') ? '▶' : '◀';
            
            // Resize chart after layout transition completes
            setTimeout(() => {
                if (window.chartEngine) window.chartEngine.resize();
            }, 300);
        });
    }

    // 4. Bottom Dock / Console Toggle
    const toggleConsoleBtn = document.getElementById('toggleConsole');
    const bottomDock = document.querySelector('.bottom-dock');
    if (toggleConsoleBtn && bottomDock) {
        toggleConsoleBtn.addEventListener('click', () => {
            bottomDock.classList.toggle('collapsed');
            toggleConsoleBtn.textContent = bottomDock.classList.contains('collapsed') ? '▲' : '▼';
            
            setTimeout(() => {
                if (window.chartEngine) window.chartEngine.resize();
            }, 250);
        });
    }

    // Console Logging Helper
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