"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const DEFAULT_TICKERS = ["AAPL", "MSFT"];

const DEFAULT_DSL_OBJECT = {
  name: "SMA Crossover",
  tickers: DEFAULT_TICKERS,
  startDate: "2020-01-01",
  endDate: new Date().toISOString().slice(0, 10),
  capital: 100000,
  rules: [
    { type: "sma_cross", params: { fast: 10, slow: 30, enter: "fast_above", exit: "fast_below" } },
  ],
};

const DEFAULT_DSL = JSON.stringify(DEFAULT_DSL_OBJECT, null, 2);

type IndicatorDescriptor = {
  type: "SMA" | "EMA" | "RSI" | "MACD";
  period?: number;
};

function parseIndicators(raw: string | null): IndicatorDescriptor[] {
  if (!raw) return [];
  const descriptors: IndicatorDescriptor[] = [];
  for (const token of raw.split(",")) {
    const value = token.trim().toUpperCase();
    if (!value) continue;
    const match = value.match(/^(SMA|EMA)(\d+)$/i);
    if (match) {
      descriptors.push({ type: match[1].toUpperCase() as "SMA" | "EMA", period: Number(match[2]) });
      continue;
    }
    if (value === "RSI" || value === "MACD") {
      descriptors.push({ type: value as "RSI" | "MACD" });
    }
  }
  return descriptors;
}

function normaliseTickers(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value, index, self) => value && self.indexOf(value) === index);
}

function buildDslFromSelection(
  tickers: string[],
  indicators: IndicatorDescriptor[],
  startDate: string | null,
  endDate: string | null,
): string {
  if (!tickers.length) {
    return DEFAULT_DSL;
  }

  const rules: any[] = [];

  for (const indicator of indicators) {
    switch (indicator.type) {
      case "SMA": {
        const slow = indicator.period ?? 50;
        const fast = Math.max(2, Math.round(slow / 2));
        rules.push({ type: "sma_cross", params: { fast, slow, enter: "fast_above", exit: "fast_below" } });
        break;
      }
      case "EMA": {
        const slow = indicator.period ?? 20;
        const fast = Math.max(2, Math.round(slow / 2));
        rules.push({ type: "ema_cross", params: { fast, slow, enter: "fast_above", exit: "fast_below" } });
        break;
      }
      case "RSI": {
        rules.push({ type: "rsi_threshold", params: { period: 14, low: 30, high: 70, enter: "long", exit: "long" } });
        break;
      }
      case "MACD": {
        rules.push({ type: "macd_cross", params: { fast: 12, slow: 26, signal: 9, enter: "bull", exit: "bear" } });
        break;
      }
      default:
        break;
    }
  }

  if (!rules.length) {
    rules.push({ type: "sma_cross", params: { fast: 10, slow: 30, enter: "fast_above", exit: "fast_below" } });
  }

  const dslObject = {
    name: "Dashboard Strategy",
    tickers,
    startDate: startDate ?? DEFAULT_DSL_OBJECT.startDate,
    endDate: endDate ?? DEFAULT_DSL_OBJECT.endDate,
    capital: 100000,
    rules,
  };

  return JSON.stringify(dslObject, null, 2);
}

export default function StrategyPage() {
  const searchParams = useSearchParams();
  const derivedDsl = useMemo(() => {
    const tickers = normaliseTickers(searchParams.get("tickers"));
    const indicators = parseIndicators(searchParams.get("indicators"));
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (!tickers.length) {
      return DEFAULT_DSL;
    }
    return buildDslFromSelection(tickers, indicators, start, end);
  }, [searchParams]);

  const [dsl, setDsl] = useState(derivedDsl);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setDsl(derivedDsl);
  }, [derivedDsl]);

  const run = async () => {
    setErr("");
    try {
      const res = await fetch("/api/strategy/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: dsl,
      });
      const j = await res.json();
      setResult(j);
    } catch (e: any) {
      setErr(String(e));
    }
  };

  return (
    <div className="p-8 text-white space-y-6 min-h-screen bg-gray-900">
      <div>
        <h1 className="text-3xl font-bold">Strategy Lab</h1>
        <p className="text-gray-300 mt-1 text-sm">
          Paste or tweak the strategy DSL below, then run it against the selected tickers.
        </p>
      </div>

      <textarea
        value={dsl}
        onChange={(e) => setDsl(e.target.value)}
        className="w-full h-72 text-sm text-gray-100 bg-gray-800 border border-gray-700 rounded-lg p-4 font-mono focus:outline-none focus:border-blue-500"
      />

      <button
        onClick={run}
        className="px-4 py-2 bg-blue-600 rounded-md text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
      >
        Run backtest
      </button>

      {err && <pre className="mt-4 text-red-400 whitespace-pre-wrap">{err}</pre>}
      {result && <pre className="mt-4 whitespace-pre-wrap bg-gray-800/80 border border-gray-700 rounded-lg p-4">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
