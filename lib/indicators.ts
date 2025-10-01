export function sma(values: number[], period: number): Array<number | null> {
  const p = Math.max(1, Math.round(period))
  const result: Array<number | null> = new Array(values.length).fill(null)
  if (values.length === 0) return result

  let sum = 0
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]
    if (i >= p) {
      sum -= values[i - p]
    }
    if (i >= p - 1) {
      result[i] = sum / p
    }
  }

  return result
}

export function ema(values: number[], period: number): Array<number | null> {
  const p = Math.max(1, Math.round(period))
  const result: Array<number | null> = new Array(values.length).fill(null)
  if (values.length === 0) return result

  const alpha = 2 / (p + 1)
  let emaValue = values[0]
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (i === 0) {
      emaValue = value
    } else {
      emaValue = alpha * value + (1 - alpha) * emaValue
    }
    if (i >= p - 1) {
      result[i] = emaValue
    }
  }

  return result
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const p = Math.max(1, Math.round(period))
  if (values.length <= 1) {
    return new Array(values.length).fill(null)
  }

  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1]
    gains.push(Math.max(delta, 0))
    losses.push(Math.max(-delta, 0))
  }

  const avgGains = ema(gains, p)
  const avgLosses = ema(losses, p)
  const result: Array<number | null> = new Array(values.length).fill(null)

  for (let i = 1; i < values.length; i += 1) {
    const gain = avgGains[i - 1]
    const loss = avgLosses[i - 1]
    if (gain == null || loss == null) {
      result[i] = null
      continue
    }
    if (loss === 0) {
      result[i] = 100
      continue
    }
    const rs = gain / loss
    result[i] = 100 - 100 / (1 + rs)
  }

  return result
}

export type MacdSeries = {
  macd: Array<number | null>
  signal: Array<number | null>
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const slowEma = ema(values, slow)
  const fastEma = ema(values, fast)
  const macdLine: Array<number | null> = new Array(values.length).fill(null)

  for (let i = 0; i < values.length; i += 1) {
    const fastValue = fastEma[i]
    const slowValue = slowEma[i]
    if (fastValue == null || slowValue == null) {
      macdLine[i] = null
    } else {
      macdLine[i] = fastValue - slowValue
    }
  }

  const macdValues = macdLine.map((value) => value ?? 0)
  const signalLineRaw = ema(macdValues, signalPeriod)
  const signalLine: Array<number | null> = signalLineRaw.map((value, index) =>
    macdLine[index] == null ? null : value,
  )

  return { macd: macdLine, signal: signalLine }
}
