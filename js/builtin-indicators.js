// AmiBroker "Indicators" group (Formula.pdf). Each formula is plain AFL.
export function INDICATORS(f, R) {
  const I = 'Indicators';
  return [
    f('adline', 'ADLine', I, 'Advance/Decline line (cumulative advancing minus declining issues)', R`
Plot( ADLine(), _DEFAULT_NAME(), ParamColor("Color",    colorCycle ), ParamStyle("Style") );`, { needs: 'Market breadth (Tools > Analysis > Build market breadth)' }),
    f('adx', 'ADX / Directional Movement Index', I, 'Trend strength (ADX) with +DI and -DI', R`
range = Param("Periods", 14, 2, 200, 1 );
Plot( ADX(range), _DEFAULT_NAME(), ParamColor( "ADX color", colorBlue ), ParamStyle("ADX style", styleThick ) );
Plot( PDI(range), "+DI", ParamColor( "+DI color", colorGreen ), ParamStyle("+DI style") );
Plot( MDI(range), "-DI", ParamColor( "-DI color", colorRed ), ParamStyle("-DI style") );`),
    f('asi', 'Accumulation Swing Index', I, 'Welles Wilder\'s swing index, accumulated', R`
function SwingIndex( Limit ){
 Hy = Ref( H, -1 );
    Cy = Ref( C, -1 );
    Ly = Ref( L, -1 );
    Oy = Ref( O, -1 );

    r1 = abs( H - Cy );
    r2 = abs( L - Cy );
    r3 = abs( H - L );
    r4 = abs( Cy - Oy );

    k = Max( r1, r2 );

    r = IIf( r1 >= Max( r2, r3 ), r1 - r2/2 + r4/4,
        IIf( r2 >= Max( r1, r3 ), r2 - r1/2 + r4/4,
             r3 + r4/4 ) );

    return IIf( r == 0, 0, 50 * ( ( C - Cy + 0.5 * ( C - O ) + 0.25 * ( Cy - Oy ) ) / r ) * k/Limit );
}

function AccumulationSwingIndex( Limit ){
     return Cum( SwingIndex( Limit ) );
}

Plot( AccumulationSwingIndex( Param("Limit", 100, 1, 1000 ) ),
           _DEFAULT_NAME(), ParamColor( "Color", colorRed ) );`),
    f('atr', 'ATR (Average True Range)', I, 'Average true range', R`
periods = Param( "Periods", 15, 1, 200, 1 );
Plot( ATR(periods), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('beta', 'Beta', I, 'Sensitivity of this symbol to a base index over N bars', R`
function Beta( BaseSymbol, N ){
 Chg = ROC( C, 1 );
    ChgBase = ROC( Foreign( BaseSymbol, "C" ), 1 );

    return ( N * Sum( Chg * ChgBase , N ) - Sum( Chg, N) * Sum( ChgBase, N ) ) /
           ( N * Sum( ChgBase ^ 2 , N ) - Sum( ChgBase, N ) ^ 2 );
}

symbol = ParamStr( "Symbol", "NIFTY" );

Plot( Beta( symbol, Param("Periods", 21, 2, 100 ) ), _DEFAULT_NAME(), ParamColor( "Color", ColorCycle ) );`, { needs: 'The base index symbol (default NIFTY)' }),
    f('breadth-thrust', 'Breadth Thrust', I, 'Smoothed advancing / (advancing + declining) issues', R`
function BreadthThrust( Periods ){
 return EMA( AdvIssues()/( AdvIssues()+DecIssues() ), Periods );
}

Plot( BreadthThrust( Param("Periods", 10, 2, 100 ) ), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ) );`, { needs: 'Market breadth' }),
    f('abi', 'Absolute Breadth Index', I, 'Advancing minus declining issues', R`
function AbsoluteBreadthIndex(){
     return AdvIssues() - DecIssues();
}

Plot( AbsoluteBreadthIndex(), _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`, { needs: 'Market breadth' }),
    f('accdist', 'Accumulation Distribution (AccDist)', I, 'Accumulation / distribution line', R`
Plot( AccDist(), _DEFAULT_NAME(), ParamColor("Color", colorCycle ), ParamStyle("Style") );`),
    f('adv-dec-williams', 'Advance/Decline (Williams)', I, 'Larry Williams\' accumulation/distribution of price', R`
function AdvDecWilliams(){
    C1 = Ref( C, -1 );
    trhi = IIf( C1 > High, C1, High );
    trlo = IIf( C1 < Low, C1, Low );

    return Cum( IIf( C > C1, Close - trlo, Close - trhi ) );
}


Plot( AdvDecWilliams(), _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`),
    f('adv-dec-ratio', 'Advance/Decline Ratio', I, 'Advancing issues divided by declining issues', R`
Plot( AdvIssues()/DecIssues(), _DEFAULT_NAME(), ParamColor( "Color", ColorCycle ) );`, { needs: 'Market breadth' }),
    f('cci', 'CCI - Commodity Channel Index', I, 'Commodity Channel Index', R`
periods = Param( "Periods", 14, 2, 200, 1 );
Plot( CCI( periods ), _DEFAULT_NAME(), ParamColor( "Color",   colorCycle ), ParamStyle("Style")    );`),
    f('chaikin-osc', 'Chaikin Oscillator', I, 'Difference of two averages of the accumulation/distribution line', R`
r1 = Param( "Fast avg", 9, 2, 200, 1 );
r2 = Param( "Slow avg", 14, 2, 200, 1 );
Plot( Chaikin(r1,r2), _DEFAULT_NAME(), ParamColor( "Color",   colorCycle ), ParamStyle("Style") );`),
    f('dpo', 'Detrended Price Oscillator', I, 'Price minus a displaced moving average', R`
function DetrendedPriceOsc( Periods ){
    return C - Ref( MA( C, Periods ), -( 1 + Periods/2 ) );
}

Plot( DetrendedPriceOsc( Param("Periods", 20, 1, 100 ) ),
       _DEFAULT_NAME(),
       ParamColor("Color", ColorCycle ) );`),
    f('dvi', 'Daily Volume Indicator', I, 'Cumulative volume weighted by where the close sits against the mid-point', R`
function DailyVolumeIndicator(){
     midpoint = ( High + Low ) / 2;

     dv = Volume * (( Close - midpoint ) / midpoint);

     return Cum( dv );
}

Plot( DailyVolumeIndicator(), _DEFAULT_NAME(), ParamColor( "Color", ColorCycle ) );`),
    f('eom', 'Ease of Movement', I, 'How easily price moves relative to volume', R`
function EaseOfMovement(Period){
  MidPointMove = ( H + L ) / 2 -       Ref( ( H + L ) / 2, -1 );
     Vadj = Volume / 10000;
     BoxRatio = VAdj / ( 8 * ( H - L ) );
     return EMA( MidPointMove / BoxRatio, Period );
}

Plot( EaseOfMovement( Param("Period", 14, 2, 100 ) ), _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`),
    f('hpi', 'Herrick Payoff Index', I, 'Money flow indicator for futures (uses open interest)', R`
function HPI( MultFactor, PercentMove ){
    M = ( H + L ) /2;
    My = Ref( M, -1 );

    I = abs( OpenInt - Ref( OpenInt, -1 ) );
    G = Max( OpenInt, Ref( OpenInt, -1 ) );

    K = PercentMove * Volume * ( M - My ) * ( 1   + sign( M - My ) * 2 * I / G );

    //return AMA2( K, MultFactor / 100000, ( 1 - MultFactor ) / 100000 );

    return AMA( K, 1/MultFactor )/100000;



}

OI = C;

Plot( HPI( 20, 100 ), _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`),
    f('macd', 'MACD - Moving Average Convergence Divergence', I, 'MACD line, signal line and histogram', R`
r1 = Param( "Fast avg", 12, 2, 200, 1 );
r2 = Param( "Slow avg", 26, 2, 200, 1 );
r3 = Param( "Signal avg", 9, 2, 200, 1 );
Plot( ml = MACD(r1, r2), StrFormat(_SECTION_NAME()+"(%g,%g)", r1, r2), ParamColor("MACD color", colorRed ), ParamStyle("MACD style") );
Plot( sl = Signal(r1,r2,r3), "Signal" + _PARAM_VALUES(), ParamColor("Signal color", colorBlue ), ParamStyle("Signal style") );
Plot( ml-sl, "MACD Histogram", ParamColor("Histogram color", colorDefault ), styleNoTitle | ParamStyle("Histogram style", styleHistogram | styleNoLabel, maskHistogram ) );`),
    f('mfac', 'Market Facilitation Index', I, 'Price range per unit of volume, coloured by the change of both', R`
function MarketFacilitationIndex(){
  return ( High - Low )/Volume;
}

mfac = MarketFacilitationIndex();
rm = ROC( mfac, 1 );
rv = ROC( Volume, 1 );

Color = IIf( rm > 0 AND rv > 0, colorGreen,
        IIf( rm < 0 AND rv < 0, colorBlue,
        IIf( rm > 0 AND rv < 0, colorGrey40,
        IIf( rm < 0 AND rv > 0, colorRed, colorLightGrey ) ) ) );

Plot( mfac, _DEFAULT_NAME(), Color, ParamStyle("Style", styleHistogram | styleThick, maskHistogram ) );`),
    f('mass-index', 'Mass Index', I, 'Detects range expansion that precedes reversals', R`
function MassIndex( period1, period2 ){
 diff = H - L;
    ediff = EMA( diff, period1 );
    eediff = EMA( ediff, period1 );
    return Sum( ediff/eediff, period2 );
}

Plot( MassIndex( Param("Period 1", 9, 2, 100 ), Param("Period 2", 25, 2, 100 ) ),
      _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`),
    f('mfi', 'MFI - Money Flow Index', I, 'Volume-weighted RSI', R`
periods = Param( "Periods", 14, 2, 200, 1 );
Plot( MFI(periods), _DEFAULT_NAME(), ParamColor("Color", colorCycle ), ParamStyle("Style") );`),
    f('momentum', 'Momentum', I, 'Price now minus price N bars ago', R`
function Momentum( array, period ){
    return array - Ref( array, -period );
}

Plot( Momentum( ParamField( "Field" ), Param("Period", 10, 1, 100 ) ),
     _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`),
    f('nvi', 'NVI - Negative Volume Index', I, 'Negative volume index', R`
Plot( NVI(), _DEFAULT_NAME(), ParamColor("Color", colorCycle ), ParamStyle("Style")   );`),
    f('obv', 'OBV - On Balance Volume', I, 'Running total of volume on up days minus down days', R`
Plot( OBV(), _DEFAULT_NAME(), ParamColor("Color", colorCycle ), ParamStyle("Style")   );`),
    f('oscp', 'OSCP - Price Oscillator', I, 'Percentage difference of two price averages', R`
r1 = Param( "Fast avg", 9, 2, 200, 1 );
r2 = Param( "Slow avg", 18, 2, 200, 1 );
Plot( OSCP( r1,r2), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('oscv', 'OSCV - Volume Oscillator', I, 'Percentage difference of two volume averages', R`
r1 = Param( "Fast avg", 9, 2, 200, 1 );
r2 = Param( "Slow avg", 18, 2, 200, 1 );
Plot( OSCV( r1,r2), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('pvi', 'PVI - Positive Volume Index', I, 'Positive volume index', R`
Plot( PVI(), _DEFAULT_NAME(), ParamColor("Color", colorCycle ), ParamStyle("Style")   );`),
    f('pvt', 'PVT - Price Volume Trend', I, 'Volume accumulated in proportion to the price change', R`
function PVT(){
  return Cum( Volume * ROC( C, 1 ) * 0.01 );
}

Plot( PVT(), _DEFAULT_NAME(), ParamColor( "Color", ColorCycle ) );`),
    f('rmi', 'RMI - Relative Momentum Index', I, 'RSI that measures momentum over several bars', R`
periods = Param( "Periods", 20, 1, 200, 1 );
momentum = Param( "Momentum", 5, 1, 200, 1 );
Plot( RMI(periods, momentum)   , _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('roc', 'ROC - Rate Of Change', I, 'Percent change over N bars', R`
P = ParamField( "Price field" );
periods = Param("Periods", 15, 1, 200, 1 );
Plot( ROC( P, periods), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style")   );`),
    f('relstrength', 'Relative Strength', I, 'Price relative to a base index (normalised to 100 at the start)', R`
base = ParamStr("RS base ticker", GetBaseIndex() );
Plot( RelStrength(base), _SECTION_NAME() + "(" + base + ")", ParamColor( "color", colorCycle ), ParamStyle("Style")   );`, { needs: 'The base index symbol (default NIFTY)' }),
    f('rwi-high', 'RWI High - Random Walk Index High', I, 'Random walk index, highs', R`
minperiods = Param( "Min Periods", 9, 1, 200, 1 );
maxperiods = Param( "Max Periods", 40, 1, 200, 1 );
Plot( RwIHI( minperiods, maxperiods)   , _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('rwi-low', 'RWI Low - Random Walk Index Low', I, 'Random walk index, lows', R`
minperiods = Param( "Min Periods", 9, 1, 200, 1 );
maxperiods = Param( "Max Periods", 40, 1, 200, 1 );
Plot( RwILO( minperiods, maxperiods)   , _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('sar', 'SAR - Parabolic SAR', I, 'Parabolic stop and reverse dots', R`
acc = Param("Acceleration", 0.02, 0, 1, 0.001 );
accm = Param("Max. acceleration", 0.2, 0, 1, 0.001 );
Plot( SAR( acc, accm ), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style", styleDots | styleNoLine, maskDefault | styleDots | styleNoLine ) );`, { overlay: true }),
    f('stix', 'STIX', I, 'Short-term trading index: smoothed advancing share of issues', R`
function STIX(){
    ADRatio = 100 * AdvIssues()/( AdvIssues() + DecIssues() );

    return EMA( ADRatio, 21 );
}


Plot( STIX(), _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`, { needs: 'Market breadth' }),
    f('stochd', 'StochD - Stochastic %D', I, 'Slow stochastic %D', R`
periods = Param( "Periods", 15, 1, 200, 1 );
Ksmooth = Param( "%K avg", 3, 1, 200, 1 );
Dsmooth = Param( "%D avg", 3, 1, 200, 1 );
Plot( StochD( periods , Ksmooth, DSmooth ), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('stochk', 'StochK - Stochastic %K', I, 'Stochastic %K', R`
periods = Param( "Periods", 15, 1, 200, 1 );
Ksmooth = Param( "%K avg", 3, 1, 200, 1 );
Plot( StochK( periods , Ksmooth), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('stoch-momentum', 'Stochastic Momentum', I, 'Stochastic momentum index', R`
LookBack = Param("Lookback", 13, 2, 100 );
Smooth1 = Param("Smooth 1", 25, 1, 100 );
Smooth2 = Param("Smooth 2", 2, 1, 100 );

HH = HHV( H, LookBack );
LL = LLV( L, LookBack );

StoMom = 100 * EMA( EMA( C - 0.5 * ( HH + LL ), Smooth1 ), Smooth2 ) /
( 0.5 * EMA( EMA( HH - LL, Smooth1 ), Smooth2 ) );

Plot(StoMom, _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`),
    f('rsi', 'RSI - Relative Strength Index', I, 'Relative Strength Index with 30 / 70 grid lines', R`
SetChartOptions(0,0,chartGrid30|chartGrid70);
periods = Param( "Periods", 15, 1, 200, 1 );
Plot( RSI( periods), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('rsia', 'RSIa (Price Field)', I, 'RSI of any price field', R`
P = ParamField( "Price field" );
periods = Param("Periods", 15, 1, 200, 1 );
Plot( RSIa( P, periods), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style")   );`),
    f('rwi', 'RWI - Random Walk Index', I, 'Random walk index', R`
minperiods = Param( "Min Periods", 9, 1, 200, 1 );
maxperiods = Param( "Max Periods", 40, 1, 200, 1 );
Plot( RwI( minperiods, maxperiods)      , _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`),
    f('trin', 'TRIN (Arms Index)', I, 'Arms index: advance/decline ratio divided by up/down volume ratio', R`
Plot( Trin(), _DEFAULT_NAME(), ParamColor("color", colorCycle ), ParamStyle("Style") );`, { needs: 'Market breadth' }),
    f('trix', 'TRIX', I, 'Rate of change of a triple smoothed average', R`
periods = Param("Periods", 9, 2, 200, 1 );
Plot( Trix( periods ), _DEFAULT_NAME(), ParamColor("color", colorCycle ), ParamStyle("Style") );`),
    f('tvi', 'Trade Volume Index (TVI)', I, 'Accumulates volume by the direction of the last significant price move', R`
function TradeVolumeIndex( MinTickVal ){
    Change = C - Ref( C, -1 );

    Direction = IIf( Change > MinTickVal, 1,
          IIf( Change < -MinTickVal, -1, 0 ) );

    Direction = ValueWhen( Direction != 0, Direction );


    return Cum( Direction * Volume );
}

Plot( TradeVolumeIndex( Param("Min Tick Value", 0.1, 0, 10, 0.01 ) ),
     _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`),
    f('ultimate', 'Ultimate Oscillator', I, 'Larry Williams\' ultimate oscillator', R`
r1 = Param("Fast avg", 7, 2, 200, 1 );
r2 = Param("Med avg", 14, 2, 200, 1 );
r3 = Param("Slow avg", 28, 2, 200, 1 );
Plot( Ultimate( r1, r2, r3 ), _DEFAULT_NAME(), ParamColor("Color", colorCycle ), ParamStyle("Style"));`),
    f('chaikin-vol', 'Chaikin Volatility', I, 'Rate of change of the smoothed high-low range', R`
function ChaikinVolatility( periods ){
 return ROC( EMA( High - Low, periods ), periods );
}

Plot( ChaikinVolatility( Param("Periods", 10, 2, 100 ) ),
     _DEFAULT_NAME(), ParamColor( "Color", ColorCycle ) );`),
    f('atr-simple', 'ATR (Average True Range) - simple', I, 'Average true range, plain colour', R`
Plot( ATR( Param("Periods", 14, 1, 100 ) ), _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`),
    f('oscv-simple', 'Volume Oscillator (OscV)', I, 'Volume oscillator with 12 / 26 defaults', R`
Plot( OscV( Param("Periods (fast)", 12, 1, 100 ),
          Param("Periods (slow)", 26, 1, 100 ) ),
      _DEFAULT_NAME(), ParamColor("Color", ColorCycle ) );`),
    f('percent-r', 'Williams %R (PercentR)', I, 'Williams %R, 0 to -100', R`
function PercentR( periods ){
    return -100 * ( HHV( H, periods ) - C )/( HHV( H, periods ) - LLV( L, periods ) );
}

Plot( PercentR( Param("Periods", 14, 2, 100 ) ),
       _DEFAULT_NAME(),
       ParamColor("Color", ColorCycle ) );`),
    f('zig', 'ZigZag (Zig)', I, 'ZigZag: straight lines between swings of at least N percent (the last leg can repaint)', R`
P = ParamField( "Price field" );
change = Param("% change",5,0.1,25,0.1);
Plot( Zig(P, change), _DEFAULT_NAME(), ParamColor( "Color", colorCycle ), ParamStyle("Style") );`, { overlay: true }),
  ];
}
