# v15 - AmiBroker's own formulas, Analysis window

* **Formula library = AmiBroker's built-in formulas** (from Formula.pdf), in AmiBroker's groups:
  Averages, Bands, Basic Chart, Equity, Exploration, Indicators, Report Charts, Systems.
  Extra groups: *GUI (on-chart controls)* (the Gui tutorial formula, kept) and *NSE Data* (delivery %, delivery qty, delivery-spike scan).
* **Insert**: moving averages / bands / SAR / Zig / VAP go into the price pane (pane menu > "Insert another formula").
  Library has "Add to price pane", "Insert into...", "New sheet".
* **Parameters are per section** (`_SECTION_BEGIN`), like AmiBroker, so "Periods" in three sections are three settings.
* **Tools > Analysis**: Scan, Explore (with XY charts), Backtest (portfolio, rotational, stops, commission, trade list, equity, drawdown,
  `~~~EQUITY`), Optimize (`Optimize()` grid search). **Build market breadth** makes `~~~ADV/~~~DEC/~~~UNCH` for ADLine, TRIN, STIX.
* **Tools > Price style**: what `GetPriceStyle()` returns (candles / bars / line / area).
* Your `app.js` and `range-engine.js` are included. app.js got only additive edits (marked by comments): host bridge
  (`ws`, `loadBars`, `symbols`, `openSymbol`), `loadBarsFor()`, pseudo symbols (`~~~EQUITY`), foreign-symbol redraw.
* Old saved layouts are converted automatically (price + moving averages -> Price pane with MA/EMA layers).

Tests: `npm test` (formula library, engine, backtester hand-checks, mock chart). The mock chart replaces Lightweight Charts, so
check the drawing (cloud, gradient, volume-at-price, XShift) in a real browser.

## Categories, watchlists and favorites (added after v15)
- **Tools > Symbols · Categories · Watchlists…** replaces the old category screen (its saved folders are migrated automatically).
- AmiBroker's default categories: Groups, Markets, Sectors (12) and Industries (102) from AmiBroker's template, GICS, ICB, plus Watchlists, Favorites, Indexes and ALL.
  - Groups, Markets, Sectors, Industries, GICS, ICB: a symbol is in one category per type, with "(Unassigned)" for the rest. An industry gives its sector. GICS/ICB parents count their children.
  - Watchlists, Favorites, Indexes: a symbol can be in any number of lists.
- Create, rename and delete any category. Add symbols by typing, from a tick-list of the database, or by import.
- Import: .txt, .tls (comma list), .csv (Symbol column), TradingView lists with ### sections, a classification CSV (Symbol, Group, Market, Sector, Industry, GICS, ICB, Watchlist, Index, Favorite) and GICS/ICB code files. Export: .txt, .tls, CSV of everything, JSON backup and restore.
- ★ in the symbol bar toggles Favorites for the symbol on screen.
- Analysis: "Apply to > A category / watchlist…" lists every non-empty category with its count. "My list" also accepts watchlist names. Scan and Explore results have "Save these symbols as a watchlist".
- AFL: InWatchList, InWatchListName, InFavorites, InGroup, InMarket, InSector, InIndustry, InIndex, GroupID/MarketID/SectorID/IndustryID, CategoryGetSymbols/GetName/Find/AddSymbol/RemoveSymbol/SetName and the category* constants. Template: "Scan: Only symbols in a watchlist / favorites".
- Tests: tests/category-test.mjs (44 checks); the screens were also driven in headless Chromium.

## Analysis window, rebuilt like AmiBroker (added after v15)
Studied AmiBroker's Analysis, Exploration, Backtest, Optimization, Walk-Forward and Settings guide pages.
- **Window**: Formula, Apply to (all / current / filter), **Filter** (include/exclude lists, name pattern, extra symbols, limit), Range (all / N bars / N days / from-to), time frame, Scan, Explore, Backtest (portfolio or individual), Optimize, Walk-Forward, Settings, Projects (save/load whole setups), Market breadth. Results / Report / Charts / Info tabs, CSV and HTML report export.
- **Settings** (like AmiBroker's Settings window): General (equity, long/short, margin, futures mode, round lot, interest), Trades (price and delay for buy/sell/short/cover, same-bar exit, trade-price checks), Stops, Commissions (percent, per trade, per share, tiers), Portfolio (max positions, ranking, sizing), Report, Walk-Forward, Optimize, Monte Carlo. A formula's SetOption / ApplyStop / SetTradeDelays / SetPositionSize override them.
- **Backtester**: stops (loss, profit, trailing, N-bar; percent or points; valid bars; re-entry delay; exit at stop price / open / close), reverse-entry, rotational mode, futures margin, commission table, early-exit fee, interest on cash.
- **Report**: All / Long / Short statistics (CAR, MaxDD, RAR, Sharpe, Sortino, Ulcer, K-ratio, profit factor, exposure ...), monthly returns, equity and drawdown, profit histogram, MAE/MFE scatter, Monte Carlo percentile table and chart.
- **Optimize**: exhaustive or smart search, choice of target metric. **Walk-Forward**: in-sample / out-of-sample steps, anchored or rolling, equity carried across.
- **Exploration**: AddColumn formats and colours, text / multitext / rank columns, SetSortColumns, AddSummaryRows, Exclude.
- Tests: tests/analysis2-test.mjs (73 checks); the window was driven in headless Chromium (no errors).
- **Not done**: custom backtester procedure (CBT), scaling in/out, multi-currency, Batch window, auto-repeat, QuickAFL, SettlementDelay, ruin stop. The smart optimizer uses one particle-swarm search for every engine name. The AddSummaryRows flags and SetSortColumns sign are my reading of the guide. Check the look in a real browser (Tailwind and Lightweight Charts were not available in my sandbox).

## Intraday time frames (added after v15)
- **Time-frame box**: D W M Q Y plus intraday frames **1m 5m 15m 30m 45m 1h** (your list). **Custom…** takes any whole number of minutes or hours (7, 90, 1.5 h, 1h30m); tick "Keep it in my list" to save it. **Edit list…** (or Tools > Intraday data…) adds and removes frames, or restores the defaults.
- Bars start at the market open (09:15 IST), like AmiBroker: a 45 min frame has bars at 09:15, 10:00, 10:45 ... Each bar is labelled with its start time. Frames the server cannot send directly are built from the biggest of 1/5/15/30/60 min that divides them (45 min from 15 min bars, 2 hours from 60 min bars).
- **Data**: `server/server.js` (Node, no packages) reads Yahoo Finance (free, no account): NSE prices about 15 min late; 1 min bars = last 7 days, 5/15/30 min = last 60 days, 60 min = last 2 years. It is deployed as a second Render service (`render.yaml`); run it locally with `npm start`. Put its address in Tools > Intraday data… and press Test connection. Nothing is read from or written to R2.
- To use another source later (Kite Connect, a broker API) add `server/providers/<name>.js` (same three exports as yahoo.js) and start with `PROVIDER=<name>`. The app does not change.
- The open intraday chart refreshes every 60 s (settable, 0 = off). Symbols are NSE names (RELIANCE becomes RELIANCE.NS; NIFTY, BANKNIFTY, SENSEX, INDIAVIX are mapped to Yahoo's index names).
- **AFL**: Hour(), Minute(), TimeNum(), DateTime() with time, Interval() in seconds work on intraday bars. All 85 built-in formulas were drawn on 5, 45 and 120 min bars through the mock chart.
- **Analysis**: the Time frame box has the intraday frames and "Custom intraday…"; scans and backtests then read bars from the intraday server (one request per symbol, so use a watchlist, not "All symbols").
- Tests: tests/intraday-test.mjs (95 checks); the settings, custom-frame and Analysis screens were driven in headless Chromium against a fake server.
- **Not tested / limits**: my sandbox cannot reach Yahoo, so the live Yahoo call is untested. Yahoo is unofficial and may change or rate-limit. Set ALLOW_ORIGIN on the Render service to your site's address once it works. Volume-at-price, Foreign() and the delivery % columns have no intraday data (delivery is blank). Pre/post-market bars are not used. Intraday history is limited by Yahoo; there is no local archive.

## Databases (markets) with their own categories (added after v15)
- **Symbols · Categories · Watchlists** now starts with a **Database** bar (NSE, BSE ...). Tap a database to see ITS symbols (All), groups, markets, sectors, industries, GICS, ICB, watchlists, favorites and indexes. Nothing is shared between databases. ● marks the database on screen.
- Your existing NSE categories, watchlists and favorites stay as they were (same storage key). Other databases keep theirs under their own key.
- **Open this database ▶** shows another database on the chart (the app reloads). **＋ Add** registers a new market whose files are in its own folder on R2 (name, folder, currency); it is saved in this browser. You can also add a block in js/config.js.
- **Indexes tab** = the indices of the market (NIFTY 50, NIFTY BANK, SENSEX ...), not stocks. Tap a name to open its chart. The chart symbol is found by name or common alias (NIFTY 50 -> NIFTY, NIFTY BANK -> BANKNIFTY ...). Rows with no chart in the database say so; **Set chart symbol…** picks one by hand (type AUTO to go back). ▤ shows the stocks inside an index (optional; used by InIndex() in formulas).
- Analysis, favorites ★ and formulas use the database on screen.
- Tests: tests/category-test.mjs (66 checks); the window was driven in headless Chromium with two databases.
- **Limits**: only NSE is defined in config.js (BSE and NASDAQ are examples) so add them to see more than one. Whether an index has a chart depends on the index symbols being in your R2 data. When you switch database, sheets that still show symbols of the old market will show no data until you pick a symbol of the new one. Other databases' symbol lists are read once and remembered; "Pick from database" uses the list of the database you are browsing.

## Trades on the chart (Analysis > Backtest)
- Tap a row in the trade list: the Analysis window steps aside and the symbol's chart opens with a Buy arrow (green, up) at the entry bar and a Sell arrow (red, down) at the exit bar of that trade. Short trades show Short (orange) and Cover (blue). The chart zooms to that trade.
- The strip at the top of the chart has ◀ ▶ (previous / next trade of the symbol), **This trade** / **All trades** (every trade of that symbol, the picked one drawn larger with its price and % profit), **Results** (back to the Analysis window) and ✕ (remove the arrows).
- Works on intraday backtests too (the chart switches to the time frame the test used). New files: js/trade-view.js, tests/trade-view-test.mjs.
- app.js: your latest version merged (ResizeObserver message ignored, empty data clears the chart); the only additions are showTrades() and two small hooks.

## Scan and Exploration results on the chart
- Scan: tap a row, the chart opens on that symbol with arrows for the signal you tapped (Buy / Short up or down, Sell / Cover). **All signals** shows every Buy / Sell / Short / Cover the formula gives on that symbol over its whole history.
- Exploration: tap a row, the chart opens with a blue arrow on the date of that row. **All signals** shows every date of that symbol that passed the Filter.
- Same strip on the chart as for backtest trades (◀ ▶, This one / All signals, Results, ✕).

## Drawing tools (like AmiBroker's Draw / Fibonacci / Gann toolbars)
- Tap the **✏** button at the bottom-left of the chart. Tools: Trend line, Ray, Extended line, Horizontal, Vertical, Arrow, Zig-zag, Parallel lines, Cycle lines, Speed lines, Andrews' pitchfork; Raff regression, Standard error and Standard deviation channels; Fibonacci retracement, extension, time extension, time zones, fan and arc; Gann fan and Gann square; Rectangle, Ellipse, Arc, Triangle; Text box.
- Draw by dragging from start to end (or tap, tap). Three-point tools: drag two points, tap the third. Zig-zag: tap each point, double tap or Enter to finish. Esc cancels.
- Tap a drawing to select it: drag it to move, drag a dot to resize. Del deletes, Ctrl+C / Ctrl+X / Ctrl+V copy, cut, paste. Colour, thickness and line style in the toolbar; 🧲 snaps to Open/High/Low/Close; 👁 hides all drawings; 🗑 all clears the symbol.
- Double tap (or ⚙, or Alt+Enter): Properties: colour, style, extend left / right, fill, levels of Fibonacci tools, exact dates and prices, and the **Study ID**.
- **Study ID and formulas**: give a line a two-letter ID (UP, DN, SU, RE, ST or any other). In a formula, `Study("SU", GetChartID())` is the value of that line on every bar (Null where the line does not exist), for example `Buy = Cross(Close, Study("RE", 1));`. Chart ID 1 is the price pane. This works in Scan, Explore and Backtest for every symbol that has such a drawing. Fibonacci retracement levels have the IDs F0 to F9; channels have an ID for the middle, upper and lower line; parallel lines have two.
- Drawings are saved in this browser per symbol (and per database) and keep their place when you change the time frame. Files: js/drawing-*.js, tests/drawing-test.mjs, tests/browser/drawing-ui.mjs.

## Analysis window: nothing is lost, no row limits, big charts
- **Minimise, don't lose it.** ✕, tapping outside the window or "▁ Minimise" now only hides the Analysis window. A running scan / backtest keeps going, and a blue **🔎 Analysis** button at the bottom-right shows its progress ("running 237/1300") and brings the window back with all results. You get a message when it finishes. Opening a symbol or a trade from the results minimises it the same way. "End analysis" stops it and closes the window for good. Tools > Analysis opens the same window again instead of a second one.
- **No row limit.** Result lists show 500 rows at a time with "Show 500 more" / "Show all"; a search box (lists over 20 rows) finds any row among all of them, and every row, also beyond the first 500, can be tapped to open its chart. "Download CSV" has every row. Exploration no longer stops at 5000 rows, and "Largest number of symbols per run" now starts at 0 = no limit (Settings > General; if you saved 500 there earlier, change it to 0).
- **Backtest charts one by one.** The Charts tab shows previews; tap one to open it big (about 1.6 times the screen width, scroll around), with ◀ ▶ for the next chart, ＋ / － zoom and Fit.
- tests/browser/analysis-ui.mjs checks all of this in a real browser page.

## Optimize and Walk-Forward: any number of combinations, safe against interruptions
- The 5,000-combination limit is gone. Optimize and Walk-Forward walk the full grid (like AmiBroker's exhaustive mode); the grid is generated lazily so a million combinations do not use memory. Settings > Optimize > "Keep the best N results" (default 100,000, 0 = all) limits only the list kept for display.
- The "stuck at 0 / 17" start is fixed: symbols are loaded first with their own "Loading data i / n" progress, then "Combination k of N" with a progress bar, time so far and time left.
- The screen is kept awake while an analysis runs, and the browser stays responsive when you switch tabs or minimise the Analysis window (a MessageChannel scheduler is not throttled in background tabs).
- Progress is saved on the phone every ~45 s. If the phone sleeps, the tab is killed or you press Stop, open Analysis again: a banner shows "Unfinished Optimize ... Resume / Discard" and continues from the saved combination with identical results.
- Limit: a phone browser cannot compute while the screen is off or the browser is closed. A run truly independent of the phone needs a server; that is a separate service.

## Question before a long analysis
After a few seconds the speed is known. If a Scan, Exploration, Backtest, Optimize or Walk-Forward needs more than 15 minutes more, it pauses and asks "needs about N minutes more... continue?". OK continues (Optimize and Walk-Forward carry on from where they paused, nothing is repeated). Cancel runs nothing.
## How to resume
Open Analysis. If a run was interrupted (phone slept, tab closed, Stop pressed) a yellow box at the top shows "Unfinished Optimize ... Resume / Discard".

## Chart navigation strip (under the chart)
- Scroll bar: drag the blue block, or tap the bar, to move through history. Its width shows how much of the data is on screen.
- ◀ ▶ move exactly one candle (hold to keep moving). Desktop: Left / Right arrow keys do the same.
- － ＋ zoom out / in. Pinch zoom still works.
- ✛ turns the crosshair on / off (remembered).
- A new chart opens on about 2 months of daily bars (45 candles; intraday 120). Fit still shows everything.

## Menu bar (like AmiBroker)
A row under the logo: File · Edit · View · Insert · Format · Symbol · Analysis · Tools · Window. Tap a word to open it; a ▸ item opens its list below it. The old "Tools" button and "＋ Pane" are gone: Insert > Indicator / formula pane… and View > Pane do the same.
- File: New sheet, Open formula, Open database, Intraday server settings, Import symbols / watchlists, Export chart data (CSV), Save chart as image, Print, My formulas.
- Edit: Cut, Copy, Paste, Delete, Delete all, Properties (Study ID) for drawings.
- View: Crosshair, Price chart style, Logarithmic scale, Daily/Weekly/Monthly/Quarterly/Yearly, Intraday frames, Zoom, History (last 1 month ... 5 years), Pane, Toolbars, Refresh, Refresh all.
- Insert: indicator pane and all 27 drawing tools by group. Format: thick, dotted, snap to OHLC, hide drawings, properties.
- Symbol: Quick find (F3), Find, Information, Favourites, Watchlists, Categories, Indexes. Analysis: New analysis, Formula editor, AFL code wizard, Formula library, Settings, AFL reference. Tools: Preferences, Intraday data, Indicator maintenance. Window: sheets (new, rename, close, switch).

## Layout changes
- Formula library is now in the File menu, next to My formulas (removed from Analysis / Tools / Insert).
- The time-frame box and the ★ moved to the top bar, beside the symbol search, so the chart header (symbol, price, Open / High / Low / Close) has the full width. The title is shortened to ABW so the status badge (Engine Ready) stays visible; the ★ is hidden only on screens narrower than 360 px (Symbol > Favourites still adds / removes it).

## Chart header information
- The Open / High / Low / Close / Volume line now wraps onto a second line instead of being cut off.
- It follows the crosshair candle by candle.
- Tap a candle to select it: its information stays in the header and a thin dashed line marks it, even when your finger leaves. Tap the same candle again to clear. While a drawing tool is active, taps draw instead of selecting.

## Crosshair that stays
On a phone the chart library only shows the crosshair while a finger is held down and removes it when you lift. Now a tap puts the crosshair (and the header information) on the tapped candle and price and it stays there. Tap somewhere else to move it, tap the same spot again to remove it. Holding and dragging still moves it live. The ✛ button switches the crosshair off completely. The lines are also a little brighter.

## Axes on the report charts
Equity, Drawdown, Profit distribution, MAE / MFE and Monte Carlo charts (Analysis > Charts, the big viewer and the exported HTML report) now have axis scales with grid lines, date labels along the bottom for Equity and Drawdown, and axis titles.

## Run on GitHub (Optimize / Walk-Forward in the background)
- Analysis → **Run on GitHub…**: sends the current formula, symbols, range and settings to your runner repo (`amibroker-analysis-runner`, set-up steps in its README) and starts a GitHub Actions job on up to 20 free machines. It keeps running with the phone off.
- The panel shows each job's state, percent, time left and run number; **View result** loads the finished table / map / equity into the normal tabs (tap a row = backtest on your phone).
- Settings → Optimize → *Run on GitHub: keep the best N results* (default 5000).
- Only Optimize and Walk-Forward, only end-of-day data. The token is kept in this browser only. See the runner README for GitHub quota / terms notes.

## Groups: one symbol in many groups
- A symbol can now be in any number of Groups (NIFTY 500, NIFTY 50, NIFTY NEXT 50 ...). Before, putting a stock in a new group took it out of the old one, so NIFTY 500 shrank.
- Old one-group-per-symbol data moves over automatically. Watchlists, Favorites and Indexes already worked this way. Markets, Sectors and Industries stay one-per-symbol (as in AmiBroker).
- When an import has symbols that are not in the database, the message now names the first few (that is why a list of 50 can show 49).

## NSE categories from all NSE indices
- `tools/build-nse-categories.mjs` downloads the constituent list of every NSE index it knows (NIFTY 50, NEXT 50, 100, 200, 500, midcap / smallcap, sector indices, ...) and writes `nse-categories.csv`: Group = every index the symbol is in, Sector = NSE's Industry column, Industry = the narrowest sector index (Private Bank, PSU Bank, IT, Pharma ...).
- `.github/workflows/nse-categories.yml` (in the app repo) runs it on GitHub (Actions tab, also weekly) and saves the CSV in your repo. In the app: Symbols · Categories · Watchlists > **Import classification from link…** and paste the raw link of that CSV.
- Index files that niftyindices.com does not serve (names change) are skipped and listed in the Action log; fix the file name in the `INDEXES` list.
- If NSE answers HTTP 503 to GitHub (it blocks many cloud machines), the builder retries, tries NSE's archive hosts, and as a last resort reads `ind_*.csv` files you saved in the repo folder `nse-index-files/`. Or use the app's own **Import NSE index files…** button with the same files.

## Cleaner NSE categories
- Importing a classification CSV now **replaces** the members of every group named in it (before it only added, so a group kept symbols that had left the index, e.g. NIFTY 500 showing 501).
- **Remove empty** button (Groups, Sectors, Industries): deletes the categories that have no symbols, such as the AmiBroker default sectors / industries you do not use. It lists them and asks first.
- The NSE builder gives a symbol in no sector index an Industry named like its sector, so fewer symbols are left without an industry. NSE's index files hold nothing finer than this.

## Fix: "Aw, Snap!" when importing categories
- Importing a classification CSV / NSE index files saved the whole category store after every single row (thousands of times) and redrew the screen each time, which crashed the page and left the groups half filled (NIFTY 50 with 38 symbols). Imports now save once at the end. A 4,500-row import takes about 0.2 s.
- The NSE builder now also writes `nse-categories-groups.csv` (Symbol, Group) and `nse-categories-sectors.csv` (Symbol, Sector, Industry) next to the full file, and `nse-categories-report.txt` with the number of members read for every index and the files it had to skip. Import any of them with **Import classification from link…**.
- The Symbols · Categories window shows `build 2026-10-21b` in its first line, so you can see that the new files are running.

## Run on GitHub: R2 cost fix
Runner shards no longer read R2 directly. Data is downloaded once per data version, cached by Actions, and read locally. Optional GitHub Release source via `DATA_RELEASE_URL`. See the runner README.

## Indices in scans
"All stocks" runs (and name filters that do not start with `^`) now leave out index symbols such as `^NIFTY50`. Type `^NIFTY*` in the name filter, or the symbol itself, to include indices.

## TimeFrameSet and the other time-frame functions (build 2026-10-27a)
`TimeFrameSet`, `TimeFrameRestore`, `TimeFrameExpand`, `TimeFrameCompress`, `TimeFrameGetPrice` now work like AmiBroker's, in charts, Scan, Explore, Backtest, Optimize, Walk-Forward and Run on GitHub.
* The formula starts in the chart / analysis time frame and can only go to LONGER bars (daily -> weekly, monthly, quarterly, yearly, 3*inDaily ...; 5-minute -> 15-minute, hourly, daily ...). Minutes need intraday data.
* `Foreign("^NIFTY50","C")` inside `TimeFrameSet(inWeekly)` gives the index's weekly bars.
* `inWeekly` is now 432001 and `inMonthly` 2160001 (AmiBroker 5.x values), and `Interval()` follows the active time frame.
* Mixing arrays of different time frames, or sending one to Plot / Buy / Sell, gives a readable error that tells you to use `TimeFrameExpand`.
* New built-in formula: Averages > Higher Time Frame Moving Average.
* Fix: Scan, Explore and Backtest told formulas they ran on Daily bars even on a Weekly run; they now see the real time frame.
