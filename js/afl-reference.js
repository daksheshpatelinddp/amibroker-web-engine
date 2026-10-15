// What this AFL engine supports. One text, used by the editor's Help screen AND by the AI assistant's prompt,
// so the AI is only ever told about functions that really exist. tests/afl-test.mjs checks every name below exists.

export const AFL_REFERENCE = `
PRICE ARRAYS: Open High Low Close Volume (short: O H L C V), Avg=(H+L)/2, OI, Delivery (NSE delivery qty), DelPct (delivery %)
CONSTANTS: BarCount, True, False, Null, PI

OPERATORS: + - * / % ^(power)  < > <= >= == !=  AND OR NOT (also & | &&  ||)  ?:  = += -= *= /= ++ --
 Everything works on whole arrays at once (one value per bar). Comparisons give 1 (true) or 0 (false) per bar.
 Comments: // line   /* block */   Every statement ends with ;
CONTROL: if(){} else{}  for(i=0;i<BarCount;i++){}  while(){}  do{}while();  break; continue; return;
 switch(x){ case 1: ...; break; case 2: ...; break; default: ...; }
 function name(a,b){ ...; return x; }     array[i] reads/writes one bar.

MOVING AVERAGES / SMOOTHING
 LinearReg(array,n)  AMA(array,k)  AMA2(array,k1,k2)  Median(array,n)  PercentRank(array,n)
 MA(array,n)  EMA(array,n)  WMA(array,n)  DEMA(array,n)  TEMA(array,n)  Wilders(array,n)
 Sum(array,n)  Cum(array)  LinRegSlope(array,n)  LinRegIntercept(array,n)  TSF(array,n)
HIGHEST / LOWEST / REFERENCE
 HHV(array,n)  LLV(array,n)  HHVBars(array,n)  LLVBars(array,n)  Highest(array,n)  Lowest(array,n)
 Ref(array,-1) (previous bar; positive looks ahead)  ROC(array,n) (% change)  StDev(array,n)  Correlation(a,b,n)
 HighestSince(condition,array,1)  LowestSince(condition,array,1)
ZIG-ZAG (swing highs / lows, percent change)
 Zig(array,percent)  Peak(array,percent,n)  Trough(array,percent,n)  PeakBars(array,percent,n)  TroughBars(array,percent,n)
 (Zig repaints: its last leg always runs to the latest bar. Peak/Trough/PeakBars/TroughBars never look ahead.)
INDICATORS (use the chart's own prices)
 RSI(n)  RSIa(array,n)  MACD(fast,slow)  Signal(fast,slow,signal)  ATR(n)  ADX(n)  PDI(n)  MDI(n)  CCI(n)
 StochK(n,smooth)  StochD(n,smoothK,smoothD)  MFI(n)  OBV()  SAR(acc,max)  TrueRange()
 BBandTop(array,n,width)  BBandBot(array,n,width)
 AccDist()  Chaikin(fast,slow)  NVI()  PVI()  OSCP(fast,slow)  OSCV(fast,slow)  RMI(periods,momentum)  RWI(min,max)  RWIHi  RWILo
 Ultimate(r1,r2,r3)  Trix(n)  RelStrength("base symbol")  HighestBars(array,n)  LowestBars(array,n)
 MARKET BREADTH (needs Tools > Analysis > Build market breadth): AdvIssues() DecIssues() UnchIssues() ADLine() Trin()
LOGIC / SERIES
 Cross(a,b) (a crosses ABOVE b)  Flip(a,b)  BarsSince(cond)  ValueWhen(cond,array,n)  IIf(cond,x,y)
 Max(a,b)  Min(a,b)  Abs  Sqrt  Log  Log10  Exp  Int  Floor  Ceil  Round(x,decimals)  Sign  Sin  Cos  Tan  Atan  Mod(a,b)
 Nz(x) (Null to 0)  IsNull(x)  LastValue(array)  BeginValue(array)  BarIndex()
OTHER SYMBOLS: Foreign("SYMBOL","C")  (fields O H L C V)  SetForeign("SYMBOL") ... RestorePriceArrays()  PlotForeign("SYMBOL","name",color,style)
CATEGORIES: InWatchList(n) InWatchListName("name") InFavorites() InGroup(n) InMarket(n) InSector(n) InIndustry(n) InIndex(n)  GroupID() MarketID() SectorID() IndustryID()  CategoryGetSymbols(categoryWatchlist,n) (comma list)  CategoryGetName(cat,n)  CategoryFind("name",cat)  CategoryAddSymbol("SYM",cat,n)  CategoryRemoveSymbol  (cat = categoryMarket categoryGroup categorySector categoryIndustry categoryWatchlist categoryFavorite categoryIndex categoryAll; n = position in the list, starting at 0)
DATE / SYMBOL: DateTime() DateTimeToStr(x) DateNum() (YYMMDD from 1900)  Day()  Month()  Year()  DayOfWeek() (0=Sunday)  Name()  Interval() (seconds per bar: daily 86400)
STATUS: Status("action") (actionIndicator actionCommentary actionScan actionExplore actionBacktest actionOptimize)  Status("firstvisiblebar") Status("lastbarinrange") Status("stocknum")
VARIABLES / TEXT: VarSet("name",x)  VarGet("name")  printf("%s",text)  WriteIf(cond,"a","b")  StrExtract(list,i)  StrFind StrMid StrLeft StrRight StrReplace StrToNum
 NumToStr(x,1.2)  WriteVal(x,1.2)  StrFormat("%g %.2f %s %d",...)  StrLen(text)  text + text

DRAWING ON THE CHART
 Plot(array, "name", color, style)     style examples: styleLine (default) styleHistogram styleCandle styleBar styleArea
   styleThick styleDots styleDashed styleStaircase styleNoLine styleOwnScale (own price axis, e.g. volume under price) styleNoLabel
   styles are combined with |   e.g. styleHistogram|styleThick     color can also be an array: IIf(Close>Open,colorGreen,colorRed)
 PlotOHLC(open,high,low,close,"name",color,styleCandle)       (styleCandle or styleBar)
 PlotShapes(shape*condition, color, 0, Low or High)           shapes: shapeUpArrow shapeDownArrow shapeCircle shapeSquare
   shapeSmallUpTriangle shapeSmallDownTriangle shapeStar shapeUpTriangle shapeDownTriangle shapeDigit0..shapeDigit9
   e.g. PlotShapes(Buy*shapeUpArrow, colorGreen, 0, Low);  PlotShapes(Sell*shapeDownArrow, colorRed, 0, High);
 Plot(array,name,color,style, minY, maxY, XShift, ZOrder)  XShift moves the line left/right in bars (Ichimoku uses +delay)
 PlotOHLC(...,styleCloud) shaded cloud between the high and low arrays: PlotOHLC(top,top,bottom,bottom,"",color,styleCloud|styleNoLabel)
 styleGradient with SetGradientFill(topColor,bottomColor)   PlotVAPOverlay(lines,width,color,flags)  PlotVAPOverlayA(segments,lines,width,color,flags)
 ColorBlend(c1,c2,factor)  ColorHSB(h,s,b)  GetChartBkColor()  GetPriceStyle()  SetChartOptions(0,chartShowArrows|chartShowDates,chartGrid30|chartGrid70)
 PlotGrid(level, color)               horizontal line, e.g. PlotGrid(70);
 Title = "text {{NAME}} {{DATE}} {{OHLCX}}";
COLORS: colorDefault colorBlack colorWhite colorRed colorGreen colorBrightGreen colorBlue colorLightBlue colorSkyblue colorAqua
 colorYellow colorGold colorOrange colorLightOrange colorPink colorViolet colorLime colorTeal colorGrey40 colorGrey50 colorLightGrey
 colorDarkRed colorDarkGreen colorDarkBlue colorBrown colorPlum colorTurquoise colorLavender colorRose colorTan   ColorRGB(r,g,b)

USER SETTINGS (each one appears in the pane's Parameters dialog, so a trader changes a number without touching code)
 Param("name", default, min, max, step)           number with slider, e.g. Param("Period", 14, 2, 100, 1)
 ParamToggle("name","No|Yes",default)              ParamList("name","A,B,C","B")  (items separated by | or ,)
 ParamColor("name", colorBlue)  (colorCycle as default cycles colors)      ParamStr("name","text")
 ParamField("Apply to", -1)  price-array dropdown: 0 Open 1 High 2 Low 3 Close (default, -1) 4 Volume 5 OpenInt 6 Avg; 7 and up = arrays already plotted by the formula
   e.g. src = ParamField("Apply to", -1); Plot(MA(src, 20), "MA", colorOrange);
 ParamStyle("name", styleLine|styleThick, maskDefault)  line-style check boxes; mask: maskDefault, maskPrice (adds candle/bar), maskHistogram, maskAll
   e.g. st = ParamStyle("Style", styleThick); Plot(MA(Close,20), "MA", colorRed, st);
 ParamTrigger("name","Button text")  a button; returns 1 only on the redraw caused by pressing it, else 0
 ParamTime("name","09:30")  returns number HHMMSS (093000);  ParamTime("name","09:30",1) returns the text "09:30:00"
 ParamDate("name","2024-01-31")  returns DateNum (1240131);  ParamDate("name","2024-01-31",1) returns the text "2024-01-31"
 Defaults must be constants. Use a Param for EVERY number the user may want to change.
 _SECTION_BEGIN("title"); ... _SECTION_END();  every section has its own parameters (the same name can be used in several sections)
 _DEFAULT_NAME()  _SECTION_NAME()  _PARAM_VALUES()  names/values for plot legends

ON-CHART CONTROLS (buttons, boxes and sliders drawn on top of the pane; the formula hears about clicks through events)
 GuiButton("text", id, x, y, width, height, notifyClicked)     GuiCheckBox("text", id, x, y, w, h, notifyClicked)
 GuiRadio("text", id, x, y, w, h, notifyClicked)  (radio buttons created one after another form one group)
 GuiSlider(id, x, y, w, h, notifyEditChange)  GuiEdit(id, x, y, w, h, notifyEditChange)  GuiDateTime(id, x, y, w, h, notifyEditChange)
   id = unique whole number above 0; x,y = pixels from the top-left corner of the pane. Each returns guiNew the first time, guiExisting after.
 GuiGetCheck(id) 1/0   GuiSetCheck(id,1)   GuiGetValue(id) (slider number / edit number / date as DateNum)   GuiSetValue(id,v)
 GuiSetRange(id,min,max,step,tickfreq) for a slider   GuiGetText(id)   GuiSetText("text",id)   GuiEnable(id,1or0)   GuiDestroy(id) or GuiDestroy()
 GuiGetEvent(n,0) = id of the n-th click/change since the last redraw (0 when there are no more), GuiGetEvent(n,1) = what happened.
 notify flags: notifyClicked notifyEditChange notifyHitReturn (combine with |)
 Pattern: create the controls every time the formula runs, set start values only when guiNew, then read the state:
   if (GuiSlider(2, 130, 8, 160, 22, notifyEditChange) == guiNew) { GuiSetRange(2, 5, 200, 1, 10); GuiSetValue(2, 20); }
   for (n = 0; id = GuiGetEvent(n, 0); n++) { if (id == 3) GuiSetValue(2, 20); }   // handle a Reset button
   len = GuiGetValue(2);   Plot(EMA(Close, len), "EMA", colorOrange);

TRADING RULES (scanner / exploration / backtest)
 Buy = condition;  Sell = condition;  Short = condition;  Cover = condition;   (arrays of 1/0)
 BuyPrice = Close; SellPrice = Close; (optional)   PositionSize = -10;  (-10 means 10% of equity)
 Filter = condition;                                   (scan / exploration: only bars where this is true are listed)
 AddColumn(array,"name",1.2);   AddTextColumn("text","name");     (exploration result columns)
 AddColumn(array,"name",format,fg,bg,width) format: 1.2 digits | formatChar | formatDateTime;  AddMultiTextColumn(array,"a\nb\nc","name");
 AddRankColumn();  SetSortColumns(2,-4) (column 2 up, column 4 down);  AddSummaryRows(1+2+4+8+16)  total,min,max,average,count;  Exclude = 1 hides a row
 OptimizerSetEngine("spso");  OptimizerSetOption("Runs",100);  ApplyStop(type,mode,amount,exitAtStop,volatile,reEntryDelay,validFrom,validTo)
 Futures: PointValue, MarginDeposit, RoundLotSize, TickSize variables
 SetOption("InitialEquity",100000) "MaxOpenPositions" "CommissionMode" (1 %, 2 per trade, 3 per share) "CommissionAmount" "WorstRankHeld" "AllowPositionShrinking" ...
 SetTradeDelays(buy,sell,short,cover)  SetPositionSize(size, spsPercentOfEquity | spsValue | spsShares)  PositionSize = -25 (25% of equity)
 ApplyStop(stopTypeLoss|stopTypeProfit|stopTypeTrailing|stopTypeNBar, stopModePercent|stopModePoint, amount, exitAtStop)
 SetBacktestMode(backtestRotational) with PositionScore = rank (higher is bought first; must be above 0)
 Optimize("name",default,min,max,step) = a number the Optimizer tries every value of (acts as the default in normal runs)
 Equity(1)  XYChartAddPoint("chart","text",x,y,color)  XYChartSetAxis("chart","xlabel","ylabel")  ExRem(a,b)  Hold  SumSince
 These run from Tools > Analysis (Scan, Explore, Backtest, Optimize).
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
