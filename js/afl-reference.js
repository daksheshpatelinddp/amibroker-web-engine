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
LOGIC / SERIES
 Cross(a,b) (a crosses ABOVE b)  Flip(a,b)  BarsSince(cond)  ValueWhen(cond,array,n)  IIf(cond,x,y)
 Max(a,b)  Min(a,b)  Abs  Sqrt  Log  Log10  Exp  Int  Floor  Ceil  Round(x,decimals)  Sign  Sin  Cos  Tan  Atan  Mod(a,b)
 Nz(x) (Null to 0)  IsNull(x)  LastValue(array)  BeginValue(array)  BarIndex()
DATE / SYMBOL: DateNum() (YYMMDD from 1900)  Day()  Month()  Year()  DayOfWeek() (0=Sunday)  Name()  Interval() (seconds per bar: daily 86400)
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

USER SETTINGS (each one appears in the pane's Parameters dialog, so a trader changes a number without touching code)
 Param("name", default, min, max, step)           number with slider, e.g. Param("Period", 14, 2, 100, 1)
 ParamToggle("name","No|Yes",default)              ParamList("name","A|B|C","B")
 ParamColor("name", colorBlue)  (colorCycle as default cycles colors)      ParamStr("name","text")
 ParamField("Apply to", 3)  price-array dropdown: 0 Open 1 High 2 Low 3 Close (the default) 4 (H+L+C)/3 5 Volume 6 OI 7 Delivery 8 Delivery%
   e.g. src = ParamField("Apply to", 3); Plot(MA(src, 20), "MA", colorOrange);
 ParamStyle("name", styleLine|styleThick, maskDefault)  line-style check boxes; mask: maskDefault (thick dashed hidden ownscale) maskPrice maskHistogram maskAll
   e.g. st = ParamStyle("Style", styleThick); Plot(MA(Close,20), "MA", colorRed, st);
 ParamTrigger("name","Button text")  a button; returns 1 only on the redraw caused by pressing it, else 0
 ParamTime("name","09:30")  returns number HHMMSS (093000);  ParamTime("name","09:30",1) returns the text "09:30:00"
 ParamDate("name","2024-01-31")  returns DateNum (1240131);  ParamDate("name","2024-01-31",1) returns the text "2024-01-31"
 Defaults must be constants. Use a Param for EVERY number the user may want to change.
 _SECTION_BEGIN("title"); ... _SECTION_END();  (optional, ignored)

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
 SetOption("name",value)  GetOption("name")  SetTradeDelays(1,1,1,1)  SetPositionSize(size,type)  ApplyStop(type,mode,amount,exitAtStop)
   are stored with the formula for the Backtester; they do not change the chart.
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
