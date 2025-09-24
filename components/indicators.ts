export function sma(series: number[], period: number): Array<number | null> {
  if (!Array.isArray(series) || period <= 0) return [];
  const result: Array<number | null> = new Array(series.length).fill(null);

  for (let index = period - 1; index < series.length; index++) {
    const window = series.slice(index - period + 1, index + 1);
    if (window.some((value) => !Number.isFinite(value))) {
      continue;
    }
    const sum = window.reduce((accumulator, value) => accumulator + value, 0);
    result[index] = sum / period;
  }

  return result;
}

export function ema(series: Array<number | null | undefined>, period: number): Array<number | null> {
  if (!Array.isArray(series) || period <= 0) return [];
  const normalized = series.map((value) =>
    typeof value === "number" && Number.isFinite(value) ? value : null,
  );
  const result: Array<number | null> = new Array(series.length).fill(null);
  const multiplier = 2 / (period + 1);
  let previous: number | null = null;
  let window: number[] = [];

  for (let index = 0; index < normalized.length; index++) {
    const value = normalized[index];
    if (value == null) {
      previous = null;
      window = [];
      result[index] = null;
      continue;
    }

    window.push(value);
    if (window.length > period) {
      window.shift();
    }

    if (previous == null) {
      if (window.length < period) {
        result[index] = null;
        continue;
      }
      const sum = window.reduce((accumulator, val) => accumulator + val, 0);
      previous = sum / period;
      result[index] = previous;
      continue;
    }

    previous = (value - previous) * multiplier + previous;
    result[index] = previous;
  }

  return result;
}

export function rsi(series: number[], period = 14): Array<number | null> {
  if (!Array.isArray(series) || series.length === 0 || period <= 0) return [];
  const result: Array<number | null> = new Array(series.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;

  for (let index = 1; index < series.length; index++) {
    const change = series[index] - series[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (index <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (index === period) {
        avgGain /= period;
        avgLoss /= period;
        const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
        result[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      }
      continue;
    }

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
    result[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  }

  return result;
}

export function macd(
  series: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: Array<number | null>; signal: Array<number | null>; hist: Array<number | null> } {
  if (!Array.isArray(series) || series.length === 0) {
    return { macd: [], signal: [], hist: [] };
  }

  const fastEma = ema(series, fast);
  const slowEma = ema(series, slow);
  const macdLine = series.map((_, index) => {
    const fastValue = fastEma[index];
    const slowValue = slowEma[index];
    if (fastValue == null || slowValue == null) return null;
    return fastValue - slowValue;
  });

  const signalLine = ema(macdLine, signal);
  const histogram = macdLine.map((value, index) => {
    const signalValue = signalLine[index];
    if (value == null || signalValue == null) return null;
    return value - signalValue;
  });

  return { macd: macdLine, signal: signalLine, hist: histogram };
}
