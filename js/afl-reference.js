// What this AFL engine supports. One text, used by the editor's Help screen AND by the AI assistant's prompt,
// so the AI is only ever told about functions that really exist. tests/afl-test.mjs checks every name below exists.

export const AFL_REFERENCE = `
PRICE ARRAYS: Open High Low Close Volume (short: O H L C V), Avg=(H+L)/2, OI, Delivery (NSE delivery qty), DelPct (delivery %)
CONSTANTS: BarCount, True, False, Null, PI

OPERATORS: + - * / % ^(power)  < > <= >= == !=  AND OR NOT (also & | &&  ||)  ?:  = += -= *= /= ++ --
 Everything works on whole arrays at once (one value per bar). Comparisons give 1 (true) or 0 (false) per bar.
 Comments: // line   /* block */   Every statement ends with ;
CONTROL: if(){} else{}  for(i=0;i<BarCount;i++){}  while(){}  do{}while();  break; continue; return;
 function name(a,b){ ...; return x; }     array[i] reads/writes one bar.

MOVING AVERAGES / SMOOTHING
 MA(array,n)  EMA(array,n)  WMA(array,n)  DEMA(array,n)  TEMA(array,n)  Wilders(array,n)
 Sum(array,n)  Cum(array)  LinRegSlope(array,n)  LinRegIntercept(array,n)  TSF(array,n)
HIGHEST / LOWEST / REFERENCE
 HHV(array,n)  LLV(array,n)  HHVBars(array,n)  LLVBars(array,n)  Highest(array,n)  Lowest(array,n)
 Ref(array,-1) (previous bar; positive looks ahead)  ROC(array,n) (% change)  StDev(array,n)  Correlation(a,b,n)
 HighestSince(condition,array,1)  LowestSince(condition,array,1)
INDICATORS (use the chart's own prices)
 RSI(n)  RSIa(array,n)  MACD(fast,slow)  Signal(fast,slow,signal)  ATR(n)  ADX(n)  PDI(n)  MDI(n)  CCI(n)
 StochK(n,smooth)  StochD(n,smoothK,smoothD)  MFI(n)  OBV()  SAR(acc,max)  TrueRange()
 BBandTop(array,n,width)  BBandBot(array,n,width)
LOGIC / SERIES
 Cross(a,b) (a crosses ABOVE b)  Flip(a,b)  BarsSince(cond)  ValueWhen(cond,array,n)  IIf(cond,x,y)
 Max(a,b)  Min(a,b)  Abs  Sqrt  Log  Log10  Exp  Int  Floor  Ceil  Round(x,decimals)  Sign  Sin  Cos  Tan  Atan  Mod(a,b)
 Nz(x) (Null to 0)  IsNull(x)  LastValue(array)  BeginValue(array)  BarIndex()
DATE / SYMBOL: DateNum() (YYMMDD from 1900)  Day()  Month()  Year()  DayOfWeek() (0=Sunday)  Name()  Interval()
TEXT: NumToStr(x,1.2)  WriteVal(x,1.2)  StrFormat("%g %.2f %s %d",...)  StrLen(text)  text + text

DRAWING ON THE CHART
 Plot(array, "name", color, style)     style examples: styleLine (default) styleHistogram styleCandle styleBar styleArea
   styleThick styleDots styleDashed styleStaircase styleNoLine styleOwnScale (own price axis, e.g. volume under price) styleNoLabel
   styles are combined with |   e.g. styleHistogram|styleThick     color can also be an array: IIf(Close>Open,colorGreen,colorRed)
 PlotOHLC(open,high,low,close,"name",color,styleCandle)       (styleCandle or styleBar)
 PlotShapes(shape*condition, color, 0, Low or High)           shapes: shapeUpArrow shapeDownArrow shapeCircle shapeSquare
   shapeSmallUpTriangle shapeSmallDownTriangle shapeStar shapeUpTriangle shapeDownTriangle shapeDigit0..shapeDigit9
   e.g. PlotShapes(Buy*shapeUpArrow, colorGreen, 0, Low);  PlotShapes(Sell*shapeDownArrow, colorRed, 0, High);
 PlotGrid(level, color)               horizontal line, e.g. PlotGrid(70);
 Title = "text {{NAME}} {{DATE}} {{OHLCX}}";
COLORS: colorDefault colorBlack colorWhite colorRed colorGreen colorBrightGreen colorBlue colorLightBlue colorSkyblue colorAqua
 colorYellow colorGold colorOrange colorLightOrange colorPink colorViolet colorLime colorTeal colorGrey40 colorGrey50 colorLightGrey
 colorDarkRed colorDarkGreen colorDarkBlue colorBrown colorPlum colorTurquoise colorLavender colorRose colorTan   ColorRGB(r,g,b)

USER SETTINGS (appear in the Parameters dialog, so no code editing is needed)
 Param("name", default, min, max, step)     ParamToggle("name","No|Yes",default)     ParamList("name","A|B|C",default)
 ParamColor("name", colorBlue)              _SECTION_BEGIN("title"); ... _SECTION_END();  (optional, ignored)

TRADING RULES (scanner / exploration / backtest)
 Buy = condition;  Sell = condition;  Short = condition;  Cover = condition;   (arrays of 1/0)
 BuyPrice = Close; SellPrice = Close; (optional)   PositionSize = -10;  (-10 means 10% of equity)
 Filter = condition;                                   (scan / exploration: only bars where this is true are listed)
 AddColumn(array,"name",1.2);   AddTextColumn("text","name");     (exploration result columns)
 SetOption("name",value); SetTradeDelays(1,1,1,1); ApplyStop(...) are accepted and ignored for now.
`;

// A complete worked example for the AI prompt (kept short on purpose)
export const AFL_EXAMPLE = `// EMA crossover with arrows
_SECTION_BEGIN("EMA Cross");
fast = Param("Fast EMA", 9, 2, 200, 1);
slow = Param("Slow EMA", 21, 2, 400, 1);
Plot(Close, "Price", colorDefault, styleCandle);
Plot(EMA(Close, fast), "Fast", colorOrange, styleThick);
Plot(EMA(Close, slow), "Slow", colorSkyblue, styleThick);
Buy  = Cross(EMA(Close, fast), EMA(Close, slow));
Sell = Cross(EMA(Close, slow), EMA(Close, fast));
PlotShapes(Buy  * shapeUpArrow,   colorBrightGreen, 0, Low);
PlotShapes(Sell * shapeDownArrow, colorRed,         0, High);
_SECTION_END();`;
