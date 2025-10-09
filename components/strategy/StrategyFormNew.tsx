"use client";

import { useState } from "react";
import { Play, Sparkles, X } from "lucide-react";
import { DSLBuilder, type DSL } from "./DSLBuilder";
import { MLBuilder, type MLConfig } from "./MLBuilder";
import { PortfolioPanel } from "./PortfolioPanel";
import type { PortfolioConfig } from "@/types/portfolio";

interface StrategyFormNewProps {
  onRunStrategy: (params: {
    mode: "dsl" | "ml";
    tickers: string[];
    startDate: string;
    endDate: string;
    dsl?: DSL;
    ml?: MLConfig;
    portfolio: PortfolioConfig;
  }) => void;
  loading: boolean;
}

const DEFAULT_DSL: DSL = {
  name: "SMA Crossover",
  rules: [
    {
      id: "default",
      type: "sma_cross",
      params: { fast: 10, slow: 30, enter: "fast_above", exit: "fast_below" },
    },
  ],
};

const DEFAULT_ML: MLConfig = {
  modelType: "RandomForestClassifier",
  hyperparams: {
    n_estimators: 100,
    max_depth: 10,
    min_samples_split: 2,
    train_window: 252,
  },
  code: `# ML Strategy Template
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier

# Read data from S3 (will be provided by the service)
# df = fetch_ohlcv_data(tickers, start, end)

# Feature engineering
def create_features(df):
    df['returns'] = df['close'].pct_change()
    df['sma_20'] = df['close'].rolling(20).mean()
    df['sma_50'] = df['close'].rolling(50).mean()
    df['rsi'] = compute_rsi(df['close'], 14)
    df['target'] = (df['close'].shift(-1) > df['close']).astype(int)
    return df.dropna()

# Train model
# features = ['returns', 'sma_20', 'sma_50', 'rsi']
# X_train, y_train = ...
# model = RandomForestClassifier(n_estimators=100, max_depth=10)
# model.fit(X_train, y_train)

# Generate predictions and trades
# predictions = model.predict(X_test)
# output results as JSON
`,
  customMode: false,
};

const DEFAULT_PORTFOLIO: PortfolioConfig = {
  startingCash: 100000,
  leverage: 1,
  sizing: { type: "percent_of_equity", pct: 10 },
  commissionFixed: 0,
  commissionPct: 0.0005, // 5 bps
  slippageBps: 2,
  borrowRateShort: 0,
  allowShort: false,
  rebalance: "none",
  rebalanceDriftPct: 5,
};

export function StrategyFormNew({ onRunStrategy, loading }: StrategyFormNewProps) {
  const [mode, setMode] = useState<"dsl" | "ml">("dsl");
  const [tickers, setTickers] = useState("AAPL,MSFT");
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState("2024-01-01");

  const [dsl, setDsl] = useState<DSL>(DEFAULT_DSL);
  const [ml, setMl] = useState<MLConfig>(DEFAULT_ML);
  const [portfolio, setPortfolio] = useState<PortfolioConfig>(DEFAULT_PORTFOLIO);

  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleRunBacktest = (e: React.FormEvent) => {
    e.preventDefault();

    const tickerList = tickers
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);

    if (tickerList.length === 0) {
      alert("Please provide at least one ticker");
      return;
    }

    onRunStrategy({
      mode,
      tickers: tickerList,
      startDate,
      endDate,
      dsl: mode === "dsl" ? dsl : undefined,
      ml: mode === "ml" ? ml : undefined,
      portfolio,
    });
  };

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) {
      setAiError("Please enter a strategy description");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const tickerList = tickers
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t.length > 0);

      const response = await fetch("/api/strategy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt: aiPrompt,
          tickers: tickerList,
          startDate,
          endDate,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to generate strategy");
      }

      // Autofill the manual forms based on mode
      if (mode === "dsl" && data.dsl) {
        setDsl({
          name: data.dsl.name || "AI Generated Strategy",
          rules: data.dsl.rules.map((rule: any, idx: number) => ({
            ...rule,
            id: `ai-${idx}-${Math.random().toString(36).slice(2)}`,
          })),
        });
      } else if (mode === "ml") {
        if (data.code) {
          setMl((prev) => ({
            ...prev,
            code: data.code,
            customMode: true,
            modelType: data.modelType || prev.modelType,
            hyperparams: data.hyperparams || prev.hyperparams,
          }));
        }
      }

      setShowAiModal(false);
      setAiPrompt("");
    } catch (error: any) {
      setAiError(error.message || "Failed to generate strategy");
    } finally {
      setAiLoading(false);
    }
  };

  const DSL_EXAMPLES = [
    "Buy when 10-day SMA crosses above 30-day SMA, sell when it crosses below",
    "Enter long when RSI goes below 30, exit when RSI goes above 70",
    "Use MACD crossover: buy on bullish cross, sell on bearish cross",
  ];

  const ML_EXAMPLES = [
    "RandomForest on OHLCV + RSI/MACD with 60-day window; predict next-day up/down",
    "XGBoost with volatility features; optimize F1; threshold=0.55 for buys",
    "Use decision tree to classify days based on recent 20-day returns and volume",
  ];

  const examples = mode === "dsl" ? DSL_EXAMPLES : ML_EXAMPLES;

  return (
    <div className="space-y-6">
      {/* Header with Mode Toggle and AI Button */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Strategy Builder</h2>
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate with AI
          </button>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          Build your strategy manually or use AI to autofill the fields below.
        </p>

        {/* Mode Selection */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode("dsl")}
            disabled={loading}
            className={`p-4 rounded-lg border text-left transition-colors ${
              mode === "dsl"
                ? "border-blue-500 bg-blue-500/10 text-white"
                : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
            }`}
          >
            <div className="font-medium mb-1">Rule-Based (DSL)</div>
            <p className="text-xs text-gray-400">Technical indicators: SMA, EMA, RSI, MACD</p>
          </button>

          <button
            type="button"
            onClick={() => setMode("ml")}
            disabled={loading}
            className={`p-4 rounded-lg border text-left transition-colors ${
              mode === "ml"
                ? "border-purple-500 bg-purple-500/10 text-white"
                : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
            }`}
          >
            <div className="font-medium mb-1">Machine Learning</div>
            <p className="text-xs text-gray-400">AI models: RandomForest, XGBoost, Neural Nets</p>
          </button>
        </div>
      </div>

      {/* Strategy Builder (Manual) */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          {mode === "dsl" ? "DSL Rules" : "ML Model Configuration"}
        </h3>
        {mode === "dsl" ? (
          <DSLBuilder value={dsl} onChange={setDsl} />
        ) : (
          <MLBuilder value={ml} onChange={setMl} />
        )}
      </div>

      {/* Portfolio Settings */}
      <PortfolioPanel value={portfolio} onChange={setPortfolio} />

      {/* Backtest Parameters */}
      <form onSubmit={handleRunBacktest} className="bg-gray-800 rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white mb-4">Backtest Parameters</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tickers (comma-separated)
            </label>
            <input
              type="text"
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              placeholder="AAPL, MSFT, GOOGL"
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              required
            />
          </div>
        </div>

        {/* Run Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Running Backtest...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run Backtest
            </>
          )}
        </button>
      </form>

      {/* AI Generation Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Generate with AI
              </h3>
              <button
                onClick={() => setShowAiModal(false)}
                disabled={aiLoading}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-400 text-sm mb-4">
              Describe your strategy in plain English. AI will autofill the {mode === "dsl" ? "DSL rules" : "ML model configuration"} below.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Strategy Description
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={`Describe your ${mode === "dsl" ? "rule-based" : "machine learning"} strategy...`}
                  rows={6}
                  disabled={aiLoading}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                />
              </div>

              {/* Example Prompts */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Example prompts:</p>
                <div className="space-y-1">
                  {examples.map((example, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setAiPrompt(example)}
                      disabled={aiLoading}
                      className="block w-full text-left text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                    >
                      • {example}
                    </button>
                  ))}
                </div>
              </div>

              {aiError && (
                <div className="p-3 bg-red-500/10 border border-red-500 rounded text-red-400 text-sm">
                  {aiError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  disabled={aiLoading}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateWithAI}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {aiLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 inline-block" />
                      Generating...
                    </>
                  ) : (
                    "Generate"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
