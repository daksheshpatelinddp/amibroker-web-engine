// AmiBroker "Report Charts" and "Systems" groups (Formula.pdf), plus GUI tutorial and NSE delivery formulas.
export function REPORTS_SYSTEMS(f, R) {
  return [
    // ------------------------------------------------------------------ Report Charts
    f('report-portfolio-equity', 'Portfolio Equity (report chart)', 'Report Charts', 'Gradient chart of portfolio equity. Use it on the ~~~EQUITY symbol after a portfolio backtest', R`
Title = "Portfolio Equity = " + C;

SetGradientFill( colorLightOrange, colorPaleGreen    );
Plot( C, "Portfolio Equity", ColorBlend( colorPaleGreen, colorBlack ), styleGradient | styleLine, Null, Null, 0, -1 );

//SetChartOptions(3, chartShowDates );`, { needs: 'Symbol ~~~EQUITY (created by a portfolio backtest)' }),
    f('report-underwater', 'Underwater Equity', 'Report Charts', 'Drawdown of the portfolio equity in percent. Use it on the ~~~EQUITY symbol after a portfolio backtest', R`
// Underwater Equity chart
// (C)2009 AmiBroker.com
// Should be used only on ~~~EQUITY or ~~~OSEQUITY symbol



EQ = C;
MaxEQ = Highest( EQ );
DD = 100 * ( Eq - MaxEQ ) / MaxEq;
MaxDD = Lowest( DD );

Title = StrFormat("Drawdown = %.2g%%, Max. drawdown %.2g%%", DD, LastValue( MaxDD ) );

SetGradientFill( GetChartBkColor(), colorBlue, 0 );

Plot( DD, "Drawdown ", colorBlue, styleGradient | styleLine );

Plot( MaxDD, "Max DD", colorRed, styleNoLabel );


SetChartOptions( 2, 0, chartGridPercent );

if( Name() != "~~~EQUITY" AND Name() != "~~~OSEQUITY" ) Title = "Warning: wrong ticker! This chart should be used on ~~~EQUITY or ~~~OSEQUITY only";`, { needs: 'Symbol ~~~EQUITY (created by a portfolio backtest)' }),
    f('report-profit-table', 'Profit Table HTML', 'Report Charts', 'Monthly and yearly profit table of the portfolio equity (text output; use the pane menu "Text output")', R`
EnableTextOutput( 3 ); // enable HTML output into report (Version 5.84 or higher!)

eq = C;

yr = Year();
mo = Month();

YearChange = yr != Ref( yr, 1 );
MonChange = mo != Ref( mo, 1 );

FirstYr = 0;
LastYr = 0;

startbar = 0;

////////////////////////////
// SKIP non-trading bars
////////////////////////////

for ( i = 0; i < BarCount; i++ )
{
    if ( eq[ i ] )
    {
        startbar = i;
        break;
    }
}

////////////////////////////
// collect yearly / monthly changes in equity
// into dynamic variables
////////////////////////////

LastYrValue = eq[ startbar    ];
LastMoValue = eq[ startbar ];
MaxYrProfit = MinYrProfit = 0;
MaxMoProfit = MinMoProfit = 0;

for ( i = startbar + 1; i < BarCount; i++ )
{
    if ( YearChange[ i ] || i == BarCount - 1 )
    {
        Chg = 100 * ( -1 + eq[ i ] / LastYrValue );
        VarSet( "ChgYear" + yr[ i ], Chg );

        MaxYrProfit = Max( MaxYrProfit, Chg );
        MinYrProfit = Min( MinYrProfit, Chg );

        if ( FirstYr == 0 )
            FirstYr = yr[ i ];

        LastYr = yr[ i ];

        LastYrValue = eq[ i ];
    }

    if ( MonChange [ i ] || i == BarCount - 1 )
    {
        mon = mo[ i ];

        Chg = 100 * ( -1 + eq[ i ] / LastMoValue );

        VarSet( "ChgMon" + yr[ i ] + "_" + mon, Chg );
        VarSet( "SumChgMon" + mon, Chg + Nz( VarGet( "SumChgMon" + mon ) ) );
        VarSet( "SumMon" + mon, 1 + Nz( VarGet( "SumMon" + mon ) ) );


        MaxMoProfit = Max( MaxMoProfit, Chg );
        MinMoProfit = Min( MinMoProfit, Chg );



        LastMoValue = eq[ i ];
    }
}

MonthNames = "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec";



function GenProfitTableHTML( ){
    printf( "<table border='1' bordercolor='#000000' cellspacing='0' cellpadding='3'style='border-collapse:collapse;'>\n" );

    printf( "<tr bgcolor='#eeffee' >\n" );

    Header = "Year," + MonthNames + ",Yr%%";

    for ( Col = 0; ( Colname = StrExtract( Header, Col ) ) != ""; Col++ )
    {
        printf( "<td><b>" + Colname + "</b></td>" );
    }

    printf( "</tr>\n" );

    for ( y = FirstYr; y <= LastYr; y++ )
    {
        //Color = ColorRGB( IIf( row == 0 || col == 0 || col == 13, 220, 255 ), 255, IIf( row % 2, 255, 220 ) );

        // new row
        if ( y % 2 )
            printf( "<tr bgcolor='#ffffff'>\n<td bgcolor='#eeffff'>" );
        else
            printf( "<tr bgcolor='#ffffee'>\n<td bgcolor='#eeffee'>" );


        printf( "<b>%g</b></td>", y );

        for ( m = 1; m <= 12; m++ )
        {
            Chg = VarGet( "ChgMon" + y + "_" + m );

            if ( NOT IsNull( Chg ) )
            {
                   if ( Chg >= 0 )
                          printf( "<td nowrap>%.1f%%</td>", Chg );
                   else
                          printf( "<td nowrap><font color='880000'>%.1f%%</font></td>", Chg );
            }
            else
                   printf( "<td>N/A</td>" );
        }

        if ( y % 2 )
            printf( "<td nowrap bgcolor='#eeffff'>" );
        else
            printf( "<td nowrap bgcolor='#eeffee'>" );

        x = VarGet( "ChgYear" + y );

        if ( x >= 0 )
            printf( "<b>%.1f%%</b></td>", x );
        else
            printf( "<font color='880000'><b>%.1f%%</b></font></td>", x );

        printf( "</tr>\n" ); // end row
    }



    printf( "<tr bgcolor='#eeffee' >\n" ); // new row

    printf( "<td><b>Avg</b></td>" );

    for ( m = 1; m <= 12; m++ )
    {
        x = Nz( VarGet( "SumChgMon" + m ) / VarGet( "SumMon" + m ) );

        if ( x >= 0 )
            printf( "<td nowrap><b>%.1f%%</b></td>", x );
        else
            printf( "<td nowrap><font color='880000'><b>%.1f%%</b></font></td>", x );
    }

    printf( "<td>&nbsp;</td>" );

    printf( "</tr></table>\n" );

}

///////////////////////////
// This function checks if currently selected symbol
// is portfolio equity
//////////////////////////
function CheckSymbol(){
    if ( Name() != "~~~EQUITY" AND Name() != "~~~OSEQUITY" )
    {
        printf( "For accurate results switch to ~~~EQUITY symbol<br>" );
    }
}

CheckSymbol();

////////////////////////////
// Main program
////////////////////////////
GenProfitTableHTML();`, { text: true, needs: 'Symbol ~~~EQUITY (created by a portfolio backtest)' }),

    // ------------------------------------------------------------------ Systems
    f('sys-macd', 'MACD System', 'Systems', 'Buy when MACD crosses above its signal line, sell when it crosses below; trades next-bar open, 25% of equity per trade', R`
Buy = Cross( MACD(), Signal() );
Sell = Cross( Signal(), MACD() );

// trade on next bar open
SetTradeDelays( 1, 1, 1, 1 );
BuyPrice = SellPrice = Open;

// trade size: 25% of current portfolio equity
SetPositionSize( 25, spsPercentOfEquity );`, { kind: 'system' }),
    f('sys-rotational', 'Rotational Trading System', 'Systems', 'Contrarian rotation: holds the 4 symbols with the worst 252-bar rate of change (portfolio backtest over many symbols)', R`
// Simple example of rotational trading system
// This is contrarian strategy -
// it buys 4 "worst" stocks - the ones that suffered the most in last year
// (4 stocks having worst 252-bar rate-of-change)
//
// 4 positions
MaxPositions = 4;
SetOption("MaxOpenPositions", MaxPositions   );
SetOption("WorstRankHeld", MaxPositions + 2 );
SetPositionSize( 100 / MaxPositions, spsPercentOfEquity );

// trade on next day open
SetTradeDelays( 1, 1, 1, 1 );
BuyPrice = Open;


SetBacktestMode( backtestRotational );

// offsetting by large positive number
// makes sure that our score is always positive and we don't enter short trades
PositionScore = 10000 - ROC( C, 252 );`, { kind: 'system' }),
    f('sys-optimize-ma', 'Moving Average Crossover (Optimize template)', 'Systems', 'Shows Optimize(): the Optimization tab tries every fast/slow combination and ranks them. Also has stops and a long/short switch', R`
// Optimize( "name", default, min, max, step ) turns a number into something the optimizer can vary.
// In a normal run it simply returns the default (or the value you set in Parameters).
fast = Optimize( "Fast MA", 10, 5, 30, 5 );
slow = Optimize( "Slow MA", 50, 30, 100, 10 );

Buy  = Cross( MA( C, fast ), MA( C, slow ) );
Sell = Cross( MA( C, slow ), MA( C, fast ) );
Short = Cover = 0;

SetTradeDelays( 1, 1, 1, 1 );
BuyPrice = SellPrice = Open;
SetPositionSize( 20, spsPercentOfEquity );
SetOption( "MaxOpenPositions", 5 );
SetOption( "InitialEquity", 1000000 );
SetOption( "CommissionMode", 1 );      // 1 = percent of trade value
SetOption( "CommissionAmount", 0.1 );

// optional protective stops: ApplyStop( type, mode, amount, exitAtStop )
ApplyStop( stopTypeLoss, stopModePercent, 8, 1 );        // 8% stop loss
ApplyStop( stopTypeTrailing, stopModePercent, 15, 1 );   // 15% trailing stop

Plot( C, "Price", colorDefault, styleCandle );
Plot( MA( C, fast ), "Fast", colorOrange );
Plot( MA( C, slow ), "Slow", colorSkyblue );
PlotShapes( Buy * shapeUpArrow, colorBrightGreen, 0, Low );
PlotShapes( Sell * shapeDownArrow, colorRed, 0, High );`, { kind: 'system', weight: 3 }),
    f('sys-scan-buy', 'Scan: Today\'s Buy signals (template)', 'Systems', 'A system used as a scan: lists every symbol where the Buy rule is true on the last bar', R`
Buy  = Cross( MA( C, 10 ), MA( C, 50 ) );
Sell = Cross( MA( C, 50 ), MA( C, 10 ) );
Filter = Status("lastbarinrange") AND Buy;
AddColumn( Close, "Close", 1.2 );
AddColumn( MA( C, 10 ), "MA10", 1.2 );
AddColumn( MA( C, 50 ), "MA50", 1.2 );`, { kind: 'exploration' }),

    f('scan-watchlist', 'Scan: Only symbols in a watchlist / favorites (template)', 'Systems', 'Shows how a formula can look at categories: InWatchListName, InFavorites, InSector, InGroup. Change the watchlist name in the Param', R`
// Only symbols that are in the watchlist you name (make lists in Tools > Symbols, Categories, Watchlists)
list = ParamStr( "Watchlist name", "Swing" );
useFav = ParamToggle( "Or use Favorites", "No|Yes", 0 );
member = IIf( useFav, InFavorites(), InWatchListName( list ) );
Buy  = Cross( C, MA( C, 20 ) );
Sell = Cross( MA( C, 20 ), C );
Filter = member AND Status("lastbarinrange") AND C > MA( C, 50 );
AddColumn( Close, "Close", 1.2 );
AddColumn( ROC( C, 20 ), "ROC 20", 1.2 );
AddTextColumn( list, "Watchlist" );`, { kind: 'exploration' }),

    // ------------------------------------------------------------------ GUI tutorial (kept from the previous version)
    f('gui-demo', 'GUI Controls Demo - buttons, check boxes, slider on the chart', 'GUI (on-chart controls)', 'Learn the Gui* functions: a check box, slider and button drawn on the chart that change what is plotted. Read the comments in the formula', R`
// ======================================================================
//  ON-CHART CONTROLS (Gui functions) - a tutorial formula
//  Gui controls are small buttons / check boxes / sliders drawn ON the chart.
//  They are different from Parameters (Param...), which live in a dialog.
//
//  1) Every control has a number ID (1, 2, 3 ...). Each ID must be unique.
//  2) GuiCheckBox("text", id, x, y, width, height, notifyClicked) draws the control at
//     pixel position x,y inside the pane. notifyClicked means "tell me when it is clicked".
//  3) The first time a control is created the function returns guiNew,
//     afterwards guiExisting - so you can set defaults only once.
//  4) GuiGetCheck(id) / GuiGetValue(id) read the current state, GuiSetCheck / GuiSetValue change it.
//  5) GuiGetEvent(n, 0) lists what the user just did (which button was pressed).
// ======================================================================
_SECTION_BEGIN("On-chart controls");
idShow = 1; idLen = 2; idReset = 3; idBand = 4;
GuiCheckBox("EMA", idShow, 8, 8, 56, 22, notifyClicked);
GuiCheckBox("Band", idBand, 66, 8, 62, 22, notifyClicked);
if (GuiSlider(idLen, 132, 8, 150, 22, notifyEditChange) == guiNew) {
  GuiSetRange(idLen, 2, 200, 1, 10);   // min 2, max 200, step 1
  GuiSetValue(idLen, 20);              // start at 20
  GuiSetCheck(idShow, 1);              // EMA box starts ticked
}
GuiButton("Reset", idReset, 288, 8, 56, 22, notifyClicked);
for (n = 0; id = GuiGetEvent(n, 0); n++) {
  if (id == idReset) { GuiSetValue(idLen, 20); GuiSetCheck(idShow, 1); GuiSetCheck(idBand, 0); }
}
len = GuiGetValue(idLen);
Plot(Close, "Price", colorDefault, styleCandle);
if (GuiGetCheck(idShow)) Plot(EMA(Close, len), "EMA " + NumToStr(len, 1.0), colorOrange, styleThick);
if (GuiGetCheck(idBand)) {
  Plot(EMA(High, len), "High EMA", colorGrey50, styleDashed);
  Plot(EMA(Low, len), "Low EMA", colorGrey50, styleDashed);
}
_SECTION_END();`, { weight: 3 }),

    // ------------------------------------------------------------------ NSE delivery data (specific to this app's database)
    f('nse-delivery-pct', 'Delivery %', 'NSE Data', 'NSE delivery percentage with its moving average (needs the delivery column in the data)', R`
p = Param("Average period", 20, 2, 200, 1);
Plot(DelPct, "Delivery %", colorViolet, styleHistogram | styleThick);
Plot(MA(DelPct, p), "Average", colorOrange, styleLine);`),
    f('nse-delivery-qty', 'Delivery Quantity', 'NSE Data', 'NSE delivered quantity with moving average', R`
p = Param("Average period", 20, 2, 200, 1);
Plot(Delivery, "Delivery", colorTeal, styleHistogram | styleThick);
Plot(MA(Delivery, p), "Average", colorOrange, styleLine);`),
    f('nse-delivery-spike', 'Scan: Delivery % Spike', 'NSE Data', 'Delivery % is 1.5x its 20-day average on above-average volume', R`
p    = Param("Average period", 20, 2, 200, 1);
mult = Param("Delivery % multiple", 1.5, 1, 10, 0.1);
Filter = Status("lastbarinrange") AND DelPct > mult * MA(DelPct, p) AND Volume > MA(Volume, p);
AddColumn(Close, "Close", 1.2);
AddColumn(DelPct, "Delivery %", 1.1);
AddColumn(MA(DelPct, p), "Avg Del %", 1.1);
AddColumn(Volume / MA(Volume, p), "Rel Vol", 1.2);`, { kind: 'exploration' }),
  ];
}
