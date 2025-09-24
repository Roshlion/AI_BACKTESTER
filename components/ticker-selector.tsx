"use client";

import { useState, useEffect } from "react";

interface TickerInfo {
  ticker: string;
  format?: string;
  records?: number;
  firstDate?: string;
  lastDate?: string;
}

interface TickerSelectorProps {
  onTickerSelect: (ticker: string) => void;
  selectedTicker?: string;
}

export function TickerSelector({ onTickerSelect, selectedTicker }: TickerSelectorProps) {
  const [tickers, setTickers] = useState<TickerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadTickers() {
      try {
        const response = await fetch("/api/index");
        const data = await response.json();

        if (data.tickers) {
          const tickerList = Array.isArray(data.tickers)
            ? data.tickers.map((t: any) => typeof t === "string" ? { ticker: t } : t)
            : [];
          setTickers(tickerList);
        }
      } catch (err) {
        setError("Failed to load tickers");
        console.error("Error loading tickers:", err);
      } finally {
        setLoading(false);
      }
    }

    loadTickers();
  }, []);

  const filteredTickers = tickers.filter(ticker =>
    ticker.ticker.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg">
        <p className="text-gray-400">Loading tickers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/60 rounded-lg">
        <p className="text-red-200">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <h3 className="text-lg sm:text-xl font-semibold text-white">
        Available Tickers ({tickers.length})
      </h3>

      <input
        type="text"
        placeholder="Search tickers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 text-base sm:text-sm focus:outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
      />

      <div className="max-h-64 overflow-y-auto">
        {filteredTickers.length === 0 ? (
          <p className="text-gray-400">No tickers found</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredTickers.map((ticker) => (
              <button
                key={ticker.ticker}
                onClick={() => onTickerSelect(ticker.ticker)}
                className={`w-full text-left px-3 py-3 sm:py-2 rounded transition-colors text-sm sm:text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  selectedTicker === ticker.ticker
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{ticker.ticker}</span>
                  {ticker.records && (
                    <span className="text-xs sm:text-sm text-gray-400">
                      {ticker.records.toLocaleString()} records
                    </span>
                  )}
                </div>
                {ticker.lastDate && (
                  <div className="text-xs sm:text-sm text-gray-400 mt-1">
                    Latest: {ticker.lastDate}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}