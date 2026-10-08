/**
 * AFLEngine - AmiBroker Formula Language Execution & Plot Rendering Engine
 */
export class AFLEngine {
  constructor() {
    this.defaultFormula = `
_SECTION_BEGIN("Price");
SetChartOptions(0, chartDisplayGrid|chartOptionNumericMode);
Plot( Close, "Price", ParamColor("Color", colorDefault), styleCandle );
_SECTION_END();

_SECTION_BEGIN("Volume");
Plot( Volume, "Volume", ParamColor("Vol Color", colorBlue), styleHistogram | styleOwnScale );
_SECTION_END();
`;
  }

  execute(formula, data, chartEngine) {
    console.log("[AFLEngine] Executing AFL Formula Script...");
    if (!data || data.length === 0) return;

    // Reset current panes
    chartEngine.clearPanes();

    // 1. Render Main Price Candlestick Pane
    const pricePane = chartEngine.addPane("pane-price", "Price Chart", { heightRatio: 0.7 });
    chartEngine.setPaneCandlestickData(pricePane.id, data);

    // 2. Render Volume Sub-Pane
    const volPane = chartEngine.addPane("pane-volume", "Volume", { heightRatio: 0.3 });
    const volumeData = data.map((d) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)",
    }));
    chartEngine.setPaneHistogramData(volPane.id, volumeData);
  }
}