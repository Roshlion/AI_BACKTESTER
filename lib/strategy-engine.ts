// lib/strategy-engine.ts
import type { Row } from "../types/row";
import { MACD, RSI, SMA, EMA } from "./indicators";

export type StrategyDSL = {
  name: string;
  rules: {
    type: "macd_cross" | "rsi_threshold" | "sma_cross" | "ema_cross";
    params: Record<string, number>;
    enter?: "long";
    exit?: "long";
  }[];
};

export type BacktestResult = {
  name: string;
  trades: { entryIdx: number; exitIdx: number; entryPrice: number; exitPrice: number; pnl: number }[];
  equity: number[];
  stats: { totalReturnPct: number; trades: number; winRatePct: number; avgTradePct: number };
};

type Mkt = Row;

function normaliseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  if (typeof value === "bigint") return Number(value);
  return NaN;
}

export function normaliseDsl(candidate: any): StrategyDSL {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Strategy DSL must be an object");
  }
  const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Custom Strategy";
  const rawRules = Array.isArray(candidate.rules) ? candidate.rules : [];
  const rules = rawRules
    .map((rule) => {
      const type = rule?.type;
      const params = rule?.params;
      if (type !== "macd_cross" && type !== "rsi_threshold" && type !== "sma_cross" && type !== "ema_cross") {
        return null;
      }
      if (!params || typeof params !== "object") {
        return null;
      }
      const numericParams: Record<string, number> = {};
      for (const [key, value] of Object.entries(params)) {
        const n = normaliseNumber(value);
        if (!Number.isFinite(n)) continue;
        numericParams[key] = n;
      }
      return {
        type,
        params: numericParams,
        enter: rule?.enter === "long" ? "long" : undefined,
        exit: rule?.exit === "long" ? "long" : undefined,
      } as StrategyDSL["rules"][number];
    })
    .filter(Boolean) as StrategyDSL["rules"][number][];

  if (!rules.length) {
    throw new Error("Strategy contains no usable rules");
  }

  return { name, rules };
}

export function runBacktest(dsl: StrategyDSL, data: Mkt[]): BacktestResult {
  const closes = data.map((d) => d.close);
  const indicators: Record<string, number[]> = {};
  const sigEnter: boolean[] = new Array(data.length).fill(false);
  const sigExit: boolean[] = new Array(data.length).fill(false);

  for (const r of dsl.rules) {
    switch (r.type) {
      case "macd_cross": {
        const f = r.params.fast ?? 12;
        const s = r.params.slow ?? 26;
        const sg = r.params.signal ?? 9;
        const { macd, signal } = MACD(closes, f, s, sg);
        const crossUp = macd.map((v, i) => i > 0 && macd[i - 1] <= signal[i - 1] && v > signal[i]);
        const crossDn = macd.map((v, i) => i > 0 && macd[i - 1] >= signal[i - 1] && v < signal[i]);
        for (let i = 0; i < data.length; i++) {
          if (r.enter === "long") sigEnter[i] ||= !!crossUp[i];
          if (r.exit === "long") sigExit[i] ||= !!crossDn[i];
        }
        break;
      }
      case "rsi_threshold": {
        const p = r.params.period ?? 14;
        const lo = r.params.low ?? 30;
        const hi = r.params.high ?? 70;
        const rsi = (indicators[si_] ||= RSI(closes, p));
        for (let i = 0; i < data.length; i++) {
          if (r.enter === "long") sigEnter[i] ||= rsi[i] <= lo;
          if (r.exit === "long") sigExit[i] ||= rsi[i] >= hi;
        }
        break;
      }
      case "sma_cross": {
        const a = r.params.fast ?? 10;
        const b = r.params.slow ?? 20;
        const fa = (indicators[sma_] ||= SMA(closes, a));
        const fb = (indicators[sma_] ||= SMA(closes, b));
        const up = fa.map((v, i) => i > 0 && fa[i - 1] <= fb[i - 1] && v > fb[i]);
        const dn = fa.map((v, i) => i > 0 && fa[i - 1] >= fb[i - 1] && v < fb[i]);
        for (let i = 0; i < data.length; i++) {
          if (r.enter === "long") sigEnter[i] ||= !!up[i];
          if (r.exit === "long") sigExit[i] ||= !!dn[i];
        }
        break;
      }
      case "ema_cross": {
        const a = r.params.fast ?? 10;
        const b = r.params.slow ?? 20;
        const fa = (indicators[ema_] ||= EMA(closes, a));
        const fb = (indicators[ema_] ||= EMA(closes, b));
        const up = fa.map((v, i) => i > 0 && fa[i - 1] <= fb[i - 1] && v > fb[i]);
        const dn = fa.map((v, i) => i > 0 && fa[i - 1] >= fb[i - 1] && v < fb[i]);
        for (let i = 0; i < data.length; i++) {
          if (r.enter === "long") sigEnter[i] ||= !!up[i];
          if (r.exit === "long") sigExit[i] ||= !!dn[i];
        }
        break;
      }
    }
  }

  const trades: BacktestResult["trades"] = [];
  const equity: number[] = new Array(data.length).fill(1);
  let holding = false;
  let entryIdx = -1;
  let lastEquity = 1;

  for (let i = 0; i < data.length; i++) {
    if (!holding && sigEnter[i]) {
      holding = true;
      entryIdx = i;
    } else if (holding && sigExit[i] && i > entryIdx) {
      const entry = data[entryIdx].close;
      const exit = data[i].close;
      const pnl = (exit - entry) / entry;
      lastEquity *= 1 + pnl;
      trades.push({ entryIdx, exitIdx: i, entryPrice: entry, exitPrice: exit, pnl });
      holding = false;
    }
    equity[i] = lastEquity * (holding && entryIdx >= 0 ? data[i].close / data[entryIdx].close : 1);
  }

  const returns = trades.map((t) => t.pnl);
  const totalReturnPct = (equity.at(-1)! - 1) * 100;
  const winRatePct = returns.length ? (100 * returns.filter((x) => x > 0).length) / returns.length : 0;
  const avgTradePct = returns.length ? (100 * returns.reduce((a, b) => a + b, 0)) / returns.length : 0;

  return {
    name: dsl.name,
    trades,
    equity,
    stats: { totalReturnPct, trades: trades.length, winRatePct, avgTradePct },
  };
}