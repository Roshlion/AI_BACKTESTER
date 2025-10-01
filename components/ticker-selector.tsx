"use client";

import { useState, useEffect, useMemo } from "react";

interface TickerInfo {
  ticker: string;
  format?: string;
  records?: number;
  firstDate?: string;
  lastDate?: string;
}

interface TickerSelectorProps {
  onSelectionChange: (tickers: string[]) => void;
  selectedTickers: string[];
}

function normaliseTicker(value: string): string {
  return value.trim().toUpperCase();
}

export function TickerSelector({ onSelectionChange, selectedTickers }: TickerSelectorProps) {
  const [tickers, setTickers] = useState<TickerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTickers() {
      try {
        const response = await fetch("/api/index");
        const data = await response.json();

        if (!cancelled && data.tickers) {
          const tickerList = Array.isArray(data.tickers)
            ? data.tickers.map((t: any) =>
                typeof t === "string"
                  ? { ticker: normaliseTicker(t) }
                  : { ...t, ticker: normaliseTicker(t.ticker ?? "") },
              )
            : [];
          setTickers(tickerList);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load tickers");
          console.error("Error loading tickers:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTickers();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTickers = useMemo(() => {
    if (!search.trim()) return tickers;
    const query = search.toLowerCase();
    return tickers.filter((ticker) => ticker.ticker.toLowerCase().includes(query));
  }, [tickers, search]);

  const handleToggle = (ticker: string, checked: boolean) => {
    const normalised = normaliseTicker(ticker);
    const currentSet = new Set(selectedTickers.map(normaliseTicker));

    if (checked) {
      currentSet.add(normalised);
    } else {
      currentSet.delete(normalised);
    }

    onSelectionChange(Array.from(currentSet));
  };

  const handleSelectOnly = (ticker: string) => {
    onSelectionChange([normaliseTicker(ticker)]);
  };

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

  const selectedSet = new Set(selectedTickers.map(normaliseTicker));

  return (
    <div className="bg-gray-800 rounded-lg p-4 flex flex-col h-full">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-white">Available Tickers ({tickers.length})</h3>
        <p className="text-xs text-gray-400 mt-1">
          Choose one or more symbols to compare. Click a ticker name to select only that symbol.
        </p>
      </div>

      <input
        type="text"
        placeholder="Search tickers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 mb-3 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        aria-label="Search tickers"
      />

      <div className="max-h-64 overflow-y-auto pr-1 flex-1">
        {filteredTickers.length === 0 ? (
          <p className="text-gray-400">No tickers found</p>
        ) : (
          <div className="space-y-1">
            {filteredTickers.map((ticker) => {
              const isSelected = selectedSet.has(ticker.ticker);
              return (
                <div
                  key={ticker.ticker}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded border transition-colors ${
                    isSelected ? "border-blue-500 bg-blue-900/40" : "border-transparent bg-gray-700 hover:bg-gray-600"
                  }`}
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-200">
                    <input
                      type="checkbox"
                      className="accent-blue-500"
                      checked={isSelected}
                      onChange={(e) => handleToggle(ticker.ticker, e.target.checked)}
                    />
                    <span className="font-medium tracking-wide">{ticker.ticker}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSelectOnly(ticker.ticker)}
                    className="text-xs text-blue-300 hover:text-blue-200"
                  >
                    only
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedTickers.length > 0 && (
        <div className="mt-4 p-3 rounded bg-blue-900/30 border border-blue-700 text-xs text-blue-100">
          <div className="font-semibold text-sm mb-1">Selected ({selectedTickers.length})</div>
          <div className="flex flex-wrap gap-2">
            {selectedTickers.map((ticker) => (
              <span key={ticker} className="px-2 py-1 bg-blue-800/60 rounded-full">
                {ticker}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
