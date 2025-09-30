"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { ema, macd, rsi, sma } from "./indicators";

interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceChartProps {
  tickers: string[];
  dateRange?: { start?: string; end?: string };
  indicators?: { rsi?: boolean; macd?: boolean; sma?: boolean; ema?: boolean };
}

interface ChartPoint {
  date: string;
  [key: string]: string | number | null | undefined;
}

type DerivedState = {
  pricePoints: ChartPoint[];
  rsiPoints: ChartPoint[];
  macdPoints: ChartPoint[];
  tickerSummaries: Array<{
    ticker: string;
    latestClose?: number;
    latestDate?: string;
    firstDate?: string;
    changePct?: number;
    hasData: boolean;
  }>;
  missingTickers: string[];
  buildError: string | null;
};

function normalizePriceRows(rows: unknown): PriceRow[] {
  if (!Array.isArray(rows)) return [];
  const normalized: PriceRow[] = [];

  for (const raw of rows) {
    if (!raw) continue;
    const record = raw as Record<string, unknown>;
    const date = typeof record.date === "string" ? record.date : undefined;
    const open = Number(record.open);
    const high = Number(record.high);
    const low = Number(record.low);
    const close = Number(record.close);
    const volumeValue = Number(record.volume);

    if (!date || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      continue;
    }

    normalized.push({
      ...(record as PriceRow),
      date,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volumeValue) ? volumeValue : 0,
    });
  }

  return normalized.sort((a, b) => a.date.localeCompare(b.date));
}

const SERIES_COLORS = [
  "#60A5FA",
  "#F97316",
  "#34D399",
  "#F472B6",
  "#A855F7",
  "#FACC15",
  "#38BDF8",
  "#F87171",
];

const PRICE_TOOLTIP_STYLE = {
  backgroundColor: "#1F2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#F9FAFB",
  fontSize: "0.875rem",
};

const LABEL_DATE_FORMATTER = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

export function PriceChart({ tickers, dateRange, indicators }: PriceChartProps) {
  const indicatorState = useMemo(
    () => ({
      rsi: indicators?.rsi ?? false,
      macd: indicators?.macd ?? false,
      sma: indicators?.sma ?? false,
      ema: indicators?.ema ?? false,
    }),
    [indicators],
  );
  const normalizedTickers = useMemo(
    () =>
      Array.from(new Set(tickers.map((ticker) => ticker.toUpperCase()))).filter(
        Boolean,
      ),
    [tickers],
  );

  const [seriesMap, setSeriesMap] = useState<Record<string, PriceRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!normalizedTickers.length) {
      setSeriesMap({});
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        if (normalizedTickers.length === 1) {
          const ticker = normalizedTickers[0];
          const params = new URLSearchParams({ ticker });
          if (dateRange?.start) params.set("start", dateRange.start);
          if (dateRange?.end) params.set("end", dateRange.end);
          const response = await fetch(`/api/local-data?${params.toString()}`, { signal });
          const json = await response.json();
          if (!json.ok || !Array.isArray(json.rows)) {
            throw new Error(json.error || "Failed to load data");
          }
          setSeriesMap({ [ticker]: normalizePriceRows(json.rows) });
          return;
        }

        const response = await fetch("/api/local-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tickers: normalizedTickers,
            startDate: dateRange?.start,
            endDate: dateRange?.end,
          }),
          signal,
        });
        const json = await response.json();
        if (!json.ok || !Array.isArray(json.data)) {
          throw new Error(json.error || "Failed to load data");
        }
        const mapped: Record<string, PriceRow[]> = {};
        for (const item of json.data) {
          if (!item || typeof item.ticker !== "string") continue;
          mapped[item.ticker.toUpperCase()] = normalizePriceRows(item.bars);
        }
        for (const ticker of normalizedTickers) {
          if (!mapped[ticker]) {
            mapped[ticker] = [];
          }
        }
        setSeriesMap(mapped);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("Error loading chart data", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
        setSeriesMap({});
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => controller.abort();
  }, [normalizedTickers, dateRange?.start, dateRange?.end]);

  const derived = useMemo<DerivedState>(() => {
    try {
      const pricePoints: ChartPoint[] = [];
      const rsiPoints: ChartPoint[] = [];
      const macdPoints: ChartPoint[] = [];
      const tickerSummaries: DerivedState["tickerSummaries"] = [];
      const missingTickers: string[] = [];

      if (!normalizedTickers.length) {
        return {
          pricePoints,
          rsiPoints,
          macdPoints,
          tickerSummaries,
          missingTickers,
          buildError: null,
        };
      }

      const allDates = new Set<string>();
      for (const ticker of normalizedTickers) {
        const rows = seriesMap[ticker];
        if (!rows || rows.length === 0) {
          tickerSummaries.push({ ticker, hasData: false });
          missingTickers.push(ticker);
          continue;
        }
        rows.forEach((row) => {
          if (row?.date) {
            allDates.add(row.date);
          }
        });
      }

      const sortedDates = Array.from(allDates).sort();
      pricePoints.push(...sortedDates.map((date) => ({ date })));
      if (indicatorState.rsi) {
        rsiPoints.push(...sortedDates.map((date) => ({ date })));
      }
      if (indicatorState.macd) {
        macdPoints.push(...sortedDates.map((date) => ({ date })));
      }

      const priceLookup = new Map(pricePoints.map((point) => [point.date, point]));
      const rsiLookup = new Map(rsiPoints.map((point) => [point.date, point]));
      const macdLookup = new Map(macdPoints.map((point) => [point.date, point]));

      for (const ticker of normalizedTickers) {
        const rows = seriesMap[ticker];
        if (!rows || rows.length === 0) continue;

        const closes = rows.map((row) => (Number.isFinite(row.close) ? row.close : NaN));
        const smaValues = indicatorState.sma ? sma(closes, 20) : [];
        const emaValues = indicatorState.ema ? ema(closes, 50) : [];
        const rsiValues = indicatorState.rsi ? rsi(closes) : [];
        const macdValues = indicatorState.macd ? macd(closes) : undefined;

        const firstRow = rows[0];
        const lastRow = rows[rows.length - 1];
        const changePct =
          firstRow && lastRow && Number.isFinite(firstRow.close) && firstRow.close !== 0
            ? ((lastRow.close - firstRow.close) / firstRow.close) * 100
            : undefined;
        tickerSummaries.push({
          ticker,
          firstDate: firstRow?.date,
          latestClose: lastRow?.close,
          latestDate: lastRow?.date,
          changePct,
          hasData: true,
        });

        rows.forEach((row, index) => {
          const base = priceLookup.get(row.date);
          if (base) {
            base[ticker] = Number.isFinite(row.close) ? row.close : null;
            if (indicatorState.sma && smaValues[index] != null) {
              base[`${ticker}_SMA20`] = smaValues[index];
            }
            if (indicatorState.ema && emaValues[index] != null) {
              base[`${ticker}_EMA50`] = emaValues[index];
            }
          }
          if (indicatorState.rsi && rsiValues[index] != null) {
            const target = rsiLookup.get(row.date);
            if (target) {
              target[`${ticker}_RSI`] = rsiValues[index];
            }
          }
          if (indicatorState.macd && macdValues) {
            const macdPoint = macdLookup.get(row.date);
            if (macdPoint) {
              const macdValue = macdValues.macd[index];
              const signalValue = macdValues.signal[index];
              if (macdValue != null) macdPoint[`${ticker}_MACD`] = macdValue;
              if (signalValue != null) macdPoint[`${ticker}_SIGNAL`] = signalValue;
            }
          }
        });
      }

      const hasRsi = indicatorState.rsi
        ? rsiPoints.some((point) =>
            normalizedTickers.some((ticker) => point[`${ticker}_RSI`] != null),
          )
        : false;
      const hasMacd = indicatorState.macd
        ? macdPoints.some((point) =>
            normalizedTickers.some(
              (ticker) =>
                point[`${ticker}_MACD`] != null || point[`${ticker}_SIGNAL`] != null,
            ),
          )
        : false;

      return {
        pricePoints,
        rsiPoints: hasRsi ? rsiPoints : [],
        macdPoints: hasMacd ? macdPoints : [],
        tickerSummaries,
        missingTickers,
        buildError: null,
      };
    } catch (err) {
      console.error("Failed to derive chart data", err);
      return {
        pricePoints: [],
        rsiPoints: [],
        macdPoints: [],
        tickerSummaries: normalizedTickers.map((ticker) => ({ ticker, hasData: false })),
        missingTickers: normalizedTickers,
        buildError:
          err instanceof Error
            ? err.message
            : "Unknown error while building chart data.",
      };
    }
  }, [seriesMap, normalizedTickers, indicatorState]);

  if (!normalizedTickers.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/60 p-10 text-center text-gray-400">
        Choose at least one ticker to render the chart.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300">
        Loading price data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-red-700/60 bg-red-900/30 px-4 text-center text-sm text-red-200">
        {error}
      </div>
    );
  }

  const colors = normalizedTickers.reduce<Record<string, string>>((accumulator, ticker, index) => {
    accumulator[ticker] = SERIES_COLORS[index % SERIES_COLORS.length];
    return accumulator;
  }, {});

  const hasPriceData = derived.pricePoints.some((point) =>
    normalizedTickers.some((ticker) => {
      const value = point[ticker];
      return typeof value === "number" && Number.isFinite(value);
    }),
  );

  return (
    <div className="space-y-6 rounded-lg border border-gray-700 bg-gray-800 p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {derived.tickerSummaries.map((summary) => (
          <div
            key={summary.ticker}
            className="flex items-center justify-between rounded-md bg-gray-900/50 px-4 py-3 text-sm text-gray-200"
          >
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                {(summary.firstDate ?? "—").toString()} → {(summary.latestDate ?? "—").toString()}
              </div>
              <div className="text-lg font-semibold text-white">
                {summary.ticker}
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-semibold text-blue-200">
                {summary.latestClose != null ? `$${summary.latestClose.toFixed(2)}` : "—"}
              </div>
              <div
                className={
                  summary.hasData
                    ? summary.changePct != null
                      ? summary.changePct >= 0
                        ? "text-xs font-medium text-emerald-400"
                        : "text-xs font-medium text-red-400"
                      : "text-xs text-gray-500"
                    : "text-xs text-gray-500"
                }
              >
                {summary.hasData
                  ? summary.changePct != null
                    ? `${summary.changePct >= 0 ? "+" : ""}${summary.changePct.toFixed(2)}%`
                    : "No change data"
                  : "No local data"}
              </div>
            </div>
          </div>
        ))}
      </div>

      {derived.buildError && (
        <div className="rounded-md border border-red-700/50 bg-red-900/20 p-3 text-xs text-red-200">
          Unable to render the full chart for the selected tickers. {derived.buildError}
        </div>
      )}

      {derived.missingTickers.length > 0 && (
        <div className="rounded-md border border-amber-600/40 bg-amber-900/20 p-3 text-xs text-amber-200">
          Some selections have no local data in the chosen range: {derived.missingTickers.join(", ")}
        </div>
      )}

      {hasPriceData ? (
        <div className="space-y-6">
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={derived.pricePoints} margin={{ left: 12, right: 16, bottom: 12 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" tickFormatter={LABEL_DATE_FORMATTER} fontSize={12} minTickGap={24} />
                <YAxis
                  stroke="#9CA3AF"
                  tickFormatter={(value: number) => `$${value.toFixed(2)}`}
                  fontSize={12}
                  width={70}
                />
                <Tooltip
                  contentStyle={PRICE_TOOLTIP_STYLE}
                  labelFormatter={LABEL_DATE_FORMATTER}
                  formatter={(rawValue: number | string, name) => {
                    const value = Number(rawValue);
                    if (!Number.isFinite(value)) return ["—", name];
                    if (typeof name === "string" && name.includes("RSI")) {
                      return [value.toFixed(2), name];
                    }
                    return [`$${value.toFixed(2)}`, name];
                  }}
                />
                <Legend wrapperStyle={{ color: "#E5E7EB" }} />
                {normalizedTickers.map((ticker) => {
                  if (!seriesMap[ticker]?.length) return null;
                  return (
                    <Line
                      key={ticker}
                      type="monotone"
                      dataKey={ticker}
                      name={`${ticker} Close`}
                      stroke={colors[ticker]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  );
                })}
                {indicatorState.sma &&
                  normalizedTickers.map((ticker) => {
                    if (!seriesMap[ticker]?.length) return null;
                    return (
                      <Line
                        key={`${ticker}-sma`}
                        type="monotone"
                        dataKey={`${ticker}_SMA20`}
                        name={`${ticker} SMA(20)`}
                        stroke={colors[ticker]}
                        strokeDasharray="6 2"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                        opacity={0.9}
                      />
                    );
                  })}
                {indicatorState.ema &&
                  normalizedTickers.map((ticker) => {
                    if (!seriesMap[ticker]?.length) return null;
                    return (
                      <Line
                        key={`${ticker}-ema`}
                        type="monotone"
                        dataKey={`${ticker}_EMA50`}
                        name={`${ticker} EMA(50)`}
                        stroke={colors[ticker]}
                        strokeDasharray="3 3"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                        opacity={0.75}
                      />
                    );
                  })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {indicatorState.rsi && derived.rsiPoints.length > 0 && (
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={derived.rsiPoints} margin={{ left: 12, right: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" tickFormatter={LABEL_DATE_FORMATTER} fontSize={11} minTickGap={24} />
                  <YAxis domain={[0, 100]} stroke="#9CA3AF" fontSize={11} width={40} />
                  <Tooltip
                    contentStyle={PRICE_TOOLTIP_STYLE}
                    labelFormatter={LABEL_DATE_FORMATTER}
                    formatter={(rawValue: number | string, name) => {
                      const value = Number(rawValue);
                      if (!Number.isFinite(value)) return ["—", name];
                      return [value.toFixed(2), name];
                    }}
                  />
                  <Legend wrapperStyle={{ color: "#E5E7EB" }} />
                  <ReferenceLine y={30} stroke="#F97316" strokeDasharray="4 4" />
                  <ReferenceLine y={70} stroke="#F97316" strokeDasharray="4 4" />
                  {normalizedTickers.map((ticker) => {
                    if (!seriesMap[ticker]?.length) return null;
                    return (
                      <Line
                        key={`${ticker}-rsi`}
                        type="monotone"
                        dataKey={`${ticker}_RSI`}
                        name={`${ticker} RSI(14)`}
                        stroke={colors[ticker]}
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {indicatorState.macd && derived.macdPoints.length > 0 && (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={derived.macdPoints} margin={{ left: 12, right: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" tickFormatter={LABEL_DATE_FORMATTER} fontSize={11} minTickGap={24} />
                  <YAxis stroke="#9CA3AF" fontSize={11} width={50} />
                  <Tooltip
                    contentStyle={PRICE_TOOLTIP_STYLE}
                    labelFormatter={LABEL_DATE_FORMATTER}
                    formatter={(rawValue: number | string, name) => {
                      const value = Number(rawValue);
                      if (!Number.isFinite(value)) return ["—", name];
                      return [value.toFixed(3), name];
                    }}
                  />
                  <Legend wrapperStyle={{ color: "#E5E7EB" }} />
                  <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="2 3" />
                  {normalizedTickers.map((ticker) => {
                    if (!seriesMap[ticker]?.length) return null;
                    return (
                      <Line
                        key={`${ticker}-macd`}
                        type="monotone"
                        dataKey={`${ticker}_MACD`}
                        name={`${ticker} MACD`}
                        stroke={colors[ticker]}
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                      />
                    );
                  })}
                  {normalizedTickers.map((ticker) => {
                    if (!seriesMap[ticker]?.length) return null;
                    return (
                      <Line
                        key={`${ticker}-macd-signal`}
                        type="monotone"
                        dataKey={`${ticker}_SIGNAL`}
                        name={`${ticker} Signal`}
                        stroke={colors[ticker]}
                        strokeDasharray="5 3"
                        strokeWidth={1.2}
                        dot={false}
                        connectNulls
                        opacity={0.7}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-900/60 text-sm text-gray-400">
          No price data available for the selected range.
        </div>
      )}
    </div>
  );
}
