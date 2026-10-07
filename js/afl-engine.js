/**
 * AmiBroker Web Workstation - AFL Vector Engine
 */

class AFLEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.plots = [];
    }

    sma(arr, period) {
        let res = new Array(arr.length).fill(null);
        for (let i = period - 1; i < arr.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) sum += arr[i - j];
            res[i] = sum / period;
        }
        return res;
    }

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

    plot(series, name, color = '#2962FF', style = 'line', overlay = true) {
        this.plots.push({ series, name, color, style, overlay });
    }

    execute(aflCode, ohlcvData) {
        this.reset();
        
        if (!ohlcvData || ohlcvData.length === 0) {
            return { success: false, error: "Empty dataset provided" };
        }

        const Open = ohlcvData.map(d => parseFloat(d.open));
        const High = ohlcvData.map(d => parseFloat(d.high));
        const Low = ohlcvData.map(d => parseFloat(d.low));
        const Close = ohlcvData.map(d => parseFloat(d.close));
        const Volume = ohlcvData.map(d => parseFloat(d.volume || 0));
        const Time = ohlcvData.map(d => d.time);

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
            return { success: false, error: err.message };
        }
    }
}

window.aflEngine = new AFLEngine();