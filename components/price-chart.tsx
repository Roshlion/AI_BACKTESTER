"use client";

import { useState, useEffect } from "react";
import { PriceLineChart } from "./ui/chart";

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceChartProps {
  ticker: string;
}

export function PriceChart({ ticker }: PriceChartProps) {
  const [data, setData] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    start: "",
    end: ""
  });

  useEffect(() => {
    if (!ticker) return;

    async function loadPriceData() {
      setLoading(true);
      setError(null);

      try {
        let url = `/api/local-data?ticker=${ticker}`;
        if (dateRange.start) url += `&start=${dateRange.start}`;
        if (dateRange.end) url += `&end=${dateRange.end}`;

        const response = await fetch(url);
        const result = await response.json();

        if (result.ok && result.rows) {
          setData(result.rows);
        } else {
          setError(result.error || "Failed to load data");
        }
      } catch (err) {
        setError("Failed to fetch price data");
        console.error("Error loading price data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPriceData();
  }, [ticker, dateRange.start, dateRange.end]);

  const latestPrice = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">
          {ticker} Price Chart
        </h3>
        {latestPrice && (
          <div className="text-right">
            <div className="text-xl font-bold text-white">
              ${latestPrice.close.toFixed(2)}
            </div>
            <div className="text-sm text-gray-400">
              {latestPrice.date}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 mb-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Start Date</label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">End Date</label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {loading && (
        <div className="h-64 flex items-center justify-center border rounded bg-gray-900">
          <p className="text-gray-400">Loading chart data...</p>
        </div>
      )}

      {error && (
        <div className="h-64 flex items-center justify-center border rounded bg-red-900/20">
          <p className="text-red-400">Error: {error}</p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <PriceLineChart data={data} />

          {latestPrice && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-700 rounded">
              <div>
                <div className="text-xs text-gray-400">Open</div>
                <div className="text-white font-medium">${latestPrice.open.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">High</div>
                <div className="text-green-400 font-medium">${latestPrice.high.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Low</div>
                <div className="text-red-400 font-medium">${latestPrice.low.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Volume</div>
                <div className="text-white font-medium">{latestPrice.volume.toLocaleString()}</div>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="h-64 flex items-center justify-center border rounded bg-gray-900">
          <p className="text-gray-400">No data available for {ticker}</p>
        </div>
      )}
    </div>
  );
}