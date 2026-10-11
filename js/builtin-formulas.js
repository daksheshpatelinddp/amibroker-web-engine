// Built-in formula library: the everyday charts and indicators, written in AFL itself.
// The user can open any of them in the editor, change it and "Save As" a private copy.
// kind: 'chart' (plots something) | 'system' (chart + Buy/Sell rules) | 'exploration' (Filter + columns)

const f = (key, name, category, description, code, extra = {}) => ({ key, name, category, description, code: code.trim() + '\n', kind: 'chart', weight: 1, ...extra });

const PV = 'Price & Volume';
const TR = 'Trend & Moving Averages';
const MO = 'Momentum';
const VO = 'Volatility';
const VD = 'Volume & Delivery';
const SY = 'Systems (Buy / Sell rules)';
const EX = 'Explorations (Scanner)';

export const BUILTIN_FORMULAS = [
  // ------------------------------------------------------------------ price & volume
  f('price-candle', 'Price (Candlestick)', PV, 'Standard candlestick price chart', `
_SECTION_BEGIN("Price");
Plot(Close, "Price", colorDefault, styleCandle);
_SECTION_END();`, { weight: 3 }),

  f('price-bar', 'Price (OHLC Bars)', PV, 'Open-High-Low-Close bars', `
_SECTION_BEGIN("Price Bars");
Plot(Close, "Price", colorDefault, styleBar);
_SECTION_END();`, { weight: 3 }),

  f('price-line', 'Price (Close Line)', PV, 'Simple line chart of the closing price', `
_SECTION_BEGIN("Line");
Plot(Close, "Close", colorSkyblue, styleLine | styleThick);
_SECTION_END();`, { weight: 3 }),

  f('price-area', 'Price (Area)', PV, 'Closing price drawn as a filled area', `
_SECTION_BEGIN("Area");
Plot(Close, "Close", colorSkyblue, styleArea);
_SECTION_END();`, { weight: 3 }),

  f('price-heikin', 'Heikin-Ashi Candles', PV, 'Smoothed Heikin-Ashi candlesticks', `
_SECTION_BEGIN("Heikin-Ashi");
haClose = (Open + High + Low + Close) / 4;
haOpen = haClose;
haOpen[0] = (Open[0] + Close[0]) / 2;
for (i = 1; i < BarCount; i++) {
  haOpen[i] = (haOpen[i-1] + haClose[i-1]) / 2;
}
haHigh = Max(High, Max(haOpen, haClose));
haLow  = Min(Low,  Min(haOpen, haClose));
PlotOHLC(haOpen, haHigh, haLow, haClose, "Heikin-Ashi", colorDefault, styleCandle);
_SECTION_END();`, { weight: 3 }),

  f('volume', 'Volume', PV, 'Volume histogram (green = up day, red = down day) with a moving average', `
_SECTION_BEGIN("Volume");
avgPeriod = Param("Average period", 20, 2, 200, 1);
Plot(Volume, "Volume", IIf(Close >= Open, ColorRGB(22,163,74), ColorRGB(220,38,38)), styleHistogram | styleThick);
Plot(MA(Volume, avgPeriod), "Vol MA", colorOrange, styleLine);
_SECTION_END();`),

  f('price-volume', 'Price with Volume on same pane', PV, 'Candles with volume bars along the bottom (own scale)', `
_SECTION_BEGIN("Price + Volume");
Plot(Volume, "Volume", ColorRGB(71,85,105), styleHistogram | styleOwnScale | styleNoLabel);
Plot(Close, "Price", colorDefault, styleCandle);
_SECTION_END();`, { weight: 3 }),

  // ------------------------------------------------------------------ trend & MAs
  f('price-ma', 'Price + Moving Averages', TR, 'Candles with three moving averages (type and periods are adjustable)', `
_SECTION_BEGIN("Price + MAs");
function avg(a, p, t) {
  if (t == "EMA") return EMA(a, p);
  if (t == "WMA") return WMA(a, p);
  return MA(a, p);
}
type = ParamList("Average type", "SMA|EMA|WMA", "SMA");
p1 = Param("Period 1", 20, 2, 500, 1);
p2 = Param("Period 2", 50, 2, 500, 1);
p3 = Param("Period 3", 200, 2, 500, 1);
Plot(Close, "Price", colorDefault, styleCandle);
Plot(avg(Close, p1, type), type + " " + NumToStr(p1, 1.0), colorOrange, styleThick);
Plot(avg(Close, p2, type), type + " " + NumToStr(p2, 1.0), colorSkyblue, styleThick);
Plot(avg(Close, p3, type), type + " " + NumToStr(p3, 1.0), colorViolet, styleThick);
_SECTION_END();`, { weight: 3 }),

  f('price-ema-cross', 'Price + EMA Crossover', TR, 'Fast / slow EMA with buy and sell arrows where they cross', `
_SECTION_BEGIN("EMA Crossover");
fast = Param("Fast EMA", 9, 2, 200, 1);
slow = Param("Slow EMA", 21, 2, 400, 1);
Plot(Close, "Price", colorDefault, styleCandle);
Plot(EMA(Close, fast), "Fast EMA", colorOrange, styleThick);
Plot(EMA(Close, slow), "Slow EMA", colorSkyblue, styleThick);
Buy  = Cross(EMA(Close, fast), EMA(Close, slow));
Sell = Cross(EMA(Close, slow), EMA(Close, fast));
PlotShapes(Buy  * shapeUpArrow,   colorBrightGreen, 0, Low);
PlotShapes(Sell * shapeDownArrow, colorRed,         0, High);
_SECTION_END();`, { weight: 3 }),

  f('price-supertrend', 'Supertrend', TR, 'ATR based trend-following line with buy / sell arrows', `
_SECTION_BEGIN("Supertrend");
period = Param("ATR period", 10, 1, 100, 1);
mult   = Param("Multiplier", 3, 0.5, 10, 0.5);
a  = ATR(period);
mid = (High + Low) / 2;
upBand = mid - mult * a;
dnBand = mid + mult * a;
fu = upBand;
fd = dnBand;
trend = 1 + 0 * Close;
for (i = 1; i < BarCount; i++) {
  fu[i] = IIf(upBand[i] > fu[i-1] OR Close[i-1] < fu[i-1], upBand[i], fu[i-1]);
  fd[i] = IIf(dnBand[i] < fd[i-1] OR Close[i-1] > fd[i-1], dnBand[i], fd[i-1]);
  trend[i] = trend[i-1];
  if (trend[i-1] == -1 AND Close[i] > fd[i-1]) trend[i] = 1;
  if (trend[i-1] ==  1 AND Close[i] < fu[i-1]) trend[i] = -1;
}
st = IIf(trend == 1, fu, fd);
Plot(Close, "Price", colorDefault, styleCandle);
Plot(st, "Supertrend", IIf(trend == 1, colorBrightGreen, colorRed), styleThick);
Buy  = trend == 1  AND Ref(trend, -1) == -1;
Sell = trend == -1 AND Ref(trend, -1) == 1;
PlotShapes(Buy  * shapeUpArrow,   colorBrightGreen, 0, Low);
PlotShapes(Sell * shapeDownArrow, colorRed,         0, High);
_SECTION_END();`, { weight: 3, kind: 'system' }),

  f('price-sar', 'Parabolic SAR', TR, 'Candles with the Parabolic SAR dots', `
_SECTION_BEGIN("Parabolic SAR");
acc = Param("Acceleration", 0.02, 0.005, 0.2, 0.005);
mx  = Param("Maximum", 0.2, 0.05, 1, 0.05);
Plot(Close, "Price", colorDefault, styleCandle);
Plot(SAR(acc, mx), "SAR", colorYellow, styleDots | styleNoLine);
_SECTION_END();`, { weight: 3 }),

  f('adx', 'ADX / +DI / -DI', TR, 'Trend strength (ADX) and directional indicators', `
_SECTION_BEGIN("ADX");
p = Param("Period", 14, 2, 100, 1);
Plot(ADX(p), "ADX", colorWhite, styleThick);
Plot(PDI(p), "+DI", colorBrightGreen, styleLine);
Plot(MDI(p), "-DI", colorRed, styleLine);
PlotGrid(25);
_SECTION_END();`),

  f('aroon', 'Aroon', TR, 'Aroon Up / Down - how recently the highest high and lowest low occurred', `
_SECTION_BEGIN("Aroon");
p = Param("Period", 25, 2, 200, 1);
up = 100 * (p - HHVBars(High, p + 1)) / p;
dn = 100 * (p - LLVBars(Low, p + 1)) / p;
Plot(up, "Aroon Up", colorBrightGreen, styleThick);
Plot(dn, "Aroon Down", colorRed, styleThick);
PlotGrid(50);
_SECTION_END();`),

  // ------------------------------------------------------------------ momentum
  f('rsi', 'RSI', MO, 'Relative Strength Index with 70 / 30 levels', `
_SECTION_BEGIN("RSI");
p = Param("Period", 14, 2, 100, 1);
Plot(RSI(p), "RSI", colorOrange, styleThick);
PlotGrid(70, colorRed);
PlotGrid(50, colorGrey40);
PlotGrid(30, colorBrightGreen);
_SECTION_END();`),

  f('macd', 'MACD', MO, 'MACD line, signal line and histogram', `
_SECTION_BEGIN("MACD");
fast = Param("Fast", 12, 2, 100, 1);
slow = Param("Slow", 26, 2, 200, 1);
sig  = Param("Signal", 9, 2, 100, 1);
m = MACD(fast, slow);
s = Signal(fast, slow, sig);
h = m - s;
Plot(h, "Histogram", IIf(h >= 0, ColorRGB(22,163,74), ColorRGB(220,38,38)), styleHistogram | styleThick);
Plot(m, "MACD", colorSkyblue, styleThick);
Plot(s, "Signal", colorOrange, styleLine);
PlotGrid(0, colorGrey40);
_SECTION_END();`),

  f('stoch', 'Stochastic', MO, 'Stochastic oscillator %K and %D', `
_SECTION_BEGIN("Stochastic");
p  = Param("Period", 14, 2, 100, 1);
ks = Param("%K smoothing", 3, 1, 20, 1);
ds = Param("%D smoothing", 3, 1, 20, 1);
Plot(StochK(p, ks), "%K", colorSkyblue, styleThick);
Plot(StochD(p, ks, ds), "%D", colorOrange, styleLine);
PlotGrid(80, colorRed);
PlotGrid(20, colorBrightGreen);
_SECTION_END();`),

  f('cci', 'CCI', MO, 'Commodity Channel Index', `
_SECTION_BEGIN("CCI");
p = Param("Period", 20, 2, 100, 1);
Plot(CCI(p), "CCI", colorSkyblue, styleThick);
PlotGrid(100, colorRed);
PlotGrid(0, colorGrey40);
PlotGrid(-100, colorBrightGreen);
_SECTION_END();`),

  f('willr', 'Williams %R', MO, 'Williams %R (0 to -100)', `
_SECTION_BEGIN("Williams %R");
p = Param("Period", 14, 2, 100, 1);
w = -100 * (HHV(High, p) - Close) / (HHV(High, p) - LLV(Low, p));
Plot(w, "%R", colorViolet, styleThick);
PlotGrid(-20, colorRed);
PlotGrid(-80, colorBrightGreen);
_SECTION_END();`),

  f('roc', 'Rate of Change (ROC)', MO, 'Percent change over N bars', `
_SECTION_BEGIN("ROC");
p = Param("Period", 12, 1, 200, 1);
r = ROC(Close, p);
Plot(r, "ROC", IIf(r >= 0, colorBrightGreen, colorRed), styleHistogram | styleThick);
PlotGrid(0, colorGrey40);
_SECTION_END();`),

  // ------------------------------------------------------------------ volatility
  f('price-bbands', 'Price + Bollinger Bands', VO, 'Candles with Bollinger Bands', `
_SECTION_BEGIN("Bollinger Bands");
p = Param("Period", 20, 2, 200, 1);
w = Param("Width (std dev)", 2, 0.5, 5, 0.5);
Plot(Close, "Price", colorDefault, styleCandle);
Plot(BBandTop(Close, p, w), "Upper", colorSkyblue, styleLine);
Plot(MA(Close, p), "Middle", colorGrey50, styleDashed);
Plot(BBandBot(Close, p, w), "Lower", colorSkyblue, styleLine);
_SECTION_END();`, { weight: 3 }),

  f('price-keltner', 'Price + Keltner Channel', VO, 'EMA with ATR based channel', `
_SECTION_BEGIN("Keltner Channel");
p = Param("EMA period", 20, 2, 200, 1);
a = Param("ATR period", 10, 1, 100, 1);
m = Param("ATR multiplier", 2, 0.5, 5, 0.5);
mid = EMA(Close, p);
Plot(Close, "Price", colorDefault, styleCandle);
Plot(mid + m * ATR(a), "Upper", colorOrange, styleLine);
Plot(mid, "Middle", colorGrey50, styleDashed);
Plot(mid - m * ATR(a), "Lower", colorOrange, styleLine);
_SECTION_END();`, { weight: 3 }),

  f('price-donchian', 'Price + Donchian Channel', VO, 'Highest high / lowest low channel', `
_SECTION_BEGIN("Donchian Channel");
p = Param("Period", 20, 2, 250, 1);
Plot(Close, "Price", colorDefault, styleCandle);
Plot(HHV(High, p), "Upper", colorBrightGreen, styleLine);
Plot((HHV(High, p) + LLV(Low, p)) / 2, "Middle", colorGrey50, styleDashed);
Plot(LLV(Low, p), "Lower", colorRed, styleLine);
_SECTION_END();`, { weight: 3 }),

  f('atr', 'ATR', VO, 'Average True Range', `
_SECTION_BEGIN("ATR");
p = Param("Period", 14, 1, 100, 1);
Plot(ATR(p), "ATR", colorOrange, styleThick);
_SECTION_END();`),

  f('bb-pctb', 'Bollinger %B', VO, 'Where the close sits inside the Bollinger Bands (0 = lower band, 1 = upper band)', `
_SECTION_BEGIN("Bollinger %B");
p = Param("Period", 20, 2, 200, 1);
w = Param("Width", 2, 0.5, 5, 0.5);
up = BBandTop(Close, p, w);
dn = BBandBot(Close, p, w);
Plot((Close - dn) / (up - dn), "%B", colorSkyblue, styleThick);
PlotGrid(1, colorRed);
PlotGrid(0.5, colorGrey40);
PlotGrid(0, colorBrightGreen);
_SECTION_END();`),

  f('bb-width', 'Bollinger Bandwidth', VO, 'Width of the Bollinger Bands as a % of the middle band (squeeze detector)', `
_SECTION_BEGIN("Bandwidth");
p = Param("Period", 20, 2, 200, 1);
w = Param("Width", 2, 0.5, 5, 0.5);
Plot(100 * (BBandTop(Close, p, w) - BBandBot(Close, p, w)) / MA(Close, p), "Bandwidth %", colorViolet, styleThick);
_SECTION_END();`),

  // ------------------------------------------------------------------ volume & delivery
  f('obv', 'On Balance Volume', VD, 'Running total of volume on up days minus down days', `
_SECTION_BEGIN("OBV");
Plot(OBV(), "OBV", colorSkyblue, styleThick);
_SECTION_END();`),

  f('mfi', 'Money Flow Index', VD, 'Volume-weighted RSI', `
_SECTION_BEGIN("MFI");
p = Param("Period", 14, 2, 100, 1);
Plot(MFI(p), "MFI", colorTeal, styleThick);
PlotGrid(80, colorRed);
PlotGrid(20, colorBrightGreen);
_SECTION_END();`),

  f('rel-volume', 'Relative Volume', VD, 'Today\'s volume divided by its N-day average (2 = twice normal)', `
_SECTION_BEGIN("Relative Volume");
p = Param("Average period", 20, 2, 200, 1);
rv = Volume / Ref(MA(Volume, p), -1);
Plot(rv, "Rel Volume", IIf(rv >= 2, colorOrange, colorGrey50), styleHistogram | styleThick);
PlotGrid(1, colorGrey40);
PlotGrid(2, colorOrange);
_SECTION_END();`),

  f('delivery-pct', 'Delivery %', VD, 'NSE delivery percentage (needs the delivery column in the data)', `
_SECTION_BEGIN("Delivery %");
p = Param("Average period", 20, 2, 200, 1);
Plot(DelPct, "Delivery %", colorViolet, styleHistogram | styleThick);
Plot(MA(DelPct, p), "Average", colorOrange, styleLine);
_SECTION_END();`),

  f('delivery-qty', 'Delivery Quantity', VD, 'NSE delivered quantity with moving average', `
_SECTION_BEGIN("Delivery Qty");
p = Param("Average period", 20, 2, 200, 1);
Plot(Delivery, "Delivery", colorTeal, styleHistogram | styleThick);
Plot(MA(Delivery, p), "Average", colorOrange, styleLine);
_SECTION_END();`),

  f('hi-lo-52w', '52-week High / Low', VD, 'Candles with the rolling 52-week (250 day) high and low', `
_SECTION_BEGIN("52 Week High/Low");
n = Param("Days", 250, 20, 1000, 10);
Plot(Close, "Price", colorDefault, styleCandle);
Plot(HHV(High, n), "High", colorBrightGreen, styleDashed);
Plot(LLV(Low, n), "Low", colorRed, styleDashed);
_SECTION_END();`, { weight: 3 }),

  // ------------------------------------------------------------------ systems
  f('sys-ema-cross', 'System: EMA Crossover', SY, 'Buy when the fast EMA crosses above the slow EMA, sell on the opposite cross', `
_SECTION_BEGIN("System: EMA Crossover");
fast = Param("Fast EMA", 9, 2, 200, 1);
slow = Param("Slow EMA", 21, 2, 400, 1);
Buy  = Cross(EMA(Close, fast), EMA(Close, slow));
Sell = Cross(EMA(Close, slow), EMA(Close, fast));
Short = Cover = 0;
Plot(Close, "Price", colorDefault, styleCandle);
Plot(EMA(Close, fast), "Fast", colorOrange, styleThick);
Plot(EMA(Close, slow), "Slow", colorSkyblue, styleThick);
PlotShapes(Buy  * shapeUpArrow,   colorBrightGreen, 0, Low);
PlotShapes(Sell * shapeDownArrow, colorRed,         0, High);
_SECTION_END();`, { weight: 3, kind: 'system' }),

  f('sys-rsi', 'System: RSI Oversold Bounce', SY, 'Buy when RSI crosses back above the oversold level, sell when it reaches overbought', `
_SECTION_BEGIN("System: RSI Bounce");
p   = Param("RSI period", 14, 2, 50, 1);
os  = Param("Oversold", 30, 5, 50, 1);
ob  = Param("Overbought", 70, 50, 95, 1);
r = RSI(p);
Buy  = Cross(r, os);
Sell = Cross(r, ob);
Short = Cover = 0;
Plot(Close, "Price", colorDefault, styleCandle);
PlotShapes(Buy  * shapeUpArrow,   colorBrightGreen, 0, Low);
PlotShapes(Sell * shapeDownArrow, colorRed,         0, High);
_SECTION_END();`, { weight: 3, kind: 'system' }),

  f('sys-breakout', 'System: Donchian Breakout', SY, 'Buy a new N-day high, sell a new M-day low (turtle style)', `
_SECTION_BEGIN("System: Breakout");
nIn  = Param("Entry: highest high of", 20, 5, 250, 1);
nOut = Param("Exit: lowest low of", 10, 3, 120, 1);
Buy  = Close > Ref(HHV(High, nIn), -1);
Sell = Close < Ref(LLV(Low, nOut), -1);
Short = Cover = 0;
Plot(Close, "Price", colorDefault, styleCandle);
Plot(Ref(HHV(High, nIn), -1), "Entry", colorBrightGreen, styleDashed);
Plot(Ref(LLV(Low, nOut), -1), "Exit", colorRed, styleDashed);
PlotShapes(Buy  * shapeUpArrow,   colorBrightGreen, 0, Low);
PlotShapes(Sell * shapeDownArrow, colorRed,         0, High);
_SECTION_END();`, { weight: 3, kind: 'system' }),

  f('sys-macd', 'System: MACD Signal Cross', SY, 'Buy when MACD crosses above its signal line, sell when it crosses below', `
_SECTION_BEGIN("System: MACD Cross");
m = MACD(12, 26);
s = Signal(12, 26, 9);
Buy  = Cross(m, s);
Sell = Cross(s, m);
Short = Cover = 0;
Plot(Close, "Price", colorDefault, styleCandle);
PlotShapes(Buy  * shapeUpArrow,   colorBrightGreen, 0, Low);
PlotShapes(Sell * shapeDownArrow, colorRed,         0, High);
_SECTION_END();`, { weight: 3, kind: 'system' }),

  // ------------------------------------------------------------------ explorations
  f('exp-summary', 'Exploration: Price & Volume Summary', EX, 'Lists close, % change, volume and RSI for every bar (a starting point for your own columns)', `
_SECTION_BEGIN("Exploration: Summary");
Filter = Volume > 0;
AddColumn(Close, "Close", 1.2);
AddColumn(ROC(Close, 1), "Chg %", 1.2);
AddColumn(Volume, "Volume", 1.0);
AddColumn(RSI(14), "RSI(14)", 1.1);
_SECTION_END();`, { kind: 'exploration' }),

  f('exp-52w-high', 'Scan: Closing at 52-week High', EX, 'Finds stocks that close at a new 250-day high', `
_SECTION_BEGIN("Scan: 52-week high");
Filter = Close >= HHV(High, 250) AND Volume > 0;
AddColumn(Close, "Close", 1.2);
AddColumn(ROC(Close, 1), "Chg %", 1.2);
AddColumn(Volume, "Volume", 1.0);
_SECTION_END();`, { kind: 'exploration' }),

  f('exp-delivery-spike', 'Scan: Delivery % Spike', EX, 'Delivery % is 1.5x its 20-day average on above-average volume (NSE)', `
_SECTION_BEGIN("Scan: Delivery spike");
Filter = DelPct > 1.5 * MA(DelPct, 20) AND Volume > MA(Volume, 20);
AddColumn(Close, "Close", 1.2);
AddColumn(DelPct, "Delivery %", 1.1);
AddColumn(MA(DelPct, 20), "Avg Del %", 1.1);
AddColumn(Volume / MA(Volume, 20), "Rel Vol", 1.2);
_SECTION_END();`, { kind: 'exploration' }),

  f('exp-volume-breakout', 'Scan: Volume Breakout', EX, 'Close above the 20-day high with at least 2x average volume', `
_SECTION_BEGIN("Scan: Volume breakout");
Filter = Close > Ref(HHV(High, 20), -1) AND Volume > 2 * MA(Volume, 20);
AddColumn(Close, "Close", 1.2);
AddColumn(ROC(Close, 1), "Chg %", 1.2);
AddColumn(Volume / MA(Volume, 20), "Rel Vol", 1.2);
_SECTION_END();`, { kind: 'exploration' }),
];
