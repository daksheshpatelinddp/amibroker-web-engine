# AmiBroker Web Clone - Technical Architecture & Development Roadmap

## 1. Vision & Architecture Overview

The goal of this project is to build a browser-native, zero-server-cost clone of **AmiBroker** featuring:
* **AFL (AmiBroker Formula Language)** evaluation and vector operations.
* **Interactive WebGL Charting** with dynamic indicator overlays via `Plot()`.
* **Data Mining & Explorations** using configurable dynamic grids.
* **Multi-Symbol & Portfolio-Level Backtesting** with trade metrics, equity curves, and drawdowns.

### Key Architecture Design Principles
1. **Serverless & Free-Tier First:** Hosted completely as a static web application (GitHub Pages / Cloudflare Pages) costing $0/month.
2. **Local Browser Engine:** Uses **DuckDB-Wasm** executing directly inside Web Workers to achieve native-like performance without backend computing servers.
3. **Optimized Cloudflare R2 EOD Data Pipeline:** Minimizes Cloudflare R2 **Class B (data read)** operations through aggressive browser storage caching (**OPFS / IndexedDB**) and **Apache Parquet HTTP Range Requests**.

---

## 2. System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Cloudflare R2 Bucket                            │
│           (Stores Master EOD OHLCV Parquet Files 2000-2026+)           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         1. Initial Range Fetch
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Browser Cache (OPFS / IndexedDB)                     │
│    (Persistent Local Storage: Zero R2 API Hits on Subsequent Loads)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         2. Arrow Vector Loading
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DuckDB-Wasm Query Layer                         │
│         (Loads Float32 Arrow Arrays: Open, High, Low, Close, Vol)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         3. AFL Execution Loop
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      AFL Vector Engine (JS/WASM)                       │
│    (Evaluates MA, EMA, RSI, IIf, Buy/Sell Vectors & PositionScores)    │
└──────────────┬────────────────────┬────────────────────┬───────────────┘
               │                    │                    │
               ▼                    ▼                    ▼
     ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
     │ Canvas/WebGL     │  │ Exploration Grid │  │ Portfolio Backtest   │
     │ Charting Engine  │  │ (Scanner Grid)   │  │ (Trade Engine & Equity│
     └──────────────────┘  └──────────────────┘  └──────────────────────┘
```

---

## 3. Step-by-Step Development Roadmap

### Phase 1: Data Pipeline & Cloudflare R2 Cost Optimization
* [ ] **Parquet Data Conversion:** Convert corporate-action-adjusted CSV/EOD files (2000–2026+) into compressed **Apache Parquet** format.
* [ ] **Cloudflare R2 Storage Bucket Setup:** Upload Parquet data files to R2 and set up Cross-Origin Resource Sharing (CORS).
* [ ] **Static Web Hosting Setup:** Set up GitHub Pages or Cloudflare Pages for instant deployment.

### Phase 2: Local DuckDB-Wasm Data Engine & Storage Layer
* [ ] **DuckDB-Wasm Integration:** Embed DuckDB-Wasm within a Web Worker to ensure UI responsiveness.
* [ ] **Browser Cache Implementation (OPFS):** Build an OPFS-backed persistent cache system:
  1. Check browser OPFS before network requests.
  2. Perform Range-Header fetches only for missing or updated chunks.
  3. Store downloaded Parquet files locally to achieve 0 API calls on repeat visits.

### Phase 3: AFL Lexer, Vector Math Engine, & Built-ins
* [ ] **Vector Math Library:** Implement array-based mathematical operations on `Float32Array` objects.
* [ ] **Core Indicator Suite:**
  * Moving Averages: `MA()`, `EMA()`, `WMA()`
  * Oscillators: `RSI()`, `MACD()`, `StochK()`
  * Reference & Logic: `Ref()`, `ExRem()`, `ValueWhen()`, `IIf()`, `Cross()`
* [ ] **AFL Lexer & Parser:** Build an interpreter to transpile AFL script syntax into vector operations:
  * Example: `Buy = Cross(Close, MA(Close, 20));`

### Phase 4: Hardware-Accelerated Charting Engine
* [ ] **Canvas/WebGL Chart Canvas:** Integrate Lightweight-Charts or a custom HTML5 canvas for multi-pane charting.
* [ ] **AFL `Plot()` Parser:** Connect vector evaluation to visual styles:
  * Candlestick plots (`styleCandle`)
  * Overlays & Indicators (`styleLine`, `styleHistogram`)
  * Custom dynamic coloring (`colorRed`, `colorGreen`, `ColorRGB()`)

### Phase 5: Scanner, Exploration, & Portfolio Backtester
* [ ] **Scanner Engine:** Process symbol universe through DuckDB-Wasm arrays and return matches where `Filter != 0`.
* [ ] **Exploration Data Table:** Parse `AddColumn()` directives to render interactive, downloadable data grids.
* [ ] **Two-Pass Portfolio Backtester:**
  1. **Pass 1:** Generate `Buy`, `Sell`, `Short`, `Cover`, and `PositionScore` arrays for all tickers.
  2. **Pass 2:** Execute a bar-by-bar portfolio loop handling capital allocation, trade sizing (`PositionSize`), stop-losses, and equity tracking.
* [ ] **Performance Reporting:** Display Trade Logs, Max Drawdown, CAGR, Sharpe Ratio, and Profit Factor metrics.

---

## 4. R2 API Cost Avoidance Strategy

| Mechanism | Description | Impact |
| :--- | :--- | :--- |
| **Apache Parquet** | Columnar compression format | Reduces download sizes by 90%+ |
| **OPFS Caching** | Permanent local storage in user browser | Eliminates Class B read requests on subsequent visits |
| **HTTP Range Requests** | Fetches specific metadata bytes without pulling full files | Minimizes bandwidth usage during searches |

---

## 5. Next Action Items
1. Commit this `ROADMAP.md` file to your GitHub repository.
2. Initialize the HTML/JS repository with DuckDB-Wasm support for Phase 1 & 2 prototype testing.