"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useStrategyState } from "@/components/strategy-state-context";
import { buildPromptFromIndicators, parseIndicators, type IndicatorDescriptor } from "@/lib/strategy-selection";

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

type Props = {
  initialTickers: string[];
  initialIndicators: string[];
  initialStartDate?: string | null;
  initialEndDate?: string | null;
};

function normaliseTicker(value: string): string {
  return value.trim().toUpperCase();
}

function uniqueTickers(tickers: string[]): string[] {
  return Array.from(
    new Set(
      tickers
        .map(normaliseTicker)
        .filter((ticker) => ticker.length > 0),
    ),
  );
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

export default function StrategyClient({
  initialTickers,
  initialIndicators,
  initialStartDate,
  initialEndDate,
}: Props) {
  const {
    tickers: storedTickers,
    indicators: storedIndicators,
    start: storedStart,
    end: storedEnd,
    prompt: storedPrompt,
    setSelection,
  } = useStrategyState();

  const prefilledTickers = storedTickers.length ? storedTickers : initialTickers;
  const prefilledIndicators = storedIndicators.length ? storedIndicators : initialIndicators;
  const prefilledStart = storedStart ?? initialStartDate ?? DEFAULT_DSL_OBJECT.startDate;
  const prefilledEnd = storedEnd ?? initialEndDate ?? DEFAULT_DSL_OBJECT.endDate;
  const prefilledPrompt = storedPrompt ?? buildPromptFromIndicators(prefilledIndicators);

  const indicatorDescriptors = useMemo(
    () => parseIndicators(prefilledIndicators),
    [prefilledIndicators],
  );

  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>(() =>
    uniqueTickers(prefilledTickers.length ? prefilledTickers : DEFAULT_TICKERS),
  );
  const [startDate, setStartDate] = useState<string>(prefilledStart);
  const [endDate, setEndDate] = useState<string>(prefilledEnd);
  const [tickerDraft, setTickerDraft] = useState("");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  const basePrompt = useMemo(() => prefilledPrompt, [prefilledPrompt]);
  const [promptText, setPromptText] = useState<string>(basePrompt);
  const [promptDirty, setPromptDirty] = useState(false);

  const baseDsl = useMemo(
    () => buildDslFromSelection(selectedTickers, indicatorDescriptors, startDate, endDate),
    [selectedTickers, indicatorDescriptors, startDate, endDate],
  );
  const [dsl, setDsl] = useState<string>(baseDsl);
  const [dslDirty, setDslDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTickers() {
      try {
        const res = await fetch("/api/index");
        if (!res.ok) return;
        const payload = await res.json();
        if (!cancelled && Array.isArray(payload?.tickers)) {
          setAvailableTickers(uniqueTickers(payload.tickers));
        }
      } catch (error) {
        console.error("Failed to load tickers", error);
      }
    }

    loadTickers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (prefilledTickers.length) {
      setSelectedTickers(uniqueTickers(prefilledTickers));
    }
  }, [prefilledTickers]);

  useEffect(() => {
    if (prefilledStart) setStartDate(prefilledStart);
  }, [prefilledStart]);

  useEffect(() => {
    if (prefilledEnd) setEndDate(prefilledEnd);
  }, [prefilledEnd]);

  useEffect(() => {
    if (!promptDirty) {
      setPromptText(basePrompt);
    }
  }, [basePrompt, promptDirty]);

  useEffect(() => {
    if (!dslDirty) {
      setDsl(baseDsl);
    }
  }, [baseDsl, dslDirty]);

  const addTicker = useCallback(() => {
    const normalised = normaliseTicker(tickerDraft);
    if (!normalised) return;
    setSelectedTickers((prev) => {
      if (prev.includes(normalised)) return prev;
      return [...prev, normalised];
    });
    setTickerDraft("");
  }, [tickerDraft]);

  const removeTicker = useCallback((ticker: string) => {
    setSelectedTickers((prev) => prev.filter((value) => value !== ticker));
  }, []);

  const regenerateFromSelection = useCallback(() => {
    setDsl(baseDsl);
    setDslDirty(false);
    setPromptText(basePrompt);
    setPromptDirty(false);
  }, [baseDsl, basePrompt]);

  useEffect(() => {
    setSelection({
      tickers: selectedTickers,
      indicators: prefilledIndicators,
      start: startDate || null,
      end: endDate || null,
      prompt: promptText || null,
    });
  }, [setSelection, selectedTickers, prefilledIndicators, startDate, endDate, promptText]);

  const handlePromptChange = (value: string) => {
    setPromptDirty(true);
    setPromptText(value);
  };

  const handleDslChange = (value: string) => {
    setDslDirty(true);
    setDsl(value);
  };

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
    <div className="min-h-screen space-y-6 bg-gray-900 px-4 py-8 text-white sm:px-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Strategy Lab</h1>
        <p className="text-sm text-gray-300">
          Review the pre-filled selections from the dashboard, tweak the prompt or DSL, and run a backtest when you’re ready.
        </p>
      </header>

      <section className="grid gap-4 rounded-lg border border-gray-700 bg-gray-800 p-4 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-200">Selected tickers</h2>
          <div className="flex flex-wrap gap-2" role="list">
            {selectedTickers.length === 0 ? (
              <p className="text-xs text-gray-400">No tickers selected yet.</p>
            ) : (
              selectedTickers.map((ticker) => (
                <button
                  key={ticker}
                  type="button"
                  onClick={() => removeTicker(ticker)}
                  data-testid={`strategy-selected-${ticker}`}
                  className="flex items-center gap-2 rounded-full bg-blue-700/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-blue-600"
                >
                  <span>{ticker}</span>
                  <span aria-hidden>×</span>
                  <span className="sr-only">Remove {ticker}</span>
                </button>
              ))
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[140px]">
              <label htmlFor="ticker-input" className="sr-only">
                Add ticker
              </label>
              <input
                id="ticker-input"
                value={tickerDraft}
                onChange={(event) => setTickerDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTicker();
                  }
                }}
                placeholder="Add ticker"
                list="strategy-ticker-options"
                className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              />
              <datalist id="strategy-ticker-options">
                {availableTickers.map((ticker) => (
                  <option key={ticker} value={ticker} />
                ))}
              </datalist>
            </div>
            <button
              type="button"
              onClick={addTicker}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Add
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-200">Backtest window</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="strategy-start" className="block text-xs uppercase tracking-wide text-gray-400">
                Start
              </label>
              <input
                id="strategy-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="strategy-end" className="block text-xs uppercase tracking-wide text-gray-400">
                End
              </label>
              <input
                id="strategy-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          {initialIndicators.length > 0 && (
            <p className="text-xs text-gray-400">
              Indicators suggested from the dashboard: {initialIndicators.join(", ")}
            </p>
          )}
          <button
            type="button"
            onClick={regenerateFromSelection}
            className="rounded-md border border-blue-500 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition-colors hover:bg-blue-600/20"
          >
            Regenerate DSL &amp; prompt
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <label className="block text-sm font-medium text-gray-200" htmlFor="strategy-prompt">
          Strategy prompt
        </label>
        <textarea
          id="strategy-prompt"
          className="min-h-[140px] w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          value={promptText}
          onChange={(event) => handlePromptChange(event.target.value)}
          placeholder="Describe your strategy in plain English…"
        />
        <p className="text-xs text-gray-400">
          Update the prompt before asking AI to generate DSL, or keep it as a note for this backtest run.
        </p>
      </section>

      <section className="space-y-2">
        <label className="block text-sm font-medium text-gray-200" htmlFor="strategy-dsl">
          Strategy DSL
        </label>
        <textarea
          id="strategy-dsl"
          value={dsl}
          onChange={(event) => handleDslChange(event.target.value)}
          className="h-72 w-full rounded-lg border border-gray-700 bg-gray-800 p-4 font-mono text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        />
      </section>

      <button
        onClick={run}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        Run backtest
      </button>

      {err && <pre className="mt-4 whitespace-pre-wrap text-red-400">{err}</pre>}
      {result && (
        <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-gray-700 bg-gray-800/80 p-4">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
