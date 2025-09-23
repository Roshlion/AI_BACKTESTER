import type { Row } from "../types/row";
import { MACD, RSI, SMA, EMA } from "./indicators";

type MacdRule = {
  type: "macd_cross";
  params: {
    fast: number;
    slow: number;
    signal: number;
    enter?: "bull" | "bear";
    exit?: "bull" | "bear";
  };
};

type RsiRule = {
  type: "rsi_threshold";
  params: {
    period: number;
    low?: number;
    high?: number;
    enter?: "long" | "short";
    exit?: "long" | "short";
  };
};

type CrossRule = {
  type: "sma_cross" | "ema_cross";
  params: {
    fast: number;
    slow: number;
    enter?: "fast_above" | "fast_below";
    exit?: "fast_above" | "fast_below";
  };
};

type Rule = MacdRule | RsiRule | CrossRule;

export type StrategyDSL = {
  name: string;
  rules: Rule[];
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
  return Number.NaN;
}

function numberOr(value: unknown, fallback: number): number {
  const n = normaliseNumber(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normaliseDsl(candidate: any): StrategyDSL {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Strategy DSL must be an object");
  }

  const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Custom Strategy";
  const rawRules = Array.isArray(candidate.rules) ? candidate.rules : [];

  const rules: Rule[] = rawRules
    .map((raw: any) => ({ type: raw?.type, params: raw?.params ?? {}, raw }))
    .filter((entry: { type: unknown; params: any; raw: any }): entry is { type: Rule["type"]; params: any; raw: any } =>
      ["macd_cross", "rsi_threshold", "sma_cross", "ema_cross"].includes(entry.type as string),
    )
    .map((entry: { type: Rule["type"]; params: any; raw: any }): Rule => {
      switch (entry.type) {
        case "macd_cross": {
          const enterParam = entry.params.enter ?? entry.raw?.enter;
          const exitParam = entry.params.exit ?? entry.raw?.exit;
          const enter = enterParam === "bear" ? "bear" : enterParam === "bull" ? "bull" : undefined;
          const exit = exitParam === "bear" ? "bear" : exitParam === "bull" ? "bull" : undefined;
          return {
            type: "macd_cross" as const,
            params: {
              fast: numberOr(entry.params.fast, 12),
              slow: numberOr(entry.params.slow, 26),
              signal: numberOr(entry.params.signal, 9),
              enter,
              exit,
            },
          } satisfies MacdRule;
        }
        case "rsi_threshold": {
          const enterParam = entry.params.enter ?? entry.raw?.enter;
          const exitParam = entry.params.exit ?? entry.raw?.exit;
          const enter = enterParam === "short" ? "short" : enterParam === "long" ? "long" : undefined;
          const exit = exitParam === "short" ? "short" : exitParam === "long" ? "long" : undefined;
          return {
            type: "rsi_threshold" as const,
            params: {
              period: numberOr(entry.params.period, 14),
              low: Number.isFinite(normaliseNumber(entry.params.low)) ? Number(entry.params.low) : undefined,
              high: Number.isFinite(normaliseNumber(entry.params.high)) ? Number(entry.params.high) : undefined,
              enter,
              exit,
            },
          } satisfies RsiRule;
        }
        case "sma_cross":
        case "ema_cross": {
          const enterParam = entry.params.enter ?? entry.raw?.enter;
          const exitParam = entry.params.exit ?? entry.raw?.exit;
          const mapDirection = (value: any): "fast_above" | "fast_below" | undefined => {
            if (value === "fast_above" || value === "fast_below") return value;
            if (value === "long") return "fast_above";
            if (value === "short") return "fast_below";
            return undefined;
          };
          return {
            type: entry.type,
            params: {
              fast: numberOr(entry.params.fast, 10),
              slow: numberOr(entry.params.slow, 20),
              enter: mapDirection(enterParam),
              exit: mapDirection(exitParam),
            },
          } satisfies CrossRule;
        }
        default:
          throw new Error(`Unsupported rule type: ${String(entry.type)}`);
      }
    });

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

  for (const rule of dsl.rules) {
    switch (rule.type) {
      case "macd_cross": {
        const { fast, slow, signal, enter, exit } = rule.params;
        const { macd, signal: sig } = MACD(closes, fast, slow, signal);
        const crossUp = macd.map((value, i) => i > 0 && macd[i - 1] <= sig[i - 1] && value > sig[i]);
        const crossDown = macd.map((value, i) => i > 0 && macd[i - 1] >= sig[i - 1] && value < sig[i]);

        for (let i = 0; i < data.length; i++) {
          const enterMode = enter ?? "bull";
          if (enterMode === "bull") sigEnter[i] ||= crossUp[i];
          if (enterMode === "bear") sigEnter[i] ||= crossDown[i];

          const exitMode = exit ?? "bear";
          if (exitMode === "bull") sigExit[i] ||= crossUp[i];
          if (exitMode === "bear") sigExit[i] ||= crossDown[i];
        }
        break;
      }
      case "rsi_threshold": {
        const { period, low, high, enter, exit } = rule.params;
        const lo = low ?? 30;
        const hi = high ?? 70;
        const key = `rsi_${period}`;
        const rsi = (indicators[key] ??= RSI(closes, period));

        for (let i = 0; i < data.length; i++) {
          const enterMode = enter ?? "long";
          if (enterMode === "long") sigEnter[i] ||= rsi[i] <= lo;
          if (enterMode === "short") sigEnter[i] ||= rsi[i] >= hi;

          const exitMode = exit ?? "long";
          if (exitMode === "long") sigExit[i] ||= rsi[i] >= hi;
          if (exitMode === "short") sigExit[i] ||= rsi[i] <= lo;
        }
        break;
      }
      case "sma_cross":
      case "ema_cross": {
        const { fast, slow, enter, exit } = rule.params;
        const fastKey = `${rule.type}_${fast}`;
        const slowKey = `${rule.type}_${slow}`;
        if (!indicators[fastKey]) {
          indicators[fastKey] = rule.type === "sma_cross" ? SMA(closes, fast) : EMA(closes, fast);
        }
        if (!indicators[slowKey]) {
          indicators[slowKey] = rule.type === "sma_cross" ? SMA(closes, slow) : EMA(closes, slow);
        }
        const fastSeries = indicators[fastKey];
        const slowSeries = indicators[slowKey];

        const crossUp = fastSeries.map(
          (value, i) => i > 0 && fastSeries[i - 1] <= slowSeries[i - 1] && value > slowSeries[i],
        );
        const crossDown = fastSeries.map(
          (value, i) => i > 0 && fastSeries[i - 1] >= slowSeries[i - 1] && value < slowSeries[i],
        );

        for (let i = 0; i < data.length; i++) {
          const enterMode = enter ?? "fast_above";
          if (enterMode === "fast_above") sigEnter[i] ||= crossUp[i];
          if (enterMode === "fast_below") sigEnter[i] ||= crossDown[i];

          const exitMode = exit ?? "fast_below";
          if (exitMode === "fast_above") sigExit[i] ||= crossUp[i];
          if (exitMode === "fast_below") sigExit[i] ||= crossDown[i];
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




