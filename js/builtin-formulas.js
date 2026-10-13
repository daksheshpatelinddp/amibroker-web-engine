// Built-in formula library = AmiBroker's own formulas (Formula.pdf), in AmiBroker's groups:
//   Averages · Bands · Basic Chart · Equity · Exploration · Indicators · Report Charts · Systems
// plus two extras that AmiBroker users expect: "GUI" (the on-chart control tutorial) and "NSE Data" (delivery columns).
// Every formula is real AFL: open it from Tools > Formula Editor, change it and "Save As" a copy of your own.
//   kind:    'chart' (draws) | 'system' (Buy/Sell rules for the Backtester) | 'exploration' (Filter + AddColumn for the Scanner)
//   overlay: true = it belongs on the price pane (moving averages, bands...), so "Add to chart" inserts it there
//   needs:   data the formula expects, shown as a hint (market breadth, ~~~EQUITY ...)
const R = String.raw;
const f = (key, name, category, description, code, extra = {}) => ({ key, name, category, description, code: code.trim() + '\n', kind: 'chart', weight: 1, ...extra });

export const GROUPS = ['Averages', 'Bands', 'Basic Chart', 'Equity', 'Exploration', 'Indicators', 'Report Charts', 'Systems', 'GUI (on-chart controls)', 'NSE Data'];

// ---- Averages: one template, eight functions
const avg = (key, fn, desc) => f(key, fn, 'Averages', desc, R`
P = ParamField("Price field",-1);
Periods = Param("Periods", 15, 2, 300, 1, 10 );
Plot( ${fn}( P, Periods ), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`, { overlay: true, weight: 1 });

const AVERAGES = [
  avg('dema', 'DEMA', 'Double exponential moving average'),
  f('multi-ma', 'Multi-Type Moving Average', 'Averages', 'One moving average whose type (simple, exponential, double, triple, Wilders, weighted) you pick in Parameters', R`
P = ParamField("Field");
Type = ParamList("Type", "Simple,Exponential,Double Exponential,Tripple Exponential,Wilders,Weighted");
Periods = Param("Periods", 30, 2, 300 );
Displacement = Param("Displacement", 15, -50, 50 );
m = 0;

if( Type == "Simple" )          m = MA( P, Periods );
if( Type == "Exponential" )       m = EMA( P, Periods );
if( Type == "Double Exponential" ) m = DEMA( P, Periods );
if( Type == "Tripple Exponential" )   m = TEMA( P, Periods );
if( Type == "Wilders" )         m = Wilders( P, Periods );
if( Type == "Weighted" )        m = WMA( P, Periods );

Plot( m, _DEFAULT_NAME(), ParamColor("Color", ColorCycle), ParamStyle("Style"), 0, 0, Displacement );`, { overlay: true }),
  avg('ema', 'EMA', 'Exponential moving average'),
  avg('linearreg', 'LinearReg', 'Linear regression line over the last N bars'),
  avg('ma', 'MA', 'Simple moving average'),
  avg('tema', 'TEMA', 'Triple exponential moving average'),
  avg('tsf', 'TSF', 'Time series forecast (linear regression projected one bar ahead)'),
  avg('wilders', 'Wilders', 'Wilder\'s smoothing'),
  avg('wma', 'WMA', 'Linearly weighted moving average'),
];

const BANDS = [
  f('bb-cloud', 'Bollinger Bands (Cloud)', 'Bands', 'Bollinger Bands with the area between the bands shaded', R`
P = ParamField("Price field",-1);
Periods = Param("Periods", 15, 2, 100, 1 );
Width = Param("Width", 2, 0, 10, 0.05 );
Color = ParamColor("Color", colorLightGrey );
Style = ParamStyle("Style", styleLine | styleNoLabel ) | styleNoLabel;
Plot( bbt = BBandTop( P, Periods, Width ), "BBTop" + _PARAM_VALUES(), Color, Style );
Plot( bbb = BBandBot( P, Periods, Width ), "BBBot" + _PARAM_VALUES(), Color, Style );
PlotOHLC( bbt, bbt, bbb, bbb, "", ColorBlend( Color, GetChartBkColor(), 0.8 ), styleNoLabel | styleCloud | styleNoRescale, Null, Null, Null, -1 );`, { overlay: true }),
  f('bbands', 'Bollinger Bands', 'Bands', 'Upper and lower Bollinger Bands', R`
P = ParamField("Price field",-1);
Periods = Param("Periods", 15, 2, 300, 1 );
Width = Param("Width", 2, 0, 10, 0.05 );
Color = ParamColor("Color", colorCycle );
Style = ParamStyle("Style");
Plot( BBandTop( P, Periods, Width ), "BBTop" + _PARAM_VALUES(), Color, Style );
Plot( BBandBot( P, Periods, Width ), "BBBot" + _PARAM_VALUES(), Color, Style );`, { overlay: true }),
  f('keltner', 'Keltner Bands', 'Bands', 'Moving average +/- a multiple of ATR', R`
P = ParamField("Price field",-1);
Periods = Param("Periods", 15, 2, 300, 1 );
Width = Param("Width", 2, 0, 10, 0.05 );
Color = ParamColor("Color", colorCycle );
Style = ParamStyle("Style", styleLine | styleNoLabel);

CenterLine = MA( P, Periods );
KTop   = CenterLine + Width * ATR( Periods );
KBot = CenterLine - Width * ATR( Periods );

Plot( KTop, "KBTop" + _PARAM_VALUES(), Color, Style );
Plot( KBot, "KBBot" + _PARAM_VALUES(), Color, Style );`, { overlay: true }),
  f('envelopes', 'Percentage Envelopes', 'Bands', 'Moving average +/- a fixed percentage', R`
P = ParamField("Price field",-1);
Periods = Param("Periods", 15, 2, 300, 1 );
Width = Param("Width%", 2, 0, 10, 0.05 );
Color = ParamColor("Color", colorCycle );
Style = ParamStyle("Style", styleLine | styleNoLabel );
CenterLine = MA( P, Periods );
Plot( (1 + Width * 0.01) * CenterLine, "%EnvTop" + _PARAM_VALUES(), Color, Style );
Plot( (1 - Width * 0.01) * CenterLine, "%EnvBot" + _PARAM_VALUES(), Color, Style );`, { overlay: true }),
];

const TITLE_OHLC = R`_N(Title = StrFormat("{{NAME}} - {{INTERVAL}} {{DATE}} Open %g, Hi %g, Lo %g, Close %g (%.1f%%) {{VALUES}}", O, H, L, C, SelectedValue( ROC( C, 1 ) ) ));`;

const BASIC = [
  f('gradient-price', 'Gradient Price', 'Basic Chart', 'Close line with a colour gradient filled under it', R`
SetChartOptions(0,chartShowArrows|chartShowDates);
_N(Title = StrFormat("{{NAME}} - {{INTERVAL}} {{DATE}} Open %g, Hi %g, Lo %g, Close %g (%.1f%%) {{VALUES}}", O, H, L, C, SelectedValue( ROC( C, 1 ) ) ));
Ct = ParamColor("Top", colorLightOrange);
Cb = ParamColor("Bottom", colorPaleGreen );
SetGradientFill( Ct, Cb );
Plot( C, "Close", ColorBlend( Cb, colorGrey50 ) , styleGradient | styleLine, Null, Null, 0, -1 );`, { weight: 3 }),
  f('ichimoku', 'Ichimoku', 'Basic Chart', 'Ichimoku Kinko Hyo: standard and turning lines with the shaded cloud (Span 1 / Span 2)', R`
prds = Param( "Standard Line Periods", 13, 5, 26, 1 );
turn = Param( "Turning Line Periods", 3, 3, 10, 1 );
delay = Param( "Delayed Line Periods", 12, 4, 25, 1 );
span = Param( "Spans Periods", 16, 10, 52, 1 );

TL = ( HHV( H, turn ) + LLV( L, turn ) ) / 2;
SL = ( HHV( H, prds ) + LLV( L, prds ) ) / 2;
DL = Ref( C, delay );
Sp1 = ( SL + TL ) / 2;
Sp2 = ( HHV( H, span ) + LLV( L, span ) ) / 2;

_N( Title = StrFormat( "{{NAME}} - {{INTERVAL}} {{DATE}} Open %g, Hi %g, Lo %g, Close %g (%.1f%%) Vol " + WriteVal( V, 1.0 ) + " {{VALUES}}", O, H, L, C, SelectedValue( ROC( C, 1 ) ) ) );

Plot( C, "Close", colorDefault, styleNoTitle | GetPriceStyle() );
Plot( SL, "SL", colorRed, styleThick | styleNoLabel );
Plot( TL, "TL", colorGreen, styleThick | styleNoLabel );
color = IIf( Sp1 > Sp2, ParamColor( "Span1 Color", ColorRGB( 0, 255, 0 ) ), ParamColor( "Span2 Color", ColorRGB( 255, 104, 32 ) ) );
PlotOHLC ( Sp1, Sp1, Sp2, Sp2, "Cloud", Color, styleCloud | styleNoLabel, Null, Null, delay, -2 );`, { weight: 3 }),
  f('open-interest', 'Open Interest', 'Basic Chart', 'Open interest (futures data; the NSE cash data has none, so it shows zero)', R`
Plot( OpenInt, _DEFAULT_NAME(), ParamColor("Color", colorCycle ), ParamStyle( "Style" ) );`),
  f('price-ma-bb-vol', 'Price with Moving Averages, Bollinger Bands, Volume and Interpretation', 'Basic Chart', 'Price, three moving averages, Bollinger Bands with cloud and volume. Use "Commentary" in the pane menu for the written interpretation', R`
_SECTION_BEGIN("Price");
SetChartOptions(0,chartShowArrows|chartShowDates);
_N(Title = StrFormat("{{NAME}} - {{INTERVAL}} {{DATE}} Open %g, Hi %g, Lo %g, Close %g (%.1f%%) Vol " +WriteVal( V, 1.0 ) +" {{VALUES}}", O, H, L, C, SelectedValue( ROC( C, 1 )) ));
Plot( C, "Close", ParamColor("Color", colorDefault ), styleNoTitle | ParamStyle("Style") | GetPriceStyle() );
_SECTION_END();

_SECTION_BEGIN("MA");
P = ParamField("Price field",-1);
Periods = Param("Periods", 15, 2, 200, 1 );
Plot( MA( P, Periods ), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style", styleLine | styleNoLabel ) | styleNoRescale );
_SECTION_END();

_SECTION_BEGIN("Mid MA");
P = ParamField("Price field",-1);
Periods = Param("Periods", 45, 2, 300, 1 );
Plot( MA( P, Periods ), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style", styleLine | styleNoLabel ) | styleNoRescale );
_SECTION_END();

_SECTION_BEGIN("Long MA");
P = ParamField("Price field",-1);
Periods = Param("Periods", 100, 2, 400, 1 );
Plot( MA( P, Periods ), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style", styleLine | styleNoLabel ) | styleNoRescale );
_SECTION_END();

_SECTION_BEGIN("BBands");
P = ParamField("Price field",-1);
Periods = Param("Periods", 15, 2, 100, 1 );
Width = Param("Width", 2, 0, 10, 0.05 );
Color = ParamColor("Color", colorLightGrey );
Color = ColorBlend( Color, GetChartBkColor(), 0.5 );
Style = ParamStyle("Style", styleLine | styleNoLabel ) | styleNoRescale;;
Plot( bbt = BBandTop( P, Periods, Width ), "BBTop" + _PARAM_VALUES(), Color, Style );
Plot( bbb = BBandBot( P, Periods, Width ), "BBBot" + _PARAM_VALUES(), Color, Style );
PlotOHLC( bbt, bbt, bbb, bbb, "", ColorBlend( Color, GetChartBkColor(), 0.7 ), styleNoLabel | styleCloud | styleNoRescale, Null, Null, Null, -1 );
_SECTION_END();

_SECTION_BEGIN("Volume");
Color = ParamColor("Color", ColorRGB( 128, 128, 192 ) );
Plot( Volume, _DEFAULT_NAME(), ColorBlend( Color, GetChartBkColor(), 0.5   ), styleNoTitle | ParamStyle( "Style", styleHistogram | styleOwnScale | styleThick | styleNoLabel, maskHistogram ), 2 );
_SECTION_END();

_SECTION_BEGIN("Price Interpretation");
movshort = ParamField("Short Time MA", 8 );
movmed = ParamField("Mid Time MA", 9 );
movlong = ParamField("Long Time MA", 10 );
btop = ParamField("BBTop", 11 );
bbot = ParamField("BBBottom", 12 );
if( Status("action") == actionCommentary )
{
width = btop - bbot;
lslop = LinRegSlope( C, 30 ) + 100;
lslo = LLV( lslop, 90 );
lshi = HHV( lslop, 90 );
lswidth = lshi - lslo;
trend = 100*( lslop - lslo )/lswidth;

mawidth = MA( width, 100 );
relwidth = 100*(width - mawidth)/mawidth;

_N( tname = Name()+"("+FullName()+")" );

printf("Price and moving averages:\n");
printf( "%s", tname + " has closed " + WriteIf( C > movshort, "above" , "below" ) + " its Short time moving average. ");

printf( "%s", "\nShort time moving average is currently " + WriteIf( movshort > movmed, "above", "below") + " mid-time, AND " + WriteIf( movshort > movlong, "above", "below" ) + " long time moving averages.");


printf( "%s", "\nThe relationship between price and moving averages is: "+
WriteIf( C > movshort AND movshort > movmed, "bullish",
WriteIf( C < movshort AND movshort < movmed, "bearish", "neutral" ) ) + " in short-term, and "+
WriteIf( movshort > movmed AND movmed > movlong , "bullish",
WriteIf( movshort < movmed AND movmed < movlong, "bearish", "neutral" ) ) + " in mid-long term. ");

printf("\n\nBollinger Bands:\n");
printf("%s", tname+ " has closed " +
WriteIf( C < bbot, "below the lower band by " +
WriteVal( 100 *( bbot-C )/ width, 1.1 ) + "%. " +
WriteIf( trend < 30, " This combined with the steep downtrend can suggest that the downward trend in prices has a good chance of continuing.   However, a short-term pull-back inside the bands is likely.",
WriteIf( trend > 30 AND trend < 70, "Although prices have broken the lower band and a downside breakout is possible, the most likely scenario for "+tname+" is to continue within current trading range.", "" ) ), "" ) +

WriteIf( C > btop, "above the upper band by " +
WriteVal( 100 *( C- btop )/ width, 1.1 ) + "%. " +
WriteIf( trend > 70, " This combined with the steep uptrend suggests that the upward trend in prices has a good chance of continuing.    However, a short-term pull-back inside the bands is likely.",
WriteIf( trend > 30 AND trend < 70, "Although prices have broken the upper band and a upside breakout is possible, the most likely scenario for "+tname+" is to continue within current trading range.", "" ) ), "" ) +

WriteIf( C < btop AND ( ( btop - C ) / width ) < 0.5,
"below upper band by " +
WriteVal( 100 *( btop - C )/ width, 1.1 ) + "%. ",
WriteIf( C < btop AND C > bbot , "above bottom band by " +
WriteVal( 100 *( C - bbot )/ width, 1.1 ) + "%. ", "" ) ));

printf("%s", "\n"+
WriteIf( ( trend > 30 AND trend < 70 AND ( C > btop OR C < bbot ) ) AND abs(relwidth) > 40,
        "This picture becomes somewhat unclear due to the fact that Bollinger Bands are   currently",
     "Bollinger Bands are " )+
WriteVal( abs( relwidth ), 1.1 ) + "% " +
WriteIf( relwidth > 0, "wider" , "narrower" ) +
" than normal.");

printf("\n");

printf("%s",
WriteIf( abs( relwidth ) < 40, "The current width of the bands (alone) does not suggest anything conclusive about the future volatility or movement of prices.","")+
WriteIf( relwidth < -40, "The narrow width of the bands suggests low volatility as compared to " + tname + "'s normal range. Therefore, the probability of volatility increasing with a sharp price move has increased for the near-term. "+
"The bands have been in this narrow range for " + WriteVal(BarsSince(Cross(-40,relwidth)),1.0) + " bars. The probability of a significant price move increases the longer the bands remain in this narrow range." ,"")+
WriteIf( relwidth > 40, "The large width of the bands suggest high volatility as compared to " + tname + "'s normal range. Therefore, the probability of volatility decreasing and prices entering (or remaining in) a trading range has increased for the near-term. "+
"The bands have been in this wide range for    " + WriteVal(BarsSince(Cross(relwidth,40)),1.0) + " bars.The probability of prices consolidating into a less volatile trading range increases the longer the bands remain in this wide range." ,""));

printf("\n\nThis commentary is not a recommendation to buy or sell. Use at your own risk.");
}
_SECTION_END();`, { weight: 3, commentary: true }),
  f('plot-foreign', 'Plot Foreign', 'Basic Chart', 'Draws another symbol (type its name in Parameters) in this pane', R`
Ticker = ParamStr("Symbol", "NIFTY" );
PlotForeign( Ticker, Ticker, ParamColor("Color", colorCycle ), ParamStyle("Style") | GetPriceStyle() );`, { needs: 'Another symbol from your database' }),
  f('price', 'Price', 'Basic Chart', 'The standard price chart. Candlestick / bar / line style comes from the price style setting (Tools menu) or Parameters', R`
SetChartOptions(0,chartShowArrows|chartShowDates);
_N(Title = StrFormat("{{NAME}} - {{INTERVAL}} {{DATE}} Open %g, Hi %g, Lo %g, Close %g (%.1f%%) {{VALUES}}", O, H, L, C, SelectedValue( ROC( C, 1 ) ) ));
Plot( C, "Close", ParamColor("Color", colorDefault ), styleNoTitle | ParamStyle("Style") | GetPriceStyle() );`, { weight: 3 }),
  f('relative-performance', 'Relative Performance', 'Basic Chart', 'Percent change since the first visible bar for this symbol and a list of others (comma separated in Parameters)', R`
_N( TickerList = ParamStr("Tickers", "NIFTY,RELIANCE,TCS") );
NumBars = 20;
fvb = Status("firstvisiblebar");
Plot( 100 * ( C - C[ fvb ] ) / C[ fvb ], Name(), colorBlue );
for( i = 0; ( symbol = StrExtract( TickerList, i ) ) != ""; i++ )
{
    fc = Foreign( symbol, "C" );

    if( ! IsNull( fc[ 0 ] ) )
    {
        Plot( 100 * ( fc - fc[ fvb ] )/ fc[ fvb ], symbol, colorLightOrange + ( (2*i) % 15 ), styleLine );
 }
}
PlotGrid( 0, colorYellow );
_N( Title = "{{NAME}} - Relative Performance [%]: {{VALUES}}" );`, { needs: 'Other symbols from your database' }),
  f('spread', 'Spread', 'Basic Chart', 'Difference or ratio between this symbol and a second symbol', R`
_N( Symbol2= ParamStr("Symbol2", "TCS") );
Mode = ParamToggle("Mode", "Difference (Symbol1-Symbol2)|Ratio (Symbol1/Symbol2)");

SetForeign( Symbol2 );
C2 = C;
H2 = H;
L2 = L;
O2 = O;
V2 = V;
RestorePriceArrays();


Color = ParamColor( "Color", colorDefault );
Style = ParamStyle( "Style", styleLine, maskPrice );

if( Mode == 0 )
 PlotOHLC( O-O2, H-H2, L-L2, C-C2, "(" + Name()+" - "+Symbol2 + ") spread", Color, style );
else
 PlotOHLC( O/O2, H/H2, L/L2, C/C2, "(" + Name()+" / "+Symbol2 + ") spread", Color, style );`, { needs: 'A second symbol from your database' }),
  f('volume', 'Volume', 'Basic Chart', 'Volume histogram, green on up days and red on down days', R`
Plot( Volume, _DEFAULT_NAME(), IIf( C > O, ParamColor("Up Color", colorGreen ), ParamColor("Down Color", colorRed ) ), ParamStyle( "Style", styleHistogram | styleThick, maskHistogram ) );`),
  f('vap-segments', 'Volume At Price (VAP)', 'Basic Chart', 'Price chart with a volume-at-price profile for each month (each day on intraday data)', R`
_SECTION_BEGIN("Price");
SetChartOptions(0,chartShowArrows|chartShowDates);
_N(Title = StrFormat("{{NAME}} - {{INTERVAL}} {{DATE}} Open %g, Hi %g, Lo %g, Close %g (%.1f%%) {{VALUES}}", O, H, L, C, SelectedValue( ROC( C, 1 ) ) ));
Plot( C, "Close", ParamColor("Color", colorDefault ), styleNoTitle | ParamStyle("Style") | GetPriceStyle() );
_SECTION_END();


_SECTION_BEGIN("VAP");
segments = IIf( Interval() < inDaily, Day(), Month() );
segments = segments != Ref( segments , -1 );

PlotVAPOverlayA( segments , Param("Lines", 300, 100, 1000, 1 ), Param("Width", 80, 1, 100, 1 ), ParamColor("Color", colorGold ), ParamToggle("Side", "Left|Right" ) | 2 * ParamToggle("Style", "Fill|Lines", 0) | 4*ParamToggle("Z-order", "On top|Behind", 1 ) );
Plot(segments, "", colorLightGrey, styleHistogram | styleOwnScale );
_SECTION_END();`, { weight: 3 }),
  f('vap', 'Volume At Price', 'Basic Chart', 'Volume-at-price profile over the visible bars, drawn on the price pane', R`
PlotVAPOverlay( Param("Lines", 300, 100, 1000, 1 ), Param("Width", 5, 1, 100, 1 ), ParamColor("Color", colorCycle ), ParamToggle("Side", "Left|Right" ) | 4*ParamToggle("Z-order", "On top|Behind", 1 ) );`, { overlay: true }),
  f('volume-single', 'Volume (Single Color)', 'Basic Chart', 'Volume histogram in one colour', R`
Plot( Volume, _DEFAULT_NAME(), ParamColor("Color", colorBlueGrey ), ParamStyle( "Style", styleHistogram | styleOwnScale | styleThick, maskHistogram   ) );`),
];

const EQUITY = [
  f('equity', 'Equity', 'Equity', 'Equity curve of the last backtest on this symbol, with a buy-and-hold line for comparison', R`
#include @LastBacktestFormula
// This comment is intentionally here. Do not edit/remove    */

MaxGraph=0;GraphXSpace=5;
GraphZOrder=1;
Plot( Equity( 0, -2 ), "Equity", -8, styleArea );

if( ParamToggle("Show Buy-and-Hold?", "No|Yes", 1 ) )
{
    /* now buy and hold simulation */
    Short=Cover=0;

    Buy=Status("firstbarintest");
    Sell=Status("lastbarintest");
    SetTradeDelays(0,0,0,0); PositionSize = -100;
    ApplyStop(0,0,0,0);
    ApplyStop(1,0,0,0);
    ApplyStop(2,0,0,0);
    Plot( Equity( 0, -2 ), "Buy&Hold", -9 );
}`, { needs: 'Run a backtest first (Tools > Analysis)' }),
  f('portfolio-equity', 'Portfolio Equity', 'Equity', 'Portfolio equity, cash, drawdown and linear regression from the last portfolio backtest (pseudo symbol ~~~EQUITY)', R`
eqname = "~~~EQUITY";
if( Name() != eqname ) SetForeign( eqname );
eq = Close;
Cash = Low;

dr = eq - Highest(eq);
bslh = HighestBars(eq);
GraphZOrder=1;
Plot(eq, "Portfolio Equity", colorLightBlue, styleArea );
if( ParamToggle("Show Cash", "No|Yes", 1 ) ) Plot(cash, "Cash", colorGreen, styleArea );
if( ParamToggle("Show Drawdown", "No|Yes", 1 ) ) Plot(dr, "Drawdown", colorDarkRed, styleArea );
if( ParamToggle("Show #bars since last high", "No|Yes", 0 ) ) Plot(bslh, "#bars since last high", colorDarkYellow, styleLine | styleOwnScale, 0, 10 * LastValue( Highest( bslh ) ) );
islastbar = Status("lastbarintest");
isfirstbar = Status("firstbarintest");
bar = BarIndex();
firstbar = LastValue( ValueWhen( isfirstbar, bar ) );
lastbar = LastValue( ValueWhen( islastbar, bar ) );
al = LastValue( ValueWhen( islastbar, LinRegSlope( eq, Lastbar - firstbar + 1 ) ) );
bl = LastValue( ValueWhen( islastbar, LinRegIntercept( eq, Lastbar - firstbar + 1 ) ) );
Lr = al * ( BarIndex() - firstbar ) + bl;
Lr = IIf( bar >= firstbar AND bar <= lastbar , Lr, Null );
if( ParamToggle("Show lin. reg.", "No|Yes", 0 ) )Plot( Lr , "Linear Reg", colorRed, styleThick );`, { needs: 'Run a portfolio backtest first (Tools > Analysis)' }),
];

const EXPLORATION = [
  f('xy-profit', 'XY Chart - Profit vs MAE/MFE', 'Exploration', 'Exploration that draws scatter charts of final trade profit against MAE, MFE and trade length', R`
// XY chart coding example
// This formula generates 2 X-Y scatter charts that display relationship between
// final trade profit and MFE and MAE

Buy = Cross( MACD(), Signal());
Sell = Cross( Signal(), MACD() );
Short = False;
Cover = False;

Eq = Equity( 1 ); // single-security equity      this evaluates stops (if you use them) and removes extra signals

Entry = Buy OR Short;
EqAtEntry = ValueWhen( Entry, Eq );
Profit = 100 * ( Eq - EqAtEntry ) / EqAtEntry; // percent profit

// MAE and MFE below use CLOSING equity, MAE and MFE in the report use high/low price
MAE = 100 * ( LowestSince( Entry, Eq ) - EqAtEntry ) / EqAtEntry; // percent MAE
MFE = 100 * ( HighestSince( Entry, Eq ) - EqAtEntry ) / EqAtEntry; // percent MAE

bi = BarIndex();

Len = bi - ValueWhen( Entry, bi );

EntryPrice = ValueWhen( Entry, BuyPrice );
// if you prefer MAE/MFE using high/low price
// uncomment the lines below (long only Version)
MAE = 100 * ( LowestSince( Entry, Low ) - EntryPrice ) / EntryPrice ; // percent MAE using low
MFE = 100 * ( HighestSince( Entry, High ) - EntryPrice ) / EntryPrice ; // percent MAE using high

Exit = Sell OR Cover;
dt = DateTime();
Clr = ColorHSB( Status("stocknum"), 255, 255 );
for( bar = 0; bar < BarCount; bar++ )
{
     if( Exit[ bar ] )
     {
         // item text consists of two parts
         // first part (before \t) is a item name displayed immediatelly on XY chart
         // second part (after \t) is a tooltip hint text that is displayed in the tooltip
         // when you hover on given item
         // here we will only use hint text
         HintText = "\t" + Name()+"@"+ DateTimeToStr( dt[ bar ] );

         XYChartAddPoint( "Profit vs MAE", HintText, MAE[ bar ], Profit[ bar ],Clr );
         XYChartAddPoint( "Profit vs MFE", HintText, MFE[ bar ], Profit[ bar ], Clr );
         XYChartAddPoint( "Profit vs trade length", HintText, Len[ bar ], Profit[ bar ], Clr );
     }
}

XYChartSetAxis( "Profit vs MAE", "[MAE]", "[Profit]" );
XYChartSetAxis( "Profit vs MFE", "[MFE]", "[Profit]" );
XYChartSetAxis( "Profit vs trade length", "[Length]", "[Profit]"   );

Filter = Exit;
AddColumn( Eq, "Equity" );
AddColumn( Profit, "Profit" );
AddColumn( MAE, "MAE" );
AddColumn( MFE, "MFE" );
AddColumn( Len, "trade length" );`, { kind: 'exploration' }),
  f('risk-yield', 'Risk-Yield Map', 'Exploration', 'Average gain (yield) against the standard deviation of gains (risk) for every symbol. Run it on WEEKLY data', R`
// This is AFL equivalent of Risk-Yield map
// Note that this exploration should be run on
// WEEKLY data
// it calculates average weekly gain (yield)
// and standard deviation of gains (risk)

Filter=Status("lastbarinrange");
Length = SelectedValue( BarIndex() );
Chg = ROC( C, 1 ); //one bar yield
yield = MA( Chg, Length - 1);
risk = StDev( Chg, Length - 1);
AddColumn(yield,"yield");
AddColumn(risk,"risk");

Clr = ColorHSB( 2 * Status("stocknum") % 255, 255, 255 );



XYChartAddPoint( "Risk/Yield", Name(), risk[ Length ], yield[ Length ] , Clr );
XYChartSetAxis("Risk/Yield", "Risk[%]", "Yield[%]");`, { kind: 'exploration' }),
  f('exploration-basic', 'Basic Exploration (template)', 'Exploration', 'Starter exploration: lists every symbol with close, change %, volume and RSI. Edit the Filter to scan', R`
// Exploration template. Filter decides which symbols/bars appear; AddColumn adds a column.
minVol = Param("Minimum volume", 0, 0, 100000000, 1000);
rsiPeriod = Param("RSI period", 14, 2, 100, 1);
Filter = Status("lastbarinrange") AND Volume > minVol;
AddColumn(Close, "Close", 1.2);
AddColumn(ROC(Close, 1), "Chg %", 1.2);
AddColumn(Volume, "Volume", 1.0);
AddColumn(RSI(rsiPeriod), "RSI", 1.1);`, { kind: 'exploration' }),
  f('scan-52w-high', 'Scan: Closing at 52-week High (template)', 'Exploration', 'Scan for symbols whose last bar closes at a new 250-bar high', R`
days   = Param("Days (250 = 1 year)", 250, 20, 1000, 10);
minVol = Param("Minimum volume", 0, 0, 100000000, 1000);
Filter = Status("lastbarinrange") AND Close >= HHV(High, days) AND Volume > minVol;
AddColumn(Close, "Close", 1.2);
AddColumn(ROC(Close, 1), "Chg %", 1.2);
AddColumn(Volume, "Volume", 1.0);`, { kind: 'exploration' }),
];

import { INDICATORS } from './builtin-indicators.js';
import { REPORTS_SYSTEMS } from './builtin-systems.js';

export const BUILTIN_FORMULAS = [
  ...AVERAGES, ...BANDS, ...BASIC, ...EQUITY, ...EXPLORATION, ...INDICATORS(f, R), ...REPORTS_SYSTEMS(f, R),
];

// Old formula ids (saved in earlier layouts) mapped to their AmiBroker replacement, so saved sheets keep working.
export const ALIASES = {
  'price-candle': 'price', 'price-bar': 'price', 'price-line': 'price', 'price-area': 'price', 'price-heikin': 'price',
  'price-volume': 'price', 'price-ma': 'ma', 'price-ema-cross': 'ma', 'price-supertrend': 'ma', 'price-sar': 'sar', 'adx': 'adx',
  'aroon': 'adx', 'macd': 'macd', 'stoch': 'stochk', 'cci': 'cci', 'willr': 'percent-r', 'roc': 'roc', 'price-bbands': 'bbands',
  'price-keltner': 'keltner', 'price-donchian': 'bbands', 'atr': 'atr', 'bb-pctb': 'bbands', 'bb-width': 'bbands', 'obv': 'obv', 'mfi': 'mfi',
  'rel-volume': 'volume', 'hi-lo-52w': 'price', 'sys-ema-cross': 'sys-macd', 'sys-rsi': 'sys-macd', 'sys-breakout': 'sys-macd',
  'sys-macd': 'sys-macd', 'exp-summary': 'exploration-basic', 'exp-52w-high': 'scan-52w-high', 'exp-volume-breakout': 'scan-52w-high',
  'exp-delivery-spike': 'nse-delivery-spike', 'delivery-pct': 'nse-delivery-pct', 'delivery-qty': 'nse-delivery-qty',
};
