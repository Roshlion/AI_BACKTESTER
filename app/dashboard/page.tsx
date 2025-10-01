// app/dashboard/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TickerSelector } from "@/components/ticker-selector";
import { PriceChart } from "@/components/price-chart";
import Link from "next/link";
import { EMA, MACD, RSI, SMA } from "@/lib/indicators";

interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CombinedPoint {
  date: string;
  [key: string]: number | string | null;
}

const COLORS = [
  "#3B82F6",
  "#F59E0B",
  "#10B981",
  "#EF4444",
  "#8B5CF6",
  "#F97316",
  "#14B8A6",
  "#EC4899",
  "#22D3EE",
  "#6366F1",
];

function normaliseTickers(input: string | null): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value, index, self) => value && self.indexOf(value) === index);
}

function isWithinRange(date: string, start: string, end: string): boolean {
  if (!start && !end) return true;
  const ts = Date.parse(date);
  if (Number.isNaN(ts)) return false;
  if (start) {
    const startTs = Date.parse(start);
    if (!Number.isNaN(startTs) && ts < startTs) return false;
  }
  if (end) {
    const endTs = Date.parse(end);
    if (!Number.isNaN(endTs) && ts > endTs) return false;
  }
  return true;
}

type StrategyUrlInput = {
  tickers: string[];
  indicatorParams: string[];
  dateRange: { start: string; end: string };
};

export function buildStrategyUrl({ tickers, indicatorParams, dateRange }: StrategyUrlInput): string {
  if (!tickers.length) {
    return "/strategy";
  }

  const params = new URLSearchParams();
  params.set("tickers", tickers.join(","));
  if (indicatorParams.length) {
    params.set("indicators", indicatorParams.join(","));
  }
  if (dateRange.start) params.set("start", dateRange.start);
  if (dateRange.end) params.set("end", dateRange.end);

  const query = params.toString();
  return query ? `/strategy?${query}` : "/strategy";
}

export function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initialisedFromParams, setInitialisedFromParams] = useState(false);

  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, PriceRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [availableRange, setAvailableRange] = useState({ start: "", end: "" });
  const [userRangeOverride, setUserRangeOverride] = useState(false);
  const [showSMA, setShowSMA] = useState(false);
  const [showEMA, setShowEMA] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [smaPeriod, setSmaPeriod] = useState(50);
  const [emaPeriod, setEmaPeriod] = useState(20);
  const previousTickersRef = useRef<string[]>([]);

  const handleSelectionChange = useCallback((tickers: string[]) => {
    const unique = Array.from(
      new Set(
        tickers
          .map((value) => value.trim().toUpperCase())
          .filter((value) => value.length > 0),
      ),
    );
    setSelectedTickers(unique);
  }, []);

  useEffect(() => {
    if (initialisedFromParams) return;
    const tickersFromParams = normaliseTickers(searchParams.get("tickers") ?? searchParams.get("ticker"));
    if (tickersFromParams.length) {
      handleSelectionChange(tickersFromParams);
    }
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    if (startParam || endParam) {
      setDateRange({ start: startParam ?? "", end: endParam ?? "" });
    }
    setInitialisedFromParams(true);
  }, [searchParams, initialisedFromParams, handleSelectionChange]);

  useEffect(() => {
    if (!selectedTickers.length) {
      setRawData({});
      setAvailableRange({ start: "", end: "" });
      setDateRange({ start: "", end: "" });
      setUserRangeOverride(false);
      previousTickersRef.current = [];
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const responses = await Promise.all(
          selectedTickers.map(async (ticker) => {
            const response = await fetch(`/api/local-data?ticker=${ticker}`);
            if (!response.ok) {
              throw new Error(`Failed to load data for ${ticker}`);
            }
            const result = await response.json();
            return { ticker, rows: Array.isArray(result.rows) ? (result.rows as PriceRow[]) : [] };
          }),
        );

        if (cancelled) return;

        const dataMap: Record<string, PriceRow[]> = {};
        let minDate: string | null = null;
        let maxDate: string | null = null;

        for (const { ticker, rows } of responses) {
          dataMap[ticker] = rows;
          if (rows.length) {
            const first = rows[0].date;
            const last = rows[rows.length - 1].date;
            if (!minDate || first < minDate) minDate = first;
            if (!maxDate || last > maxDate) maxDate = last;
          }
        }

        setRawData(dataMap);
        if (minDate && maxDate) {
          const nextRange = { start: minDate, end: maxDate };
          setAvailableRange(nextRange);
          const hadNoPrevious = previousTickersRef.current.length === 0;
          if (!userRangeOverride || hadNoPrevious) {
            setDateRange(nextRange);
            setUserRangeOverride(false);
          }
        } else {
          setAvailableRange({ start: "", end: "" });
          setDateRange({ start: "", end: "" });
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch price data", err);
        setError(err instanceof Error ? err.message : String(err));
        setRawData({});
        setAvailableRange({ start: "", end: "" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    previousTickersRef.current = selectedTickers;

    return () => {
      cancelled = true;
    };
  }, [selectedTickers, userRangeOverride]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    selectedTickers.forEach((ticker, index) => {
      map[ticker] = COLORS[index % COLORS.length];
    });
    return map;
  }, [selectedTickers]);

  const { priceData, rsiData, macdData, latestSnapshots } = useMemo(() => {
    const priceEntries = new Map<string, CombinedPoint>();
    const rsiEntries = new Map<string, CombinedPoint>();
    const macdEntries = new Map<string, CombinedPoint>();
    const latest: Record<string, PriceRow | null> = {};

    for (const ticker of selectedTickers) {
      const rows = rawData[ticker] ?? [];
      if (!rows.length) {
        latest[ticker] = null;
        continue;
      }

      const closes = rows.map((row) => row.close);
      const smaSeries = showSMA ? SMA(closes, Math.max(1, smaPeriod)) : null;
      const emaSeries = showEMA ? EMA(closes, Math.max(1, emaPeriod)) : null;
      const rsiSeries = showRSI ? RSI(closes, 14) : null;
      const macdSeries = showMACD ? MACD(closes) : null;

      const filteredRows = rows.filter((row) => isWithinRange(row.date, dateRange.start, dateRange.end));
      latest[ticker] = filteredRows.length ? filteredRows[filteredRows.length - 1] : rows[rows.length - 1];

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (!isWithinRange(row.date, dateRange.start, dateRange.end)) continue;

        const ensureEntry = (map: Map<string, CombinedPoint>) => {
          if (!map.has(row.date)) {
            map.set(row.date, { date: row.date });
          }
          return map.get(row.date)!;
        };

        const priceEntry = ensureEntry(priceEntries);
        priceEntry[ticker] = row.close;

        if (smaSeries && Number.isFinite(smaSeries[index])) {
          priceEntry[`${ticker}_SMA`] = Number(smaSeries[index].toFixed(4));
        }
        if (emaSeries && Number.isFinite(emaSeries[index])) {
          priceEntry[`${ticker}_EMA`] = Number(emaSeries[index].toFixed(4));
        }
        if (rsiSeries && Number.isFinite(rsiSeries[index])) {
          const rsiEntry = ensureEntry(rsiEntries);
          rsiEntry[`${ticker}_RSI`] = Number(rsiSeries[index].toFixed(2));
        }
        if (macdSeries) {
          const macdValue = macdSeries.macd[index];
          const signalValue = macdSeries.signal[index];
          if (Number.isFinite(macdValue) || Number.isFinite(signalValue)) {
            const macdEntry = ensureEntry(macdEntries);
            if (Number.isFinite(macdValue)) {
              macdEntry[`${ticker}_MACD`] = Number(macdValue.toFixed(4));
            }
            if (Number.isFinite(signalValue)) {
              macdEntry[`${ticker}_MACD_SIGNAL`] = Number(signalValue.toFixed(4));
            }
          }
        }
      }
    }

    const sortEntries = (map: Map<string, CombinedPoint>) =>
      Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      priceData: sortEntries(priceEntries),
      rsiData: sortEntries(rsiEntries),
      macdData: sortEntries(macdEntries),
      latestSnapshots: latest,
    };
  }, [
    selectedTickers,
    rawData,
    dateRange.start,
    dateRange.end,
    showSMA,
    showEMA,
    showRSI,
    showMACD,
    smaPeriod,
    emaPeriod,
  ]);

  const handleDateRangeChange = (range: { start?: string; end?: string }) => {
    setUserRangeOverride(true);
    setDateRange((prev) => ({
      start: range.start ?? prev.start,
      end: range.end ?? prev.end,
    }));
  };

  const handleResetRange = () => {
    setUserRangeOverride(false);
    setDateRange(availableRange);
  };

  const indicatorConfig = {
    showSMA,
    showEMA,
    showRSI,
    showMACD,
    smaPeriod,
    emaPeriod,
    toggleSMA: () => setShowSMA((prev) => !prev),
    toggleEMA: () => setShowEMA((prev) => !prev),
    toggleRSI: () => setShowRSI((prev) => !prev),
    toggleMACD: () => setShowMACD((prev) => !prev),
    changeSmaPeriod: (period: number) => setSmaPeriod(Math.max(1, period)),
    changeEmaPeriod: (period: number) => setEmaPeriod(Math.max(1, period)),
  };

  const indicatorParams: string[] = [];
  if (showSMA) indicatorParams.push(`SMA${smaPeriod}`);
  if (showEMA) indicatorParams.push(`EMA${emaPeriod}`);
  if (showRSI) indicatorParams.push("RSI");
  if (showMACD) indicatorParams.push("MACD");

  const strategyUrl = buildStrategyUrl({ tickers: selectedTickers, indicatorParams, dateRange });

  const handleCreateStrategy = () => {
    if (!selectedTickers.length) return;
    router.push(strategyUrl);
  };

  return (
    <main className="min-h-screen bg-gray-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400">
            Compare multiple tickers, layer indicators, and hand off directly to the Strategy Lab.
          </p>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="flex w-full flex-col gap-4 lg:w-80 lg:flex-shrink-0">
            <TickerSelector selectedTickers={selectedTickers} onSelectionChange={handleSelectionChange} />

            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm text-gray-300">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-white font-semibold">Quick Actions</span>
                <span className="text-xs text-gray-500">Tools</span>
              </div>
              <div className="space-y-2">
                <Link
                  href="/backtester"
                  className="block rounded-md bg-green-600/80 px-3 py-2 text-left text-white transition-colors hover:bg-green-600"
                >
                  → Test Trading Strategy
                </Link>
                <Link
                  href="/data"
                  className="block rounded-md bg-purple-600/80 px-3 py-2 text-left text-white transition-colors hover:bg-purple-600"
                >
                  → Explore Data
                </Link>
              </div>
            </div>
          </aside>

          <section className="flex-1 space-y-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Visual Analysis</h2>
              <p className="text-sm text-gray-400">
                Toggle indicators to reveal trends. Reset the range to jump back to the full history at any time.
              </p>
            </div>

            <PriceChart
              tickers={selectedTickers}
              loading={loading}
              error={error}
              priceData={priceData}
              rsiData={rsiData}
              macdData={macdData}
              dateRange={dateRange}
              availableRange={availableRange}
              onDateRangeChange={handleDateRangeChange}
              onResetDateRange={handleResetRange}
              indicatorConfig={indicatorConfig}
              colorMap={colorMap}
              latestSnapshots={latestSnapshots}
            />

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
              <button
                type="button"
                onClick={handleCreateStrategy}
                disabled={!selectedTickers.length}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
              >
                Create a strategy with this
              </button>
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-4 text-gray-300">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
                <span>Data Source: S3 Manifest</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                <span>API Status: Active</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-yellow-400" aria-hidden />
                <span>Indicators: {indicatorParams.length ? indicatorParams.join(", ") : "None selected"}</span>
              </div>
            </div>
            <div className="text-gray-400">Last Updated: {new Date().toLocaleString()}</div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return <DashboardInner />;
}
