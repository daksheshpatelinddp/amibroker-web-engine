// AFL Vector Engine & Technical Indicator Parser
class AFLEngine {
  // Vector Simple Moving Average
  MA(array, period) {
    const result = new Float32Array(array.length);
    let sum = 0;
    for (let i = 0; i < array.length; i++) {
      sum += array[i];
      if (i >= period) sum -= array[i - period];
      result[i] = i >= period - 1 ? sum / period : NaN;
    }
    return result;
  }

  // Vector Exponential Moving Average
  EMA(array, period) {
    const result = new Float32Array(array.length);
    const k = 2 / (period + 1);
    let prevEma = array[0];
    result[0] = prevEma;

    for (let i = 1; i < array.length; i++) {
      const currentEma = array[i] * k + prevEma * (1 - k);
      result[i] = currentEma;
      prevEma = currentEma;
    }
    return result;
  }

  // Vector RSI (Relative Strength Index)
  RSI(closeArray, period = 14) {
    const result = new Float32Array(closeArray.length);
    let gains = 0, losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = closeArray[i] - closeArray[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    result[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));

    for (let i = period + 1; i < closeArray.length; i++) {
      const diff = closeArray[i] - closeArray[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      
      const rs = avgGain / (avgLoss || 1);
      result[i] = 100 - (100 / (1 + rs));
    }
    return result;
  }

  // Crossover Logic: Array A crosses above Array B
  Cross(arrayA, arrayB) {
    const result = new Uint8Array(arrayA.length);
    for (let i = 1; i < arrayA.length; i++) {
      if (arrayA[i] > arrayB[i] && arrayA[i - 1] <= arrayB[i - 1]) {
        result[i] = 1;
      } else {
        result[i] = 0;
      }
    }
    return result;
  }

  // Shift array elements by N bars
  Ref(array, n) {
    const result = new Float32Array(array.length);
    for (let i = 0; i < array.length; i++) {
      const srcIdx = i + n; // n is negative for past bars
      result[i] = (srcIdx >= 0 && srcIdx < array.length) ? array[srcIdx] : NaN;
    }
    return result;
  }
}

window.aflEngine = new AFLEngine();