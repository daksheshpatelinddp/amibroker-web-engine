# AmiBroker Web Engine — Roadmap (2000–2026 Historical Dataset)

## Phase 1: Data Infrastructure & Storage Layer (Completed)
- [x] Host Parquet dataset on Cloudflare R2 with HTTP Range support.
- [x] Column normalization (`date`, `open`, `high`, `low`, `close`, `volume`, `delivery_volume`, `delivery_pct`).

## Phase 2: High-Performance Web Engine (Completed)
- [x] Integrate DuckDB-Wasm with Web Worker threads for mobile execution.
- [x] Implement lightweight HTTP Range queries for fast ticker loading (<0.1s).

## Phase 3: Interactive Technical Charting & Basic AFL (Completed)
- [x] Integrated Lightweight-Charts library.
- [x] Basic AFL parsing engine for indicators (e.g., `MA(Close, Period)`).

## Phase 4: Multi-Symbol Market Scanner & Exploration Grid (Current Stage)
- [x] Multi-symbol query processing over 3,000+ tickers.
- [x] Exploration Table Grid for scan results.
- [ ] Extended AFL syntax support (`EMA`, `RSI`, `MACD`, `Cross`).

## Phase 5: Fast In-Browser Backtester & Multi-Year Engine (Upcoming)
- [ ] Multi-year wildcard dataset queries (`2000.parquet` to `2026.parquet`).
- [ ] AFL Backtester engine (`Buy`, `Sell`, `Short`, `Cover` rules).
- [ ] Portfolio performance metrics & equity curve generation.