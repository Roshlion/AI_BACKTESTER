// app/dashboard/page.tsx
"use client";

import { Suspense } from "react";
import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TickerSelector } from "@/components/ticker-selector";
import { PriceChart } from "@/components/price-chart";
import Link from "next/link";
import { IndicatorToggles, type IndicatorState } from "@/components/IndicatorToggles";
import { getTickerMeta, intersectRange } from "@/lib/useDateLimits";
import { buildSamplePrompt } from "@/lib/samplePrompt";

const EMPTY_INDICATORS: IndicatorState = {
  rsi: false,
  macd: false,
  sma: false,
  ema: false,
};

function DashboardInner() {
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
  const [indicators, setIndicators] = useState<IndicatorState>({
    rsi: false,
    macd: false,
    sma: true,
    ema: false,
  });
  const [limits, setLimits] = useState<{ min?: string; max?: string }>({});
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [indicatorWarning, setIndicatorWarning] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedTicker = selectedTickers[0] ?? "";
  const indicatorLockReason =
    selectedTickers.length > 1
      ? "Indicators are available when exactly one ticker is selected."
      : selectedTickers.length === 0
        ? "Choose a ticker to enable indicator overlays."
        : null;
  const indicatorsLocked = Boolean(indicatorLockReason);
  const effectiveIndicators = indicatorsLocked ? EMPTY_INDICATORS : indicators;

  useEffect(() => {
    const hasTickersParam = searchParams.has("tickers");
    const hasTickerParam = searchParams.has("ticker");
    const tickersParam =
      searchParams.get("tickers") ?? searchParams.get("ticker") ?? "";
    const parsedTickers = tickersParam
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    if (parsedTickers.length) {
      if (parsedTickers.join(",") !== selectedTickers.join(",")) {
        setSelectedTickers(parsedTickers);
      }
    } else if ((hasTickersParam || hasTickerParam) && selectedTickers.length) {
      setSelectedTickers([]);
    }

    const start = searchParams.get("start") || undefined;
    const end = searchParams.get("end") || undefined;
    setDateRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [searchParams, selectedTickers]);

  const selectedTickersKey = useMemo(() => selectedTickers.join(","), [selectedTickers]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (selectedTickers.length) {
      params.set("tickers", selectedTickers.map((ticker) => ticker.toUpperCase()).join(","));
    } else {
      params.delete("tickers");
      params.delete("ticker");
    }

    if (dateRange.start) {
      params.set("start", dateRange.start);
    } else {
      params.delete("start");
    }

    if (dateRange.end) {
      params.set("end", dateRange.end);
    } else {
      params.delete("end");
    }

    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(next ? `?${next}` : "?", { scroll: false });
    }
  }, [selectedTickersKey, dateRange.start, dateRange.end, router, searchParams]);

  const updateTickerSelection = (tickers: string[]) => {
    setSelectedTickers(tickers.map((ticker) => ticker.toUpperCase()));
  };

  const handlePrimaryTickerSelect = (ticker: string) => {
    setSelectedTickers((prev) => {
      const upper = ticker.toUpperCase();
      if (!prev.length) return [upper];
      const remaining = prev.filter((value) => value !== upper);
      return [upper, ...remaining];
    });
  };

  useEffect(() => {
    if (!indicatorsLocked) {
      setIndicatorWarning(null);
    }
  }, [indicatorsLocked]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedTickers.length) {
      setLimits({});
      setLimitMessage(null);
      return;
    }

    (async () => {
      const meta = await getTickerMeta();
      if (cancelled) return;

      const nextLimits = intersectRange(selectedTickers, meta);
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
  }, [selectedTickersKey]);

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

  const handleNavigateToStrategy = () => {
    if (!selectedTickers.length) return;
    const params = new URLSearchParams();
    const tickersParam = selectedTickers.join(",");
    params.set("tickers", tickersParam);
    params.set("prefill", "1");

    const start = dateRange.start ?? limits.min;
    const end = dateRange.end ?? limits.max;
    if (start) params.set("start", start);
    if (end) params.set("end", end);

    const activeIndicators = Object.entries(effectiveIndicators)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    if (activeIndicators.length) {
      params.set("indicators", activeIndicators.join(","));
    }

    const promptSample = buildSamplePrompt(effectiveIndicators, selectedTickers, start, end);
    if (promptSample) {
      params.set("prompt", promptSample);
    }

    router.push(`/strategy?${params.toString()}`);
  };

  return (
    <Suspense fallback={<div className="p-6 text-gray-300">Loading…</div>}>
      <main className="min-h-screen bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="mb-8 space-y-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-sm sm:text-base text-gray-400">
              Real-time overview of available stock tickers and price data visualization
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Ticker Selection Panel */}
            <div className="lg:col-span-1 order-2 lg:order-1">
              <TickerSelector
                multi
                selectedTickers={selectedTickers}
                onTickersChange={updateTickerSelection}
                onTickerSelect={handlePrimaryTickerSelect}
                selectedTicker={selectedTicker}
              />

              {selectedTicker && (
                <div className="mt-4 p-4 bg-blue-900/30 rounded-lg border border-blue-700">
                  <h4 className="text-lg sm:text-xl font-semibold text-white mb-2">Selected</h4>
                  <div className="text-blue-200">
                    <div className="text-base sm:text-lg font-bold">{selectedTicker}</div>
                    <div className="text-sm text-blue-300">
                      Click a ticker to view its price chart and data
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 p-3 bg-gray-800 rounded-lg text-sm">
                <h4 className="text-lg sm:text-xl font-semibold text-white mb-2">Quick Actions</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Link
                    href="/backtester"
                    className="w-full text-left px-3 py-3 sm:py-2 bg-green-600 hover:bg-green-700 rounded text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                  >
                    → Test Trading Strategy
                  </Link>
                  <Link
                    href="/data"
                    className="w-full text-left px-3 py-3 sm:py-2 bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                  >
                    → Explore Data
                  </Link>
                </div>
              </div>
            </div>

            {/* Chart Panel */}
            <div className="lg:col-span-2 order-1 lg:order-2 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                    className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:col-span-2 xl:col-span-1 flex items-end text-sm text-gray-400">
                  Select one or more tickers to compare performance with optional indicator overlays.
                </div>
              </div>

              {limitMessage && (
                <div className="rounded-md border border-amber-600/30 bg-amber-900/10 px-4 py-2 text-xs text-amber-200">
                  {limitMessage}
                </div>
              )}

              <div className="flex flex-col gap-4 lg:flex-row">
                <div className="flex-1 min-w-0">
                  <PriceChart tickers={selectedTickers} dateRange={dateRange} indicators={effectiveIndicators} />
                </div>
                <div className="w-full lg:w-64 space-y-2">
                  <IndicatorToggles
                    value={indicatorsLocked ? EMPTY_INDICATORS : indicators}
                    onChange={(next) => {
                      if (indicatorsLocked) {
                        setIndicatorWarning(indicatorLockReason);
                        return;
                      }
                      setIndicatorWarning(null);
                      setIndicators(next);
                    }}
                    disabled={indicatorsLocked}
                    disabledReason={indicatorLockReason}
                    onDisabledAttempt={() => {
                      if (indicatorLockReason) {
                        setIndicatorWarning(indicatorLockReason);
                      }
                    }}
                  />
                  {indicatorWarning && (
                    <div className="rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-200">
                      {indicatorWarning}
                    </div>
                  )}
                </div>
              </div>

              {selectedTickers.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-400">
                    Send these filters to Strategy Lab to auto-populate tickers, dates, and a suggested prompt.
                  </p>
                  <button
                    type="button"
                    onClick={handleNavigateToStrategy}
                    className="inline-flex items-center justify-center rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                  >
                    Test a strategy with these filters
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Status Bar */}
          <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <div className="flex flex-col gap-4 text-sm sm:text-base md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-gray-300">Data Source: S3</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  <span className="text-gray-300">API Status: Active</span>
                </div>
              </div>
              <div className="text-gray-400">
                Last Updated: {new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </main>
    </Suspense>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-300">Loading…</div>}>
      <DashboardInner />
    </Suspense>
  );
}
