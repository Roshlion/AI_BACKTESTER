// lib/indicators.ts
export function SMA(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function EMA(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (i === 0) ema = v;
    else ema = v * k + ema * (1 - k);
    out.push(i >= period - 1 ? ema : NaN);
  }
  return out;
}

export function MACD(values: number[], fast=12, slow=26, signal=9) {
  const emaFast = EMA(values, fast);
  const emaSlow = EMA(values, slow);
  const macd = values.map((_, i) => emaFast[i] - emaSlow[i]);
  const sig = EMA(macd.map(v => (isFinite(v) ? v : 0)), signal);
  const hist = macd.map((v, i) => v - sig[i]);
  return { macd, signal: sig, hist };
}

export function RSI(values: number[], period=14): number[] {
  const out: number[] = [];
  let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const ch = values[i] - values[i-1];
    const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= period) { gain += g; loss += l; out.push(NaN); continue; }
    gain = (gain*(period-1) + g)/period;
    loss = (loss*(period-1) + l)/period;
    const rs = loss === 0 ? 100 : 100*(1 - 1/(1 + gain/loss));
    out.push(rs);
  }
  out.unshift(NaN);
  return out;
}
