// Bridge between the tool windows (editor, library, AI) and the running app.
// app.js fills these in when it starts; the tool windows only ever call them.
export const host = {
  relayout() {},                       // redraw the chart (keeps zoom)
  addFormulaPane(formulaId) {},        // add a formula as a new pane on the active sheet
  newFormulaSheet(formulaId) {},       // open a new sheet that shows just this formula
  getBars() { return null; },          // arrays of the symbol on screen (for "Check formula")
  symbol() { return ''; },
};
