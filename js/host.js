// Bridge between the tool windows (editor, library, AI) and the running app.
// app.js fills these in when it starts; the tool windows only ever call them.
export const host = {
  relayout() {},                       // redraw the chart (keeps zoom)
  addFormulaPane(formulaId) {},        // add a formula as a new pane on the active sheet
  newFormulaSheet(formulaId) {},       // open a new sheet that shows just this formula
  getBars() { return null; },          // arrays of the symbol on screen (for "Check formula")
  symbol() { return ''; },
  ws() { return null; },               // the Workspace (sheets and panes)
  loadBars(symbol, interval) { return Promise.resolve(null); }, // arrays for any symbol (scans, backtests, foreign data); interval like '5m' = intraday
  refreshTimeframes() {},              // rebuild the time-frame box after the intraday list changed
  symbols() { return []; },            // list of symbols in the database on screen
  activeDb() { return 'nse'; },        // id of that database
  symbolsOf(dbId, opts) { return Promise.resolve([]); },   // symbols of any database (read once, then remembered)
  switchDb(dbId) {},                   // show another database (reloads the app)
};
