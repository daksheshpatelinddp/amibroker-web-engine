import { dataEngine } from './data-engine.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Sidebar / Category Drawer Toggle
    const menuBtn = document.getElementById('menuBtn') || document.querySelector('.icon-btn');
    const categoryDrawer = document.querySelector('.category-drawer');
    const closeDrawerBtn = document.getElementById('closeDrawer');

    if (menuBtn && categoryDrawer) {
        menuBtn.addEventListener('click', () => {
            categoryDrawer.classList.toggle('open');
        });
    }

    if (closeDrawerBtn && categoryDrawer) {
        closeDrawerBtn.addEventListener('click', () => {
            categoryDrawer.classList.remove('open');
        });
    }

    // 2. Layout Grid Switcher (Rectangle Icons)
    const layoutBtns = document.querySelectorAll('.layout-btn');
    const chartGrid = document.querySelector('.chart-grid');

    layoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            layoutBtns.forEach(b => b.classList.remove('active'));
            
            const selectedBtn = e.currentTarget;
            selectedBtn.classList.add('active');

            const layoutMode = selectedBtn.getAttribute('data-layout') || '1x1';
            
            if (chartGrid) {
                chartGrid.className = 'chart-grid';
                chartGrid.classList.add(`grid-${layoutMode}`);
            }
        });
    });

    // 3. Global Quick Search Trigger
    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const symbol = searchInput.value.trim();
                if (symbol) {
                    await loadSymbolToWorkspace(symbol);
                }
            }
        });
    }
});

// Function to handle symbol selection and trigger DuckDB query
export async function loadSymbolToWorkspace(symbol) {
    const symbolTitle = document.querySelector('.cell-symbol-title');
    const placeholder = document.querySelector('.empty-chart-placeholder');
    
    if (symbolTitle) symbolTitle.textContent = symbol.toUpperCase();
    
    try {
        if (placeholder) placeholder.textContent = `Fetching data for ${symbol}...`;
        
        // Fetch Parquet data using DataEngine
        const data = await dataEngine.fetchSymbolData(symbol);
        
        if (placeholder) {
            placeholder.textContent = `Loaded ${data.length} records for ${symbol}.`;
        }
    } catch (err) {
        if (placeholder) {
            placeholder.textContent = `Failed to load data for ${symbol}. Check console.`;
        }
    }
}