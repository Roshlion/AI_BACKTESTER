"use client";

import { useState, useEffect, type MouseEvent } from "react";
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

interface ChartPoint {
  date: string;
  [key: string]: number | string | null;
}

interface LatestSnapshot {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorConfig {
  showSMA: boolean;
  showEMA: boolean;
  showRSI: boolean;
  showMACD: boolean;
  smaPeriod: number;
  emaPeriod: number;
  toggleSMA: () => void;
  toggleEMA: () => void;
  toggleRSI: () => void;
  toggleMACD: () => void;
  changeSmaPeriod: (period: number) => void;
  changeEmaPeriod: (period: number) => void;
}

interface PriceChartProps {
  tickers: string[];
  loading: boolean;
  error: string | null;
  priceData: ChartPoint[];
  rsiData: ChartPoint[];
  macdData: ChartPoint[];
  dateRange: { start: string; end: string };
  availableRange: { start: string; end: string };
  onDateRangeChange: (range: { start?: string; end?: string }) => void;
  onResetDateRange: () => void;
  indicatorConfig: IndicatorConfig;
  colorMap: Record<string, string>;
  latestSnapshots: Record<string, LatestSnapshot | null>;
}

function formatCurrency(value: number | string | null): string {
  if (value === null) return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return `$${num.toFixed(2)}`;
}

function IndicatorToggle({
  label,
  checked,
  onToggle,
  period,
  onPeriodChange,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  period?: number;
  onPeriodChange?: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(period ? String(period) : "");

  useEffect(() => {
    if (period) {
      setDraft(String(period));
    }
  }, [period]);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) return;
    onToggle();
  };

  const handleDoubleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!onPeriodChange) return;
    event.preventDefault();
    event.stopPropagation();
    setDraft(period ? String(period) : "");
    setEditing(true);
  };

  const commit = () => {
    if (!onPeriodChange) {
      setEditing(false);
      return;
    }
    const value = Number(draft);
    if (Number.isFinite(value) && value > 0) {
      onPeriodChange(Math.round(value));
    }
    setEditing(false);
  };

  return (
    <div className={`relative inline-flex items-center`}>
      <button
        type="button"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={`px-3 py-1 rounded-full border text-sm transition-colors ${
          checked ? "bg-blue-600/80 border-blue-400 text-white" : "bg-gray-700 border-gray-500 text-gray-200 hover:bg-gray-600"
        }`}
      >
        <span className="font-medium">{label}</span>
        {typeof period === "number" && !editing && (
          <span className="ml-1 text-xs text-gray-200/80">({period})</span>
        )}
      </button>
      {editing && onPeriodChange && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-gray-900 border border-blue-500 rounded-lg p-2 shadow-xl z-10">
          <div className="text-xs text-gray-300 mb-1">Set period</div>
          <input
            type="number"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setEditing(false);
              }
            }}
            min={1}
            className="w-20 px-2 py-1 bg-gray-800 border border-blue-500 rounded text-white text-sm focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

export function PriceChart({
  tickers,
  loading,
  error,
  priceData,
  rsiData,
  macdData,
  dateRange,
  availableRange,
  onDateRangeChange,
  onResetDateRange,
  indicatorConfig,
  colorMap,
  latestSnapshots,
}: PriceChartProps) {
  const {
    showSMA,
    showEMA,
    showRSI,
    showMACD,
    smaPeriod,
    emaPeriod,
    toggleSMA,
    toggleEMA,
    toggleRSI,
    toggleMACD,
    changeSmaPeriod,
    changeEmaPeriod,
  } = indicatorConfig;

  const hasSelection = tickers.length > 0;
  const hasPriceData = priceData.length > 0;

  return (
    <div className="bg-gray-800 rounded-lg p-5 space-y-6 border border-gray-700">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Price &amp; Indicator View</h3>
          {hasSelection ? (
            <p className="text-sm text-gray-400 mt-1">
              Comparing {tickers.join(", ")} over {dateRange.start || "?"} to {dateRange.end || "?"}.
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-1">Select one or more tickers to view their performance.</p>
          )}
          {availableRange.start && availableRange.end && (
            <p className="text-xs text-gray-500 mt-1">
              Available data span: {availableRange.start} to {availableRange.end}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(event) => onDateRangeChange({ start: event.target.value })}
              className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">End Date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(event) => onDateRangeChange({ end: event.target.value })}
              className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={onResetDateRange}
            className="h-9 px-3 rounded border border-blue-500 text-blue-200 text-sm hover:bg-blue-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!availableRange.start || (!dateRange.start && !dateRange.end)}
          >
            Reset range
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <IndicatorToggle label="SMA" checked={showSMA} onToggle={toggleSMA} period={smaPeriod} onPeriodChange={changeSmaPeriod} />
        <IndicatorToggle label="EMA" checked={showEMA} onToggle={toggleEMA} period={emaPeriod} onPeriodChange={changeEmaPeriod} />
        <IndicatorToggle label="RSI" checked={showRSI} onToggle={toggleRSI} />
        <IndicatorToggle label="MACD" checked={showMACD} onToggle={toggleMACD} />
        <span className="text-xs text-gray-500">Double-click SMA/EMA to adjust periods.</span>
      </div>

      {loading && (
        <div className="h-72 flex items-center justify-center bg-gray-900/60 rounded-lg border border-gray-700">
          <p className="text-gray-400">Loading chart data…</p>
        </div>
      )}

      {error && !loading && (
        <div className="h-72 flex items-center justify-center bg-red-900/30 rounded-lg border border-red-700/60">
          <p className="text-red-200">Error: {error}</p>
        </div>
      )}

      {!loading && !error && (!hasSelection || !hasPriceData) && (
        <div className="h-72 flex items-center justify-center bg-gray-900/60 rounded-lg border border-gray-700 text-center">
          <div>
            <h4 className="text-lg font-semibold text-white mb-2">No data to display</h4>
            <p className="text-sm text-gray-400">
              {hasSelection
                ? "Adjust the date range or try a different combination of tickers."
                : "Choose at least one ticker from the list to render charts."}
            </p>
          </div>
        </div>
      )}

      {!loading && !error && hasPriceData && (
        <div className="space-y-8">
          <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
            <h4 className="text-sm font-semibold text-gray-200 mb-3">Price &amp; Moving Averages</h4>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={priceData} margin={{ top: 10, bottom: 10, left: 0, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={(value) => `$${Number(value).toFixed(2)}`}
                />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value: any, name: string) => {
                    if (name.toLowerCase().includes("rsi")) {
                      return [`${Number(value).toFixed(2)}`, name];
                    }
                    if (name.toLowerCase().includes("macd")) {
                      return [`${Number(value).toFixed(4)}`, name];
                    }
                    return [formatCurrency(value), name];
                  }}
                  contentStyle={{
                    backgroundColor: "#111827",
                    borderRadius: "8px",
                    border: "1px solid #1F2937",
                    color: "#F9FAFB",
                    fontSize: "12px",
                  }}
                />
                <Legend />
                {tickers.map((ticker) => (
                  <Line
                    key={ticker}
                    type="monotone"
                    dataKey={ticker}
                    name={`${ticker} Close`}
                    stroke={colorMap[ticker]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
                {showSMA &&
                  tickers.map((ticker) => (
                    <Line
                      key={`${ticker}-sma`}
                      type="monotone"
                      dataKey={`${ticker}_SMA`}
                      name={`${ticker} SMA(${smaPeriod})`}
                      stroke={colorMap[ticker]}
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                {showEMA &&
                  tickers.map((ticker) => (
                    <Line
                      key={`${ticker}-ema`}
                      type="monotone"
                      dataKey={`${ticker}_EMA`}
                      name={`${ticker} EMA(${emaPeriod})`}
                      stroke={colorMap[ticker]}
                      strokeDasharray="2 3"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {showRSI && rsiData.length > 0 && (
            <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-semibold text-gray-200 mb-3">Relative Strength Index</h4>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rsiData} margin={{ top: 10, bottom: 10, left: 0, right: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    stroke="#9CA3AF"
                    fontSize={12}
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis stroke="#9CA3AF" fontSize={12} domain={[0, 100]} />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    formatter={(value: any) => [`${Number(value).toFixed(2)}`, "RSI"]}
                    contentStyle={{
                      backgroundColor: "#111827",
                      borderRadius: "8px",
                      border: "1px solid #1F2937",
                      color: "#F9FAFB",
                      fontSize: "12px",
                    }}
                  />
                  <Legend />
                  <ReferenceLine y={30} stroke="#F87171" strokeDasharray="4 4" />
                  <ReferenceLine y={70} stroke="#34D399" strokeDasharray="4 4" />
                  {tickers.map((ticker) => (
                    <Line
                      key={`${ticker}-rsi`}
                      type="monotone"
                      dataKey={`${ticker}_RSI`}
                      name={`${ticker} RSI`}
                      stroke={colorMap[ticker]}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {showMACD && macdData.length > 0 && (
            <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-semibold text-gray-200 mb-3">MACD</h4>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={macdData} margin={{ top: 10, bottom: 10, left: 0, right: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    stroke="#9CA3AF"
                    fontSize={12}
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(value) => Number(value).toFixed(3)} />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    formatter={(value: any, name: string) => [`${Number(value).toFixed(4)}`, name]}
                    contentStyle={{
                      backgroundColor: "#111827",
                      borderRadius: "8px",
                      border: "1px solid #1F2937",
                      color: "#F9FAFB",
                      fontSize: "12px",
                    }}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="2 3" />
                  {tickers.map((ticker) => (
                    <Line
                      key={`${ticker}-macd`}
                      type="monotone"
                      dataKey={`${ticker}_MACD`}
                      name={`${ticker} MACD`}
                      stroke={colorMap[ticker]}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                  {tickers.map((ticker) => (
                    <Line
                      key={`${ticker}-macd-signal`}
                      type="monotone"
                      dataKey={`${ticker}_MACD_SIGNAL`}
                      name={`${ticker} Signal`}
                      stroke={colorMap[ticker]}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {Object.keys(latestSnapshots).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(latestSnapshots).map(([ticker, snapshot]) => {
                if (!snapshot) return null;
                return (
                  <div
                    key={ticker}
                    className="p-4 rounded-lg bg-gray-900/70 border border-gray-700 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-200">{ticker}</span>
                      <span className="text-xs text-gray-400">{snapshot.date}</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{formatCurrency(snapshot.close)}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                      <div>
                        <span className="block text-gray-500 uppercase tracking-wide">High</span>
                        <span className="text-green-300 font-medium">{formatCurrency(snapshot.high)}</span>
                      </div>
                      <div>
                        <span className="block text-gray-500 uppercase tracking-wide">Low</span>
                        <span className="text-red-300 font-medium">{formatCurrency(snapshot.low)}</span>
                      </div>
                      <div>
                        <span className="block text-gray-500 uppercase tracking-wide">Open</span>
                        <span className="text-gray-200 font-medium">{formatCurrency(snapshot.open)}</span>
                      </div>
                      <div>
                        <span className="block text-gray-500 uppercase tracking-wide">Volume</span>
                        <span className="text-gray-200 font-medium">{snapshot.volume.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
