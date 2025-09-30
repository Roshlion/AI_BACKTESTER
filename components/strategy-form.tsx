"use client";

import { useEffect, useState } from "react";
import { Sparkles, Code, BookOpen } from "lucide-react";

export interface StrategyFormInitialValues {
  prompt?: string;
  mode?: "dsl" | "ml";
  tickers?: string;
  startDate?: string;
  endDate?: string;
}

interface StrategyFormProps {
  onRunStrategy: (params: {
    prompt: string;
    mode: "dsl" | "ml";
    tickers: string[];
    startDate: string;
    endDate: string;
  }) => void;
  loading: boolean;
  initialValues?: StrategyFormInitialValues;
}

export function StrategyForm({ onRunStrategy, loading, initialValues }: StrategyFormProps) {
  const [prompt, setPrompt] = useState(initialValues?.prompt ?? "");
  const [mode, setMode] = useState<"dsl" | "ml">(initialValues?.mode ?? "dsl");
  const [tickers, setTickers] = useState(initialValues?.tickers ?? "AAPL");
  const [startDate, setStartDate] = useState(initialValues?.startDate ?? "2023-01-01");
  const [endDate, setEndDate] = useState(initialValues?.endDate ?? "2024-01-01");

  useEffect(() => {
    if (initialValues?.prompt != null) {
      setPrompt(initialValues.prompt);
    }
  }, [initialValues?.prompt]);

  useEffect(() => {
    if (initialValues?.mode) {
      setMode(initialValues.mode);
    }
  }, [initialValues?.mode]);

  useEffect(() => {
    if (initialValues?.tickers != null) {
      setTickers(initialValues.tickers);
    }
  }, [initialValues?.tickers]);

  useEffect(() => {
    if (initialValues?.startDate) {
      setStartDate(initialValues.startDate);
    }
  }, [initialValues?.startDate]);

  useEffect(() => {
    if (initialValues?.endDate) {
      setEndDate(initialValues.endDate);
    }
  }, [initialValues?.endDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const tickerList = tickers
      .split(",")
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0);

    onRunStrategy({
      prompt: prompt.trim(),
      mode,
      tickers: tickerList,
      startDate,
      endDate,
    });
  };

  const examplePrompts = {
    dsl: [
      "Buy when the 10-day SMA crosses above the 30-day SMA, sell when it crosses below",
      "Enter long when RSI goes below 30 (oversold), exit when RSI goes above 70 (overbought)",
      "Use MACD crossover: buy on bullish cross, sell on bearish cross"
    ],
    ml: [
      "Use a random forest to predict if the stock will close higher tomorrow, go long if prediction is positive",
      "Train an XGBoost model on the last 60 days of price data to forecast next day returns",
      "Use a decision tree to classify days as up or down based on recent volatility"
    ]
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">Strategy Builder</h2>
        <p className="text-gray-400">
          Describe your trading strategy in plain English and AI will generate the code to test it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mode Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">Strategy Type</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode("dsl")}
              className={`p-4 rounded-lg border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 ${
                mode === "dsl"
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              <div className="flex items-center mb-2">
                <BookOpen className="w-4 h-4 mr-2" />
                <span className="font-medium">Rule-Based (DSL)</span>
              </div>
              <p className="text-xs text-gray-400">
                Uses technical indicators like SMA, RSI, MACD
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode("ml")}
              className={`p-4 rounded-lg border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 ${
                mode === "ml"
                  ? "border-purple-500 bg-purple-500/10 text-white"
                  : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              <div className="flex items-center mb-2">
                <Code className="w-4 h-4 mr-2" />
                <span className="font-medium">Machine Learning</span>
              </div>
              <p className="text-xs text-gray-400">
                Uses AI models to predict price movements
              </p>
            </button>
          </div>
        </div>

        {/* Strategy Prompt */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Strategy Description
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Describe your ${mode === "dsl" ? "rule-based" : "machine learning"} strategy...`}
            rows={4}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            required
          />

          {/* Example Prompts */}
          <div className="mt-3">
            <p className="text-xs text-gray-400 mb-2">Example prompts:</p>
            <div className="space-y-1">
              {examplePrompts[mode].map((example, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="block w-full text-left text-xs text-blue-400 hover:text-blue-300 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                >
                  • {example}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Test Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tickers (comma-separated)
            </label>
            <input
              type="text"
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              placeholder="AAPL, MSFT, GOOGL"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="w-full flex items-center justify-center px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Generating & Testing Strategy...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate & Test Strategy
            </>
          )}
        </button>
      </form>
    </div>
  );
}