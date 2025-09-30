"use client";

import { useEffect, useMemo, useState } from "react";
import { StrategyForm, StrategyFormInitialValues } from "@/components/strategy-form";
import { BacktestResults } from "@/components/backtest-results";
import { Database, Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface BacktestResult {
  ok: boolean;
  summary: any;
  perTicker: any[];
  logs: string[];
}

interface GeneratedStrategy {
  mode: string;
  dsl?: any;
  code?: string;
}

export default function BacktesterPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [generatedStrategy, setGeneratedStrategy] = useState<GeneratedStrategy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const paramsKey = searchParams?.toString();

  const prefillValues = useMemo<StrategyFormInitialValues | null>(() => {
    if (!paramsKey) return null;
    const params = new URLSearchParams(paramsKey);
    if (params.get("prefill") !== "1") return null;

    const values: StrategyFormInitialValues = {};
    let hasAny = false;

    const tickersParam = params.get("tickers") ?? params.get("ticker") ?? "";
    if (tickersParam) {
      const normalizedTickers = tickersParam
        .split(/[\s,]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
      if (normalizedTickers.length) {
        values.tickers = normalizedTickers.join(", ");
        hasAny = true;
      }
    }

    const startParam = params.get("startDate") ?? params.get("start") ?? "";
    if (startParam) {
      values.startDate = startParam;
      hasAny = true;
    }

    const endParam = params.get("endDate") ?? params.get("end") ?? "";
    if (endParam) {
      values.endDate = endParam;
      hasAny = true;
    }

    const promptParam = params.get("prompt");
    if (promptParam) {
      values.prompt = promptParam;
      hasAny = true;
    }

    const modeParam = params.get("mode");
    if (modeParam === "dsl" || modeParam === "ml") {
      values.mode = modeParam;
      hasAny = true;
    }

    return hasAny ? values : {};
  }, [paramsKey]);

  const hasPrefill = prefillValues != null && Object.keys(prefillValues).length > 0;

  useEffect(() => {
    if (!prefillValues) return;
    setError(null);
    setResults(null);
    setGeneratedStrategy(null);
  }, [prefillValues]);

  const handleRunStrategy = async (params: {
    prompt: string;
    mode: "dsl" | "ml";
    tickers: string[];
    startDate: string;
    endDate: string;
  }) => {
    setLoading(true);
    setError(null);
    setResults(null);
    setGeneratedStrategy(null);

    try {
      // Step 1: Generate strategy using OpenAI
      const generateResponse = await fetch("/api/strategy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: params.prompt,
          mode: params.mode,
        }),
      });

      const generateResult = await generateResponse.json();

      if (!generateResult.ok) {
        throw new Error(generateResult.error || "Failed to generate strategy");
      }

      setGeneratedStrategy(generateResult);

      // Step 2: Run backtest with generated strategy
      const backtestPayload: any = {
        tickers: params.tickers,
        startDate: params.startDate,
        endDate: params.endDate,
        mode: params.mode,
      };

      if (params.mode === "dsl") {
        backtestPayload.dsl = generateResult.dsl;
      } else {
        backtestPayload.code = generateResult.code;
      }

      const backtestResponse = await fetch("/api/strategy/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backtestPayload),
      });

      const backtestResult = await backtestResponse.json();

      if (!backtestResult.ok) {
        throw new Error(backtestResult.error || "Failed to run backtest");
      }

      setResults(backtestResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      console.error("Strategy execution error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm sm:text-base">
              <Link
                href="/dashboard"
                className="inline-flex items-center text-gray-400 hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <Link
                href="/data"
                className="inline-flex items-center justify-center px-4 py-3 sm:py-2 border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              >
                <Database className="w-4 h-4 mr-2" />
                Data Explorer
              </Link>
            </div>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              <Sparkles className="inline w-8 h-8 mr-2 text-blue-400" />
              AI Strategy Backtester
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-400">
              Describe your trading strategy in plain English and let AI generate and test it for you
            </p>
          </div>
        </div>

        {/* Strategy Form */}
        <div className="mb-8 space-y-4">
          {hasPrefill && (
            <div className="rounded-md border border-blue-600/40 bg-blue-900/20 px-4 py-3 text-sm text-blue-200">
              Strategy Lab has been pre-filled with your dashboard selections.
            </div>
          )}
          <StrategyForm
            onRunStrategy={handleRunStrategy}
            loading={loading}
            initialValues={prefillValues ?? undefined}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-8 p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
            <h3 className="text-red-200 font-medium mb-2">Error</h3>
            <p className="text-sm sm:text-base text-red-300">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mb-8 bg-gray-800 rounded-lg p-6 sm:p-8 text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">Processing Strategy</h3>
            <p className="text-sm sm:text-base text-gray-400">
              AI is generating your strategy and running the backtest...
            </p>
            <div className="mt-4 space-y-2 text-sm sm:text-base text-gray-500">
              <div>🤖 Analyzing your strategy description...</div>
              <div>⚡ Generating trading rules...</div>
              <div>📊 Running backtest simulation...</div>
              <div>📈 Calculating performance metrics...</div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <BacktestResults results={results} generatedStrategy={generatedStrategy || undefined} />
        )}

        {/* Help Section */}
        {!loading && !results && !error && (
          <div className="mt-12 bg-gray-800 rounded-lg p-5 sm:p-6">
            <h3 className="text-lg sm:text-xl font-semibold text-white mb-4">How It Works</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-blue-400 font-medium mb-2">Rule-Based Strategies (DSL)</h4>
                <p className="text-gray-400 text-sm sm:text-base mb-3">
                  Perfect for technical analysis strategies using indicators like moving averages, RSI, and MACD.
                </p>
                <ul className="text-gray-400 text-sm sm:text-base space-y-1">
                  <li>• SMA/EMA crossover strategies</li>
                  <li>• RSI overbought/oversold levels</li>
                  <li>• MACD signal line crossovers</li>
                  <li>• Combination of multiple indicators</li>
                </ul>
              </div>

              <div>
                <h4 className="text-purple-400 font-medium mb-2">Machine Learning Strategies</h4>
                <p className="text-gray-400 text-sm sm:text-base mb-3">
                  Advanced strategies using AI models to predict price movements and make trading decisions.
                </p>
                <ul className="text-gray-400 text-sm sm:text-base space-y-1">
                  <li>• Random Forest classifiers</li>
                  <li>• Linear regression models</li>
                  <li>• Decision tree algorithms</li>
                  <li>• Custom feature engineering</li>
                </ul>
                <p className="text-amber-400 text-xs mt-2">
                  ⚠️ ML execution is currently limited in serverless environments
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded">
              <h4 className="text-blue-300 font-medium mb-2">💡 Pro Tips</h4>
              <ul className="text-blue-200 text-sm sm:text-base space-y-1">
                <li>• Be specific about entry and exit conditions</li>
                <li>• Mention specific indicator periods (e.g., "10-day SMA")</li>
                <li>• Test on multiple tickers to validate robustness</li>
                <li>• Start with shorter time periods for faster testing</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}