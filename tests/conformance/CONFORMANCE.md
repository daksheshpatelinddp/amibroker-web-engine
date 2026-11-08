# AmiBroker conformance

`node tests/conformance/run.mjs` runs PARITY_EXPLORATION.afl through the app on the bars AmiBroker exported and compares all 59 columns with
AmiBroker's own values (fixtures/ami_weekly.csv, ami_daily.csv; 5 NSE symbols). It fails if any column outside KNOWN differs.

Verified identical: MA, EMA (SMA seed, first value on bar n), Wilders, ATR, RSI, MACD, Signal, DEMA, TEMA, CCI, StochK/D, OBV, HHV/LLV(+Bars), Ref, Sum,
StDev, BBands, LinReg, TSF, Correlation, Cross, BarsSince, ValueWhen, ExRem, Flip, Highest/Lowest, IIf, Round, Min/Max.
Open (KNOWN): WMA first bars, ADX/PDI/MDI first ~100 bars, SAR start-up, rare Peak/Trough/Zig edge cases, MFI on exact ties.

To add a case: export the exploration from AmiBroker, put the CSV in fixtures/, add it to the list in run.mjs.
