/**
 * AmiBroker Web Workstation - AFL Vector Engine
 * Evaluates AFL formulas over OHLCV vector arrays and computes indicator series.
 */

class AFLEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.plots = [];
    }

    // Vector Simple Moving Average
    sma(arr, period) {
        let res = new Array(arr.length).fill(null);
        for (let i = period - 1; i < arr.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) sum += arr[i - j];
            res[i] = sum / period;
        }
        return res;
    }

    // Vector Exponential Moving Average
    ema(arr, period) {
        let res = new Array(arr.length).fill(null);
        let k = 2 / (period + 1);
        let sum = 0;
        for (let i = 0; i < period; i++) sum += arr[i];
        res[period - 1] = sum / period;

        for (let i = period; i < arr.length; i++) {
            res[i] = (arr[i] * k) + (res[i - 1] * (1 - k));
        }
        return res;
    }

    // Vector Relative Strength Index
    rsi(closeArr, period = 14) {
        let res = new Array(closeArr.length).fill(null);
        let gains = 0, losses = 0;

        for (let i = 1; i <= period; i++) {
            let diff = closeArr[i] - closeArr[i - 1];
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;
        res[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));

        for (let i = period + 1; i < closeArr.length; i++) {
            let diff = closeArr[i] - closeArr[i - 1];
            let gain = diff >= 0 ? diff : 0;
            let loss = diff < 0 ? -diff : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;

            let rs = avgGain / (avgLoss || 1);
            res[i] = 100 - (100 / (1 + rs));
        }
        return res;
    }

    // Register Plot Command
    plot(series, name, color = '#2962FF', style = 'line', overlay = true) {
        this.plots.push({ series, name, color, style, overlay });
    }

    // Run Formula against incoming OHLCV Data
    execute(aflCode, ohlcvData) {
        this.reset();
        
        const Open = ohlcvData.map(d => d.open);
        const High = ohlcvData.map(d => d.high);
        const Low = ohlcvData.map(d => d.low);
        const Close = ohlcvData.map(d => d.close);
        const Volume = ohlcvData.map(d => d.volume);
        const Time = ohlcvData.map(d => d.time);

        // Standard AmiBroker shorthand aliases
        const O = Open, H = High, L = Low, C = Close, V = Volume;
        const MA = (arr, p) => this.sma(arr, p);
        const EMA = (arr, p) => this.ema(arr, p);
        const RSI = (arr, p) => this.rsi(arr, p);
        const Plot = (series, name, color, style, overlay) => this.plot(series, name, color, style, overlay);

        try {
            const runner = new Function(
                'Open', 'High', 'Low', 'Close', 'Volume', 'Time',
                'O', 'H', 'L', 'C', 'V',
                'MA', 'EMA', 'RSI', 'Plot',
                aflCode
            );

            runner(
                Open, High, Low, Close, Volume, Time,
                O, H, L, C, V,
                MA, EMA, RSI, Plot
            );

            return { success: true, plots: this.plots, time: Time, rawData: ohlcvData };
        } catch (err) {
            console.error("AFL Parsing Error:", err);
            return { success: false, error: err.message };
        }
    }
}

window.aflEngine = new AFLEngine();