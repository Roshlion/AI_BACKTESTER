"use client";

import React, { useEffect, useMemo, useState } from "react";

const DEFAULT_TICKERS = ["AAPL", "MSFT"];

const DEFAULT_DSL_OBJECT = {
  name: "SMA Crossover",
  tickers: DEFAULT_TICKERS,
  startDate: "2020-01-01",
  endDate: new Date().toISOString().slice(0, 10),
  capital: 100000,
  rules: [
    {
      type: "sma_cross",
      params: { fast: 10, slow: 30, enter: "fast_above", exit: "fast_below" },
    },
  ],
};

const DEFAULT_DSL = JSON.stringify(DEFAULT_DSL_OBJECT, null, 2);

type IndicatorDescriptor = {
  type: "SMA" | "EMA" | "RSI" | "MACD";
  period?: number;
};

type Props = {
  initialTickers: string[];
  initialIndicators: string[];
  initialStartDate?: string | null;
  initialEndDate?: string | null;
};

function parseIndicators(rawIndicators: string[]): IndicatorDescriptor[] {
  const descriptors: IndicatorDescriptor[] = [];

  for (const token of rawIndicators) {
    const trimmed = token.trim().toUpperCase();
    if (!trimmed) continue;
    const match = trimmed.match(/^(SMA|EMA)(\d+)$/i);
    if (match) {
      descriptors.push({
        type: match[1].toUpperCase() as "SMA" | "EMA",
        period: Number(match[2]),
      });
      continue;
    }

    if (trimmed === "RSI" || trimmed === "MACD") {
      descriptors.push({ type: trimmed as "RSI" | "MACD" });
    }
  }

  return descriptors;
}

function buildDslFromSelection(
  tickers: string[],
  indicators: IndicatorDescriptor[],
  startDate: string | null | undefined,
  endDate: string | null | undefined,
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
        rules.push({
          type: "sma_cross",
          params: { fast, slow, enter: "fast_above", exit: "fast_below" },
        });
        break;
      }
      case "EMA": {
        const slow = indicator.period ?? 20;
        const fast = Math.max(2, Math.round(slow / 2));
        rules.push({
          type: "ema_cross",
          params: { fast, slow, enter: "fast_above", exit: "fast_below" },
        });
        break;
      }
      case "RSI": {
        rules.push({
          type: "rsi_threshold",
          params: { period: 14, low: 30, high: 70, enter: "long", exit: "long" },
        });
        break;
      }
      case "MACD": {
        rules.push({
          type: "macd_cross",
          params: { fast: 12, slow: 26, signal: 9, enter: "bull", exit: "bear" },
        });
        break;
      }
      default:
        break;
    }
  }

  if (!rules.length) {
    rules.push({
      type: "sma_cross",
      params: { fast: 10, slow: 30, enter: "fast_above", exit: "fast_below" },
    });
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

function formatIndicatorForPrompt(value: string): string {
  return value.replace(/(\d+)/g, "($1)");
}

export default function StrategyClient({
  initialTickers,
  initialIndicators,
  initialStartDate,
  initialEndDate,
}: Props) {
  const indicatorDescriptors = useMemo(
    () => parseIndicators(initialIndicators),
    [initialIndicators],
  );

  const derivedDsl = useMemo(
    () => buildDslFromSelection(initialTickers, indicatorDescriptors, initialStartDate, initialEndDate),
    [initialTickers, indicatorDescriptors, initialStartDate, initialEndDate],
  );

  const derivedPrompt = useMemo(() => {
    if (!initialIndicators.length) {
      return "";
    }

    return `Strategy idea: Use ${initialIndicators
      .map((indicator) => formatIndicatorForPrompt(indicator.toUpperCase()))
      .join(" and ")} on the selected stocks.`;
  }, [initialIndicators]);

  const [dsl, setDsl] = useState<string>(derivedDsl);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  const [promptText, setPromptText] = useState<string>(derivedPrompt);

  useEffect(() => {
    setDsl(derivedDsl);
  }, [derivedDsl]);

  useEffect(() => {
    setPromptText(derivedPrompt);
  }, [derivedPrompt]);

  const run = async () => {
    setErr("");
    try {
      const res = await fetch("/api/strategy/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: dsl,
      });
      const payload = await res.json();
      setResult(payload);
    } catch (error: any) {
      setErr(String(error));
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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-200">Prefilled tickers from Dashboard</h2>
        <p className="text-sm text-gray-300">{initialTickers.join(", ") || "None"}</p>
      </section>

      <section className="space-y-2">
        <label className="block text-sm font-medium text-gray-200" htmlFor="strategy-prompt">
          Strategy prompt
        </label>
        <textarea
          id="strategy-prompt"
          className="w-full border border-gray-700 bg-gray-800 rounded-lg p-3 text-sm text-gray-100 min-h-[120px] focus:outline-none focus:border-blue-500"
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          placeholder="Describe your strategy in plain English…"
        />
        <p className="text-xs text-gray-400">
          Edit the prompt before generating DSL or keep it as a note attached to this backtest.
        </p>
      </section>

      <section className="space-y-2">
        <label className="block text-sm font-medium text-gray-200" htmlFor="strategy-dsl">
          Strategy DSL
        </label>
        <textarea
          id="strategy-dsl"
          value={dsl}
          onChange={(event) => setDsl(event.target.value)}
          className="w-full h-72 text-sm text-gray-100 bg-gray-800 border border-gray-700 rounded-lg p-4 font-mono focus:outline-none focus:border-blue-500"
        />
      </section>

      <button
        onClick={run}
        className="px-4 py-2 bg-blue-600 rounded-md text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
      >
        Run backtest
      </button>

      {err && <pre className="mt-4 text-red-400 whitespace-pre-wrap">{err}</pre>}
      {result && (
        <pre className="mt-4 whitespace-pre-wrap bg-gray-800/80 border border-gray-700 rounded-lg p-4">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
