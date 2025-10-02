"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useStrategyStore } from "@/app/store/strategyStore";

interface TickerInfo {
  ticker: string;
  sector?: string;
  name?: string;
}

interface StrategyClientProps {
  tickers?: string[];
  indicators?: string[];
  start?: string;
  end?: string;
}

export default function StrategyClient({
  tickers: urlTickers,
  indicators: urlIndicators,
  start: urlStart,
  end: urlEnd,
}: StrategyClientProps) {
  const { tickers: storeTickers, indicators: storeIndicators, start: storeStart, end: storeEnd } = useStrategyStore();

  // Use URL params if available, otherwise use store values
  const initialTickers = urlTickers || storeTickers || [];
  const initialIndicators = urlIndicators || storeIndicators || [];
  const initialStart = urlStart || storeStart || "";
  const initialEnd = urlEnd || storeEnd || "";

  const [availableTickers, setAvailableTickers] = useState<TickerInfo[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>(initialTickers);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [sectorControlVisible, setSectorControlVisible] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [dslCode, setDslCode] = useState("");
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load tickers and check for sector support
  useEffect(() => {
    async function loadTickers() {
      try {
        const response = await fetch("/api/index");
        const data = await response.json();

        if (data.tickers) {
          let tickerList = Array.isArray(data.tickers)
            ? data.tickers.map((t: any) => (typeof t === "string" ? { ticker: t } : t))
            : [];

          // Try to enrich with manifest data
          const needsEnrichment = tickerList.every(
            (t: any) => !t.sector
          );

          if (needsEnrichment) {
            try {
              const manifestRes = await fetch("/manifest.json", { cache: "no-store" });
              if (manifestRes.ok) {
                const manifest = await manifestRes.json();
                const manifestMap = new Map(
                  (Array.isArray(manifest?.tickers) ? manifest.tickers : []).map((x: any) => [
                    String(x?.ticker ?? "").toUpperCase(),
                    x,
                  ])
                );
                tickerList = tickerList.map((t: any) => {
                  const enriched = manifestMap.get(t.ticker);
                  return enriched ? { ...t, ...enriched } : t;
                });
              }
            } catch {
              // Continue without enrichment
            }
          }

          setAvailableTickers(tickerList);

          // Check if we have sector data to show sector control
          const hasSectorData = tickerList.some((t: any) => t.sector);
          setSectorControlVisible(hasSectorData);
        }
      } catch (err) {
        console.error("Error loading tickers:", err);
      }
    }

    loadTickers();
  }, []);

  // Generate initial prompt based on indicators
  useEffect(() => {
    if (initialIndicators.length > 0 && !prompt) {
      const indicatorHints = initialIndicators.map((ind) => {
        if (ind.startsWith("SMA")) {
          const period = ind.replace("SMA", "");
          return `SMA(${period})`;
        } else if (ind.startsWith("EMA")) {
          const period = ind.replace("EMA", "");
          return `EMA(${period})`;
        }
        return ind;
      });

      if (indicatorHints.length === 1) {
        setPrompt(`Strategy idea: Use ${indicatorHints[0]} to identify trading signals...`);
      } else {
        setPrompt(`Strategy idea: Use ${indicatorHints.join(", ")} to create a multi-indicator trading strategy...`);
      }
    }
  }, [initialIndicators, prompt]);

  // Get unique sectors
  const availableSectors = useMemo(() => {
    const sectors = new Set<string>();
    availableTickers.forEach((ticker) => {
      if (ticker.sector) {
        sectors.add(ticker.sector);
      }
    });
    return Array.from(sectors).sort();
  }, [availableTickers]);

  // Handle sector selection
  const handleSectorToggle = (sector: string) => {
    setSelectedSectors((prev) => {
      const newSectors = prev.includes(sector)
        ? prev.filter((s) => s !== sector)
        : [...prev, sector];

      // Update ticker selection based on sectors
      if (newSectors.length > 0) {
        const sectorTickers = availableTickers
          .filter((t) => newSectors.includes(t.sector || ""))
          .map((t) => t.ticker);

        // Add sector tickers to selection (union with existing manual selections)
        setSelectedTickers((prevTickers) => {
          const manualTickers = prevTickers.filter((ticker) => {
            const tickerData = availableTickers.find((t) => t.ticker === ticker);
            return !tickerData?.sector || !prev.includes(tickerData.sector);
          });
          return Array.from(new Set([...manualTickers, ...sectorTickers]));
        });
      } else {
        // Remove all sector-based selections, keep manual ones
        setSelectedTickers((prevTickers) => {
          return prevTickers.filter((ticker) => {
            const tickerData = availableTickers.find((t) => t.ticker === ticker);
            return !tickerData?.sector || !prev.includes(tickerData.sector);
          });
        });
      }

      return newSectors;
    });
  };

  const handleTickerToggle = (ticker: string) => {
    setSelectedTickers((prev) =>
      prev.includes(ticker)
        ? prev.filter((t) => t !== ticker)
        : [...prev, ticker]
    );
  };

  const generateDSL = async () => {
    if (!prompt.trim()) {
      setError("Please provide a strategy description");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/strategy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          tickers: selectedTickers,
          start: startDate,
          end: endDate,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setDslCode(JSON.stringify(data.dsl, null, 2));
      } else {
        setError(data.error || "Failed to generate DSL");
      }
    } catch (err) {
      setError("Network error while generating DSL");
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    if (!dslCode.trim()) {
      setError("Please generate or provide DSL code first");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/strategy/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: dslCode,
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || "Backtest failed");
      }
    } catch (err) {
      setError("Network error while running backtest");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Strategy Lab</h1>
        <p className="text-gray-400">
          Create and test trading strategies with AI-generated DSL
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Configuration */}
        <div className="space-y-6">
          {/* Selected Tickers */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Selected Tickers ({selectedTickers.length})
            </h3>

            <div className="flex flex-wrap gap-2 mb-4">
              {selectedTickers.map((ticker) => (
                <span
                  key={ticker}
                  className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded-full"
                >
                  {ticker}
                  <button
                    onClick={() => handleTickerToggle(ticker)}
                    className="ml-2 text-blue-200 hover:text-white"
                    aria-label={`Remove ${ticker}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            {/* Sector Filter */}
            {sectorControlVisible && (
              <div className="mb-4">
                <h4 className="text-white font-medium mb-2">Filter by Sector</h4>
                <div className="flex flex-wrap gap-2">
                  {availableSectors.map((sector) => {
                    const tickerCount = availableTickers.filter(t => t.sector === sector).length;
                    return (
                      <label
                        key={sector}
                        className="flex items-center"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSectors.includes(sector)}
                          onChange={() => handleSectorToggle(sector)}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 mr-2"
                        />
                        <span className="text-sm text-gray-300">
                          {sector} ({tickerCount})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ticker List */}
            <div className="max-h-48 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2">
                {availableTickers.map((ticker) => (
                  <label
                    key={ticker.ticker}
                    className="flex items-center text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTickers.includes(ticker.ticker)}
                      onChange={() => handleTickerToggle(ticker.ticker)}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 mr-2"
                    />
                    <span className="text-gray-300">{ticker.ticker}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Backtest Window */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Backtest Window</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Strategy Prompt */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Strategy Description</h3>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your trading strategy in natural language..."
              className="w-full h-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
            />
            <button
              onClick={generateDSL}
              disabled={loading}
              className="mt-3 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              {loading ? "Generating..." : "Generate DSL"}
            </button>
          </div>
        </div>

        {/* Right Panel - DSL and Results */}
        <div className="space-y-6">
          {/* DSL Editor */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">DSL Code</h3>
            <textarea
              value={dslCode}
              onChange={(e) => setDslCode(e.target.value)}
              placeholder="Generated DSL will appear here, or you can write your own..."
              className="w-full h-64 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono text-sm resize-none"
            />
            <button
              onClick={runBacktest}
              disabled={loading}
              className="mt-3 w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              {loading ? "Running..." : "Run Backtest"}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
              <h4 className="text-red-300 font-medium mb-2">Error</h4>
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Backtest Results</h3>
              <div className="bg-gray-700 rounded p-4 max-h-96 overflow-y-auto">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}