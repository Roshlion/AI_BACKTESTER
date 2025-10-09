"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useStrategyStore } from "@/app/store/strategyStore";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { ModelCard } from "@/components/strategy/ModelCard";
import { HyperparamForm } from "@/components/strategy/HyperparamForm";
import { CodePane } from "@/components/strategy/CodePane";
import type { StrategyMode } from "@/types/strategy";

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

type Health = { status: 'ok' | 'down'; error?: string };

// Sample DSL code for manual mode
const SAMPLE_DSL = `{
  "tickers": ["AAPL", "MSFT"],
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "rules": {
    "entry": {
      "condition": "EMA(20) > SMA(50) AND RSI < 70",
      "type": "LONG"
    },
    "exit": {
      "condition": "EMA(20) < SMA(50) OR RSI > 80",
      "stopLoss": 0.02,
      "takeProfit": 0.05
    }
  }
}`;

// Sample ML Python code for manual mode
const SAMPLE_ML_CODE = `import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

# Feature engineering
def prepare_features(df, window=60):
    features = pd.DataFrame()
    features['returns'] = df['close'].pct_change()
    features['rsi'] = calculate_rsi(df['close'], 14)
    features['macd'] = calculate_macd(df['close'])
    features['sma_20'] = df['close'].rolling(20).mean()
    features['sma_50'] = df['close'].rolling(50).mean()

    # Target: next-day up/down
    features['target'] = (df['close'].shift(-1) > df['close']).astype(int)

    return features.dropna()

# Train model
def train_model(X, y, hyperparams):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

    model = RandomForestClassifier(
        n_estimators=hyperparams['n_estimators'],
        max_depth=hyperparams['max_depth'],
        random_state=42
    )

    model.fit(X_train, y_train)

    return model, X_test, y_test`;

// Default hyperparameters
const DEFAULT_HYPERPARAMS = {
  n_estimators: 100,
  max_depth: 10,
  learning_rate: 0.1,
  window_size: 60
};

// UI schema for hyperparameters
const HYPERPARAM_UI_SCHEMA = {
  n_estimators: {
    type: 'number' as const,
    min: 10,
    max: 500,
    step: 10,
    help: 'Number of trees in the forest'
  },
  max_depth: {
    type: 'number' as const,
    min: 3,
    max: 30,
    step: 1,
    help: 'Maximum depth of each tree'
  },
  learning_rate: {
    type: 'number' as const,
    min: 0.001,
    max: 1.0,
    step: 0.01,
    help: 'Learning rate for gradient boosting'
  },
  window_size: {
    type: 'number' as const,
    min: 10,
    max: 120,
    step: 5,
    help: 'Lookback window for features'
  }
};

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

  // Mode and health state
  const [mode, setMode] = useState<StrategyMode>('dsl');
  const [manualMode, setManualMode] = useState(false);
  const [health, setHealth] = useState<Health>({ status: 'down' });

  const [availableTickers, setAvailableTickers] = useState<TickerInfo[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>(initialTickers);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [sectorControlVisible, setSectorControlVisible] = useState(false);

  // DSL state
  const [dslPrompt, setDslPrompt] = useState("");
  const [dslCode, setDslCode] = useState("");

  // ML state
  const [mlPrompt, setMlPrompt] = useState("");
  const [mlCode, setMlCode] = useState("");
  const [mlHyperparams, setMlHyperparams] = useState(DEFAULT_HYPERPARAMS);

  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [dslResult, setDslResult] = useState<any>(null);
  const [mlResult, setMlResult] = useState<any>(null);

  // ML health check polling
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const r = await fetch('/api/ml/health', { cache: 'no-store' });
        const j = await r.json();
        if (alive) setHealth(j);
      } catch {
        if (alive) setHealth({ status: 'down', error: 'fetch failed' });
      }
    };
    ping();
    const id = setInterval(ping, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Prefill code when entering manual mode
  useEffect(() => {
    if (manualMode) {
      if (!dslCode) setDslCode(SAMPLE_DSL);
      if (!mlCode) setMlCode(SAMPLE_ML_CODE);
    }
  }, [manualMode, dslCode, mlCode]);

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
          const needsEnrichment = tickerList.every((t: any) => !t.sector);

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
    if (initialIndicators.length > 0 && !dslPrompt) {
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
        setDslPrompt(`Strategy idea: Use ${indicatorHints[0]} to identify trading signals...`);
      } else {
        setDslPrompt(`Strategy idea: Use ${indicatorHints.join(", ")} to create a multi-indicator trading strategy...`);
      }
    }
  }, [initialIndicators, dslPrompt]);

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

  // Handle sector selection with union/dedupe logic
  const handleSectorToggle = (sector: string) => {
    setSelectedSectors((prev) => {
      const newSectors = prev.includes(sector)
        ? prev.filter((s) => s !== sector)
        : [...prev, sector];

      // Update ticker selection based on sectors (union with manual selections)
      const sectorTickers = availableTickers
        .filter((t) => newSectors.includes(t.sector || ""))
        .map((t) => t.ticker);

      const manualTickers = selectedTickers.filter((ticker) => {
        const tickerData = availableTickers.find((t) => t.ticker === ticker);
        return !tickerData?.sector || !newSectors.includes(tickerData.sector);
      });

      // Union and dedupe
      setSelectedTickers(Array.from(new Set([...manualTickers, ...sectorTickers])));

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

  // DSL Generate with useAsyncAction
  const dslGenerate = useAsyncAction(async () => {
    if (!dslPrompt.trim()) throw new Error("Please provide a strategy description");

    const response = await fetch("/api/strategy/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: 'dsl',
        tickers: selectedTickers,
        startDate,
        endDate,
        prompt: dslPrompt,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to generate DSL");

    setDslCode(JSON.stringify(data.dsl, null, 2));
  });

  // DSL Run with useAsyncAction
  const dslRun = useAsyncAction(async () => {
    if (!dslCode.trim()) throw new Error("Please generate or provide DSL code first");

    const response = await fetch("/api/strategy/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: 'dsl',
        tickers: selectedTickers,
        startDate,
        endDate,
        dsl: dslCode,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Backtest failed");

    setDslResult(data);
  });

  // ML Generate with useAsyncAction
  const mlGenerate = useAsyncAction(async () => {
    if (!mlPrompt.trim()) throw new Error("Please provide an ML strategy description");

    const response = await fetch("/api/strategy/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: 'ml',
        tickers: selectedTickers,
        startDate,
        endDate,
        prompt: mlPrompt,
        hyperparams: mlHyperparams,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to generate ML model");

    setMlCode(data.code || data.python || '');
    if (data.hyperparams) {
      setMlHyperparams({ ...mlHyperparams, ...data.hyperparams });
    }
  });

  // ML Run with useAsyncAction
  const mlRun = useAsyncAction(async () => {
    if (!mlCode.trim()) throw new Error("Please generate or provide ML code first");

    const response = await fetch("/api/strategy/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: 'ml',
        tickers: selectedTickers,
        startDate,
        endDate,
        ml: {
          code: mlCode,
          hyperparams: mlHyperparams,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "ML backtest failed");

    setMlResult(data);
  });

  const handleHyperparamChange = (key: string, value: any) => {
    setMlHyperparams(prev => ({ ...prev, [key]: value }));
  };

  // Health badge component
  const healthBadge = (
    <span
      className={`ml-3 inline-flex items-center px-2 py-1 rounded text-xs
      ${health.status === 'ok' ? 'bg-green-700/40 text-green-200' : 'bg-red-700/40 text-red-200'}`}
      title={health.status === 'ok' ? 'ML service reachable' : (health.error || 'ML service down')}
      data-testid="ml-health-badge"
    >
      {health.status === 'ok' ? 'ML online' : 'ML offline'}
    </span>
  );

  const isRunning = dslRun.loading || mlRun.loading;
  const isGenerating = dslGenerate.loading || mlGenerate.loading;
  const mlDisabled = health.status !== 'ok';

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-3xl font-bold text-white">Strategy Lab</h1>
          {healthBadge}
        </div>

        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={(e) => setManualMode(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              data-testid="manual-checker-toggle"
            />
            <span>Manual checker</span>
          </label>

          <div className="inline-flex rounded-lg overflow-hidden border border-gray-700">
            <button
              data-testid="tab-dsl"
              onClick={() => setMode('dsl')}
              className={`px-4 py-2 text-sm ${mode === 'dsl' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-300 hover:text-white'}`}
            >
              DSL
            </button>
            <button
              data-testid="tab-ml"
              onClick={() => setMode('ml')}
              className={`px-4 py-2 text-sm ${mode === 'ml' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-300 hover:text-white'}`}
            >
              ML
            </button>
          </div>
        </div>
      </div>

      {manualMode && (
        <div className="mb-6 bg-blue-900/30 border border-blue-700 rounded-lg p-4">
          <p className="text-blue-200 text-sm">
            Manual mode: Generate buttons disabled. Prefilled scripts are editable. Run buttons remain active.
          </p>
        </div>
      )}

      {/* Loading indicator */}
      {(isGenerating || isRunning) && (
        <div className="mb-6">
          <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse"></div>
          </div>
        </div>
      )}

      {mode === 'dsl' && (
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
                    disabled={isRunning}
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
                          disabled={isRunning}
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
                      disabled={isRunning}
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
                  disabled={isRunning}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                  disabled={isRunning}
                />
              </div>
            </div>
          </div>

          {/* Strategy Prompt */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Strategy Description</h3>
            <textarea
              value={dslPrompt}
              onChange={(e) => setDslPrompt(e.target.value)}
              placeholder="Describe your trading strategy in natural language..."
              aria-label="Strategy Description"
              data-testid="dsl-prompt-textarea"
              className="w-full h-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
              disabled={isGenerating || isRunning}
            />
            <button
              onClick={() => dslGenerate.run()}
              disabled={manualMode || dslGenerate.loading || isRunning}
              className="mt-3 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
              data-testid="dsl-generate-btn"
              title={manualMode ? "Disabled in manual mode" : ""}
            >
              {dslGenerate.loading ? "Generating..." : "Generate DSL"}
            </button>
            {dslGenerate.error && (
              <p className="mt-2 text-sm text-red-400">{dslGenerate.error}</p>
            )}
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
              aria-label="DSL Code"
              data-testid="dsl-editor"
              className="w-full h-64 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono text-sm resize-none"
            />
            <button
              onClick={() => dslRun.run()}
              disabled={dslRun.loading}
              className="mt-3 w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded transition-colors"
              data-testid="dsl-run-btn"
            >
              {dslRun.loading ? "Running..." : "Run Backtest"}
            </button>
            {dslRun.error && (
              <p className="mt-2 text-sm text-red-400">{dslRun.error}</p>
            )}
          </div>

          {/* Results */}
          {dslResult && (
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Backtest Results</h3>
              <div className="bg-gray-700 rounded p-4 max-h-96 overflow-y-auto">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(dslResult, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {mode === 'ml' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            {/* Tickers (shared with DSL) */}
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
                      disabled={isRunning}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

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
                            disabled={isRunning}
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

              <div className="max-h-32 overflow-y-auto">
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
                        disabled={isRunning}
                      />
                      <span className="text-gray-300">{ticker.ticker}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* ML Strategy Prompt */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">ML Strategy</h3>
              <textarea
                value={mlPrompt}
                onChange={(e) => setMlPrompt(e.target.value)}
                placeholder="Describe your ML-based trading strategy..."
                data-testid="ml-prompt-textarea"
                className="w-full h-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
                disabled={mlDisabled || isGenerating || isRunning}
              />
              <button
                onClick={() => mlGenerate.run()}
                className="mt-3 w-full px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-600 hover:bg-blue-700 transition-colors"
                disabled={manualMode || mlDisabled || mlGenerate.loading || isRunning}
                title={mlDisabled ? 'ML service offline' : manualMode ? 'Disabled in manual mode' : ''}
                data-testid="ml-generate-btn"
              >
                {mlGenerate.loading ? 'Generating...' : 'Generate ML Model'}
              </button>
              {mlGenerate.error && (
                <p className="mt-2 text-sm text-red-400">{mlGenerate.error}</p>
              )}
            </div>

            {/* Hyperparameters */}
            <div className="bg-gray-800 rounded-lg p-6">
              <HyperparamForm
                hyperparams={mlHyperparams}
                uiSchema={HYPERPARAM_UI_SCHEMA}
                onChange={handleHyperparamChange}
              />
            </div>
          </div>

          <div className="space-y-6">
            {/* Model Card */}
            {mlCode && (
              <ModelCard
                modelType="Random Forest Classifier"
                summary={{
                  purpose: "Predicts next-day price movement using technical indicators",
                  notes: "Optimized for F1 score with configurable hyperparameters"
                }}
              />
            )}

            {/* Code Pane */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Model Code</h3>
              <textarea
                value={mlCode}
                onChange={(e) => setMlCode(e.target.value)}
                placeholder="ML model code will appear here..."
                data-testid="ml-editor"
                className="w-full h-64 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-green-400 font-mono text-sm resize-none focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => mlRun.run()}
                className="mt-3 w-full px-4 py-2 rounded bg-green-600 text-white disabled:bg-gray-600 hover:bg-green-700 transition-colors"
                disabled={mlDisabled || mlRun.loading}
                title={mlDisabled ? 'ML service offline' : ''}
                data-testid="ml-run-btn"
              >
                {mlRun.loading ? 'Running...' : 'Run ML Backtest'}
              </button>
              {mlRun.error && (
                <p className="mt-2 text-sm text-red-400">{mlRun.error}</p>
              )}
            </div>

            {/* ML Results */}
            {mlResult && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">ML Results</h3>

                {/* Metrics */}
                {mlResult.metrics && (
                  <div className="mb-4">
                    <h4 className="text-md font-semibold text-white mb-2">Metrics</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(mlResult.metrics).map(([key, value]) => (
                        <div key={key} className="bg-gray-700 rounded p-2">
                          <span className="text-gray-400 text-xs">{key}</span>
                          <p className="text-white font-mono">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Predictions preview */}
                {mlResult.predictions && Array.isArray(mlResult.predictions) && mlResult.predictions.length > 0 && (
                  <div>
                    <h4 className="text-md font-semibold text-white mb-2">Predictions ({mlResult.predictions.length})</h4>
                    <div className="bg-gray-700 rounded p-4 max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-600">
                            <th className="text-left py-1">Timestamp</th>
                            <th className="text-left py-1">Symbol</th>
                            <th className="text-right py-1">Prediction</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-300">
                          {mlResult.predictions.slice(0, 10).map((pred: any, i: number) => (
                            <tr key={i} className="border-b border-gray-700">
                              <td className="py-1">{pred.ts || pred.timestamp || '-'}</td>
                              <td className="py-1">{pred.symbol || '-'}</td>
                              <td className="text-right py-1 font-mono">{pred.y_pred ?? pred.prediction ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Logs */}
                {mlResult.logs && (
                  <div className="mt-4">
                    <h4 className="text-md font-semibold text-white mb-2">Logs</h4>
                    <div className="bg-gray-900 rounded p-3 max-h-32 overflow-y-auto">
                      <pre className="text-xs text-gray-400 font-mono">{mlResult.logs}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <HelpSections mode={mode} />
    </div>
  );
}

function HelpSections({ mode }: { mode: StrategyMode }) {
  const exampleDsl = [
    'Momentum cross: Buy EMA(20)>SMA(50); sell on cross-down.',
    'RSI mean reversion: Buy RSI<30; exit RSI>55 or after 10 bars.',
    'MACD trend follow: Enter on MACD>0 & price>200SMA; exit on MACD<0.'
  ];

  const exampleMl = [
    'RandomForest on OHLCV + RSI/MACD with 60-day window; predict next-day up/down.',
    'XGBoost with volatility features; optimize F1; threshold=0.55 for buys.',
    'GradientBoosting on daily features with 60-day lookback; predict next-day return.'
  ];

  const examples = mode === 'dsl' ? exampleDsl : exampleMl;

  const fill = (text: string) => {
    const selector = mode === 'dsl'
      ? 'textarea[data-testid="dsl-prompt-textarea"]'
      : 'textarea[data-testid="ml-prompt-textarea"]';

    const ta = document.querySelector<HTMLTextAreaElement>(selector);
    if (ta) {
      ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  return (
    <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Example prompts ({mode.toUpperCase()})</h3>
        <div className="space-y-2">
          {examples.map((p, i) => (
            <button
              key={i}
              onClick={() => fill(p)}
              className="block w-full text-left px-3 py-2 rounded bg-gray-700 text-gray-100 hover:bg-gray-600 text-sm transition-colors"
              data-testid={`example-prompt-${i}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-3">How it works</h3>
        <ol className="text-gray-300 list-decimal pl-5 space-y-2 text-sm">
          <li>Describe your idea → we generate either DSL (rules) or ML (model + params).</li>
          <li>Review and edit: indicators, tickers, dates (auto min/max from selected), hyperparameters.</li>
          <li>Run: backtester executes DSL; ML service trains/evaluates using Parquet from S3.</li>
          <li>Inspect outputs: metrics, charts, predictions; iterate quickly.</li>
        </ol>
      </div>
    </div>
  );
}
