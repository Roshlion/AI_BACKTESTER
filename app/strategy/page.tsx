"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NotificationBar } from "@/components/notifications";
import { getTickerMeta, intersectRange } from "@/lib/useDateLimits";
import { buildSamplePromptFromKeys } from "@/lib/samplePrompt";

function parseTickers(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

const DEFAULT_PROMPT =
  "Design a swing trading strategy that uses SMA(20) crossovers with RSI confirmation and risk controls.";

export default function StrategyPage() {
  const [tickersInput, setTickersInput] = useState("AAPL, MSFT");
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [dslText, setDslText] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ message: string; tone?: "info" | "warning" | "success" | "error" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [limits, setLimits] = useState<{ min?: string; max?: string }>({});
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [prefillApplied, setPrefillApplied] = useState(false);

  const searchParams = useSearchParams();

  const activeTickers = useMemo(() => parseTickers(tickersInput), [tickersInput]);
  const activeTickersKey = useMemo(() => activeTickers.join(","), [activeTickers]);

  useEffect(() => {
    if (prefillApplied) return;
    if (!searchParams || searchParams.get("prefill") !== "1") return;

    const tickersParam = searchParams.get("tickers") ?? "";
    const startParam = searchParams.get("start") ?? undefined;
    const endParam = searchParams.get("end") ?? undefined;
    const promptParam = searchParams.get("prompt") ?? undefined;
    const indicatorsParam = searchParams.get("indicators") ?? undefined;

    if (tickersParam) {
      setTickersInput(tickersParam);
    }
    if (startParam || endParam) {
      setDateRange((prev) => ({
        start: startParam || prev.start,
        end: endParam || prev.end,
      }));
    }

    if (promptParam) {
      setPrompt(promptParam);
    } else if (indicatorsParam) {
      const sample = buildSamplePromptFromKeys(
        indicatorsParam.split(","),
        tickersParam ? parseTickers(tickersParam) : [],
        startParam,
        endParam,
      );
      if (sample) setPrompt(sample);
    }

    setNotification({ tone: "info", message: "Pre-filled from Dashboard." });
    setPrefillApplied(true);
  }, [searchParams, prefillApplied]);

  useEffect(() => {
    let cancelled = false;
    if (!activeTickers.length) {
      setLimits({});
      setLimitMessage(null);
      return;
    }

    (async () => {
      const meta = await getTickerMeta();
      if (cancelled) return;

      const nextLimits = intersectRange(activeTickers, meta);
      setLimits(nextLimits);

      if (nextLimits.min && nextLimits.max && nextLimits.min > nextLimits.max) {
        setLimitMessage("No overlapping date range for the selected tickers.");
        if (dateRange.start || dateRange.end) {
          setDateRange({});
        }
        return;
      }

      let start = dateRange.start;
      let end = dateRange.end;
      let clamped = false;

      if (nextLimits.min && start && start < nextLimits.min) {
        start = nextLimits.min;
        clamped = true;
      }
      if (nextLimits.max && end && end > nextLimits.max) {
        end = nextLimits.max;
        clamped = true;
      }
      if (nextLimits.min && nextLimits.max && start && end && start > nextLimits.max) {
        start = nextLimits.min;
        end = nextLimits.max;
        clamped = true;
      }

      if (start !== dateRange.start || end !== dateRange.end) {
        setDateRange({ start, end });
      }

      if (clamped && (nextLimits.min || nextLimits.max)) {
        const minLabel = nextLimits.min ?? "earliest";
        const maxLabel = nextLimits.max ?? "latest";
        setLimitMessage(`Dates limited to available range across selected tickers: ${minLabel} → ${maxLabel}.`);
      } else {
        setLimitMessage(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTickersKey]);

  const limitValid = !limits.min || !limits.max || limits.min <= limits.max;

  const handleStartChange = (value: string) => {
    let next = value ? value : undefined;
    if (next && limits.min && next < limits.min) {
      next = limits.min;
    }
    if (limitValid && next && limits.max && next > limits.max) {
      next = limits.max;
    }

    let end = dateRange.end;
    if (next && end && end < next) {
      end = next;
    }
    setDateRange({ start: next, end });
  };

  const handleEndChange = (value: string) => {
    let next = value ? value : undefined;
    if (limitValid && next && limits.max && next > limits.max) {
      next = limits.max;
    }
    if (next && limits.min && next < limits.min) {
      next = limits.min;
    }

    let start = dateRange.start;
    if (start && next && start > next) {
      start = next;
    }
    setDateRange({ start, end: next });
  };

  const runBacktest = async () => {
    setError(null);
    setNotification(null);
    setLogs([]);

    const parsed = parseTickers(tickersInput);
    if (!parsed.length) {
      setError("Please provide at least one ticker symbol.");
      return;
    }
    if (!prompt.trim()) {
      setError("Please describe the strategy you want to generate.");
      return;
    }

    setIsSubmitting(true);
    try {
      const meta = await getTickerMeta();
      const available = new Set(Object.keys(meta));
      const validTickers = parsed.filter((ticker) => available.has(ticker));
      const invalidTickers = parsed.filter((ticker) => !available.has(ticker));

      if (invalidTickers.length) {
        if (!validTickers.length) {
          setNotification({
            tone: "error",
            message: `Removed unavailable tickers: ${invalidTickers.join(", ")}. No valid tickers remain.`,
          });
          setTickersInput("");
          setIsSubmitting(false);
          return;
        }
        setNotification({
          tone: "warning",
          message: `Removed unavailable tickers: ${invalidTickers.join(", ")}. Continuing with: ${validTickers.join(", ")}.`,
        });
        setTickersInput(validTickers.join(", "));
      }

      const workingTickers = validTickers.length ? validTickers : parsed;
      const workingLimits = intersectRange(workingTickers, meta);
      if (workingLimits.min && workingLimits.max && workingLimits.min > workingLimits.max) {
        setError("No overlapping history for the selected tickers.");
        setIsSubmitting(false);
        return;
      }

      const startDate = dateRange.start ?? workingLimits.min ?? limits.min;
      const endDate = dateRange.end ?? workingLimits.max ?? limits.max;

      const generateResponse = await fetch("/api/strategy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const generated = await generateResponse.json();
      if (!generateResponse.ok || !generated.ok) {
        throw new Error(generated.error || "Failed to generate strategy definition");
      }
      setDslText(JSON.stringify(generated.dsl, null, 2));

      const runResponse = await fetch("/api/strategy/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: workingTickers,
          startDate,
          endDate,
          dsl: generated.dsl,
        }),
      });
      const runJson = await runResponse.json();
      if (!runResponse.ok || !runJson.ok) {
        throw new Error(runJson.error || "Strategy backtest failed");
      }

      setResult(runJson);
      setLogs(runJson.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-8 space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold">Strategy Lab</h1>
          <p className="text-sm sm:text-base text-gray-300">
            Generate a rules-based trading strategy with AI, validate tickers, and run a quick historical backtest.
          </p>
        </div>

        <div className="space-y-4">
          {notification && (
            <NotificationBar
              message={notification.message}
              tone={notification.tone}
              onDismiss={() => setNotification(null)}
            />
          )}
          {error && (
            <NotificationBar message={error} tone="error" onDismiss={() => setError(null)} />
          )}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <section className="space-y-4 lg:col-span-3 min-w-0">
            <div className="space-y-5 rounded-lg border border-gray-700 bg-gray-800/70 p-4 sm:p-6">
              <div>
                <label className="block text-sm font-semibold text-gray-200">Tickers</label>
                <textarea
                  value={tickersInput}
                  onChange={(event) => setTickersInput(event.target.value)}
                  placeholder="AAPL, MSFT, NVDA"
                  className="mt-2 w-full min-h-[5rem] rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">Separate with commas, spaces, or new lines.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={dateRange.start ?? ""}
                    min={limits.min}
                    max={limitValid ? limits.max : undefined}
                    onChange={(event) => handleStartChange(event.target.value)}
                    className="w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={dateRange.end ?? ""}
                    min={limits.min}
                    max={limitValid ? limits.max : undefined}
                    onChange={(event) => handleEndChange(event.target.value)}
                    className="w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {limitMessage && (
                <p className="text-xs text-amber-300">{limitMessage}</p>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-200">Strategy prompt</label>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="mt-2 w-full min-h-[10rem] rounded border border-gray-600 bg-gray-900 px-3 py-3 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={runBacktest}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-600/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                >
                  {isSubmitting ? "Running…" : "Generate & Run"}
                </button>
                <p className="text-xs text-gray-400">
                  The lab will validate your tickers, generate a DSL strategy, and execute a quick historical simulation.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4 lg:col-span-2 min-w-0">
            {dslText && (
              <div className="rounded-lg border border-gray-700 bg-gray-800/80 p-4">
                <h3 className="text-sm font-semibold text-gray-200">Generated Strategy DSL</h3>
                <pre className="mt-3 max-h-72 overflow-auto rounded bg-gray-900/70 p-3 text-xs text-gray-100">
                  {dslText}
                </pre>
              </div>
            )}

            {result?.summary && (
              <div className="rounded-lg border border-gray-700 bg-gray-800/80 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-200">Backtest Summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm text-gray-200">
                  <div>
                    <div className="text-xs uppercase text-gray-400">Processed</div>
                    <div>{result.summary.processedTickers}/{result.summary.requestedTickers}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-gray-400">Avg Return</div>
                    <div>{result.summary.avgReturnPct?.toFixed?.(2) ?? "0.00"}%</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-gray-400">Trades</div>
                    <div>{result.summary.totalTrades ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-gray-400">Range</div>
                    <div>
                      {result.summary.startDate} → {result.summary.endDate}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {Array.isArray(result?.perTicker) && result.perTicker.length > 0 && (
              <div className="rounded-lg border border-gray-700 bg-gray-800/80 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-200">Per-ticker performance</h3>
                <div className="space-y-2 text-xs text-gray-200">
                  {result.perTicker.map((entry: any) => (
                    <div
                      key={entry.ticker}
                      className="flex items-center justify-between rounded border border-gray-700 bg-gray-900/60 px-3 py-2"
                    >
                      <span className="font-semibold text-white">{entry.ticker}</span>
                      {entry.stats ? (
                        <span className="text-emerald-400">
                          {entry.stats.totalReturnPct?.toFixed?.(2) ?? "0.00"}% return · {entry.stats.trades ?? 0} trades
                        </span>
                      ) : (
                        <span className="text-gray-400">No trades</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {logs.length > 0 && (
              <div className="rounded-lg border border-gray-700 bg-gray-800/80 p-4">
                <h3 className="text-sm font-semibold text-gray-200">Execution logs</h3>
                <ul className="mt-2 space-y-1 text-xs text-gray-300">
                  {logs.map((log, index) => (
                    <li key={index} className="rounded bg-gray-900/60 px-2 py-1">
                      {log}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
