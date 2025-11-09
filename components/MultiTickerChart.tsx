"use client";

import React, { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { getTickerColor } from "@/lib/colors";
import { largestTriangleThreeBuckets } from "@/lib/downsample";
import { SMA, EMA, RSI, MACD } from "@/lib/indicators";

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartData {
  date: string;
  [key: string]: any; // Dynamic ticker fields
}

interface MultiTickerChartProps {
  tickers: string[];
  indicators?: {
    sma: { enabled: boolean; period: number };
    ema: { enabled: boolean; period: number };
    rsi: { enabled: boolean };
    macd: { enabled: boolean };
  };
  dateRange?: { start?: string; end?: string };
}

type ScaleMode = "price" | "indexed" | "small-multiples";

export function MultiTickerChart({ tickers, indicators, dateRange }: MultiTickerChartProps) {
  const [tickerData, setTickerData] = useState<Record<string, PriceData[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scaleMode, setScaleMode] = useState<ScaleMode>("price");
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({});
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);
  const [showAllMultiples, setShowAllMultiples] = useState(false);

  // Initialize visibility for all tickers
  useEffect(() => {
    const initialVisibility: Record<string, boolean> = {};
    tickers.forEach(ticker => {
      initialVisibility[ticker] = true;
    });
    setVisibleSeries(initialVisibility);
  }, [tickers]);

  // Load data for all tickers
  useEffect(() => {
    if (tickers.length === 0) return;

    async function loadAllTickerData() {
      setLoading(true);
      setError(null);

      const dataPromises = tickers.map(async (ticker) => {
        try {
          let url = `/api/local-data?ticker=${ticker}`;
          if (dateRange?.start) url += `&start=${dateRange.start}`;
          if (dateRange?.end) url += `&end=${dateRange.end}`;

          const response = await fetch(url);
          const result = await response.json();

          if (result.ok && result.rows) {
            return { ticker, data: result.rows };
          } else {
            console.warn(`Failed to load data for ${ticker}:`, result.error);
            return { ticker, data: [] };
          }
        } catch (err) {
          console.error(`Error loading data for ${ticker}:`, err);
          return { ticker, data: [] };
        }
      });

      try {
        const results = await Promise.all(dataPromises);
        const newTickerData: Record<string, PriceData[]> = {};

        results.forEach(({ ticker, data }) => {
          newTickerData[ticker] = data;
        });

        setTickerData(newTickerData);
      } catch (err) {
        setError("Failed to load ticker data");
      } finally {
        setLoading(false);
      }
    }

    loadAllTickerData();
  }, [tickers, dateRange]);

  // Process chart data based on scale mode
  const chartData = useMemo(() => {
    if (Object.keys(tickerData).length === 0) return [];

    // Find all unique dates
    const allDates = new Set<string>();
    Object.values(tickerData).forEach(data => {
      data.forEach(row => allDates.add(row.date));
    });

    const sortedDates = Array.from(allDates).sort();

    // Build combined dataset
    const combined: ChartData[] = sortedDates.map(date => {
      const row: ChartData = { date };

      Object.entries(tickerData).forEach(([ticker, data]) => {
        const dayData = data.find(d => d.date === date);
        if (dayData) {
          if (scaleMode === "indexed") {
            // Normalize to first available price = 100
            const firstPrice = data.find(d => d.close > 0)?.close || 1;
            row[ticker] = (dayData.close / firstPrice) * 100;
          } else {
            row[ticker] = dayData.close;
          }

          // Add indicators if enabled
          if (indicators?.sma.enabled) {
            const smaValues = SMA(data.map(d => d.close), indicators.sma.period);
            const smaIndex = data.findIndex(d => d.date === date);
            if (smaIndex >= 0 && !isNaN(smaValues[smaIndex])) {
              if (scaleMode === "indexed") {
                const firstPrice = data.find(d => d.close > 0)?.close || 1;
                row[`${ticker}_SMA${indicators.sma.period}`] = (smaValues[smaIndex] / firstPrice) * 100;
              } else {
                row[`${ticker}_SMA${indicators.sma.period}`] = smaValues[smaIndex];
              }
            }
          }

          if (indicators?.ema.enabled) {
            const emaValues = EMA(data.map(d => d.close), indicators.ema.period);
            const emaIndex = data.findIndex(d => d.date === date);
            if (emaIndex >= 0 && !isNaN(emaValues[emaIndex])) {
              if (scaleMode === "indexed") {
                const firstPrice = data.find(d => d.close > 0)?.close || 1;
                row[`${ticker}_EMA${indicators.ema.period}`] = (emaValues[emaIndex] / firstPrice) * 100;
              } else {
                row[`${ticker}_EMA${indicators.ema.period}`] = emaValues[emaIndex];
              }
            }
          }
        }
      });

      return row;
    });

    // Downsample if too many points
    const maxPoints = 5000;
    if (combined.length > maxPoints) {
      // Simple thinning for now - could implement LTTB per series
      const step = Math.ceil(combined.length / maxPoints);
      return combined.filter((_, index) => index % step === 0);
    }

    return combined;
  }, [tickerData, scaleMode, indicators]);

  // RSI and MACD data (separate panels)
  const indicatorData = useMemo(() => {
    const rsiData: ChartData[] = [];
    const macdData: ChartData[] = [];

    if (indicators?.rsi.enabled || indicators?.macd.enabled) {
      const allDates = chartData.map(d => d.date);

      allDates.forEach(date => {
        const rsiRow: ChartData = { date };
        const macdRow: ChartData = { date };

        Object.entries(tickerData).forEach(([ticker, data]) => {
          if (indicators?.rsi.enabled) {
            const rsiValues = RSI(data.map(d => d.close), 14);
            const rsiIndex = data.findIndex(d => d.date === date);
            if (rsiIndex >= 0 && !isNaN(rsiValues[rsiIndex])) {
              rsiRow[`${ticker}_RSI`] = rsiValues[rsiIndex];
            }
          }

          if (indicators?.macd.enabled) {
            const macdResult = MACD(data.map(d => d.close));
            const macdIndex = data.findIndex(d => d.date === date);
            if (macdIndex >= 0) {
              if (!isNaN(macdResult.macd[macdIndex])) {
                macdRow[`${ticker}_MACD`] = macdResult.macd[macdIndex];
              }
              if (!isNaN(macdResult.signal[macdIndex])) {
                macdRow[`${ticker}_Signal`] = macdResult.signal[macdIndex];
              }
            }
          }
        });

        if (indicators?.rsi.enabled) rsiData.push(rsiRow);
        if (indicators?.macd.enabled) macdData.push(macdRow);
      });
    }

    return { rsiData, macdData };
  }, [tickerData, chartData, indicators]);

  const handleLegendClick = (dataKey: string) => {
    setVisibleSeries(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey]
    }));
  };

  const handleLegendMouseEnter = (dataKey: string) => {
    setHoveredSeries(dataKey);
  };

  const handleLegendMouseLeave = () => {
    setHoveredSeries(null);
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="h-64 flex items-center justify-center">
          <div className="text-gray-400">Loading chart data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="h-64 flex items-center justify-center">
          <div className="text-red-400">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="h-64 flex items-center justify-center">
          <div className="text-gray-400">No data available for selected tickers</div>
        </div>
      </div>
    );
  }

  if (scaleMode === "small-multiples") {
    const displayTickers = showAllMultiples ? tickers : tickers.slice(0, 6);
    const hiddenCount = tickers.length - displayTickers.length;

    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Multi-Ticker Chart (Small Multiples)</h3>
          <div className="flex items-center space-x-4">
            <select
              value={scaleMode}
              onChange={(e) => setScaleMode(e.target.value as ScaleMode)}
              className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="price">Price (Absolute)</option>
              <option value="indexed">Indexed %</option>
              <option value="small-multiples">Small Multiples</option>
            </select>
          </div>
        </div>

        {hiddenCount > 0 && !showAllMultiples && (
          <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded">
            <p className="text-blue-200 text-sm">
              Showing first 6 tickers. {hiddenCount} more available.
              <button
                onClick={() => setShowAllMultiples(true)}
                className="ml-2 text-blue-400 hover:text-blue-300 underline"
              >
                Show all
              </button>
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayTickers.map((ticker, index) => {
            const tickerChartData = chartData.map(d => ({
              date: d.date,
              value: d[ticker] || null
            })).filter(d => d.value !== null);

            return (
              <div key={ticker} className="bg-gray-700 rounded p-4">
                <h4 className="text-white font-medium mb-2">{ticker}</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={tickerChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      tickFormatter={(value) => new Date(value).toLocaleDateString()}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                      labelStyle={{ color: '#F3F4F6' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={getTickerColor(index)}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Multi-Ticker Chart</h3>
        <div className="flex items-center space-x-4">
          <label className="text-sm text-gray-300">Scale:</label>
          <select
            value={scaleMode}
            onChange={(e) => setScaleMode(e.target.value as ScaleMode)}
            className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="price">Price (Absolute)</option>
            <option value="indexed">Indexed %</option>
            <option value="small-multiples">Small Multiples</option>
          </select>
        </div>
      </div>

      {/* Main Price Chart */}
      <div className="mb-6">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#9CA3AF' }}
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis
              tick={{ fill: '#9CA3AF' }}
              label={{
                value: scaleMode === "indexed" ? "Indexed %" : "Price ($)",
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: '#9CA3AF' }
              }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
              labelStyle={{ color: '#F3F4F6' }}
              formatter={(value: any, name: string) => [
                typeof value === 'number' ? value.toFixed(2) : value,
                name
              ]}
            />
            <Legend
              onClick={(e) => handleLegendClick(e.dataKey as string)}
              onMouseEnter={(e) => handleLegendMouseEnter(e.dataKey as string)}
              onMouseLeave={handleLegendMouseLeave}
              wrapperStyle={{ cursor: 'pointer' }}
            />

            {/* Ticker price lines */}
            {tickers.map((ticker, index) => (
              <Line
                key={ticker}
                type="monotone"
                dataKey={ticker}
                stroke={getTickerColor(index)}
                strokeWidth={hoveredSeries === ticker ? 3 : visibleSeries[ticker] ? 2 : 0}
                strokeOpacity={hoveredSeries && hoveredSeries !== ticker ? 0.3 : 1}
                dot={false}
                hide={!visibleSeries[ticker]}
              />
            ))}

            {/* Indicator lines */}
            {indicators?.sma.enabled && tickers.map((ticker, index) => (
              <Line
                key={`${ticker}_SMA${indicators.sma.period}`}
                type="monotone"
                dataKey={`${ticker}_SMA${indicators.sma.period}`}
                stroke={getTickerColor(index)}
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                hide={!visibleSeries[ticker]}
              />
            ))}

            {indicators?.ema.enabled && tickers.map((ticker, index) => (
              <Line
                key={`${ticker}_EMA${indicators.ema.period}`}
                type="monotone"
                dataKey={`${ticker}_EMA${indicators.ema.period}`}
                stroke={getTickerColor(index)}
                strokeWidth={1}
                strokeDasharray="2 2"
                dot={false}
                hide={!visibleSeries[ticker]}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* RSI Panel */}
      {indicators?.rsi.enabled && (
        <div className="mb-6">
          <h4 className="text-white font-medium mb-2">RSI (14)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={indicatorData.rsiData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#9CA3AF' }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#F3F4F6' }}
              />

              {/* RSI reference lines */}
              <Line type="monotone" dataKey={() => 70} stroke="#EF4444" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey={() => 30} stroke="#10B981" strokeWidth={1} strokeDasharray="3 3" dot={false} />

              {tickers.map((ticker, index) => (
                <Line
                  key={`${ticker}_RSI`}
                  type="monotone"
                  dataKey={`${ticker}_RSI`}
                  stroke={getTickerColor(index)}
                  strokeWidth={1}
                  dot={false}
                  hide={!visibleSeries[ticker]}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* MACD Panel */}
      {indicators?.macd.enabled && (
        <div className="mb-6">
          <h4 className="text-white font-medium mb-2">MACD (12,26,9)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={indicatorData.macdData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis tick={{ fill: '#9CA3AF' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#F3F4F6' }}
              />

              {/* Zero line */}
              <Line type="monotone" dataKey={() => 0} stroke="#6B7280" strokeWidth={1} dot={false} />

              {tickers.map((ticker, index) => (
                <React.Fragment key={ticker}>
                  <Line
                    type="monotone"
                    dataKey={`${ticker}_MACD`}
                    stroke={getTickerColor(index)}
                    strokeWidth={1}
                    dot={false}
                    hide={!visibleSeries[ticker]}
                  />
                  <Line
                    type="monotone"
                    dataKey={`${ticker}_Signal`}
                    stroke={getTickerColor(index)}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    hide={!visibleSeries[ticker]}
                  />
                </React.Fragment>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}