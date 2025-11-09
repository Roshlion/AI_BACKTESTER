import { NextRequest, NextResponse } from "next/server";

import { normaliseDsl, runBacktest, type StrategyDSL } from "@/lib/strategy-engine";
import { readTickerRange } from "@/lib/safeParquet";
import { simulatePortfolio } from "@/lib/portfolio";
import * as mlClient from "@/lib/ml-client";
import type { StrategyRunReq } from "@/types/strategy";
import type { PortfolioConfig } from "@/types/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DSL: StrategyDSL = {
  name: "SMA Crossover",
  rules: [
    { type: "sma_cross", params: { fast: 10, slow: 30, enter: "fast_above", exit: "fast_below" } },
  ],
};

const DEFAULT_PORTFOLIO: PortfolioConfig = {
  startingCash: 100000,
  leverage: 1,
  sizing: { type: "percent_of_equity", pct: 10 },
  commissionFixed: 0,
  commissionPct: 0.0005,
  slippageBps: 2,
  borrowRateShort: 0,
  allowShort: false,
  rebalance: "none",
  rebalanceDriftPct: 5,
};
function uniqueTickers(input: unknown): string[] {
  if (!input) return [];
  const array = Array.isArray(input) ? input : String(input).split(",");
  const cleaned = array
    .map((value) => String(value).trim().toUpperCase())
    .filter((value) => value.length > 0);
  return Array.from(new Set(cleaned));
}

function rowsToCsv(rows: any[]): string {
  const header = "date,open,high,low,close,volume";
  const lines = rows.map((row) =>
    [row.date, row.open, row.high, row.low, row.close, row.volume].join(","),
  );
  return [header, ...lines].join("\n");
}

async function runPythonStrategy(code: string, ticker: string, rows: any[]) {
  return {
    stdout: JSON.stringify({ error: "Python ML strategy execution disabled in S3-only mode" }),
    stderr: "ML mode requires local filesystem access which is not available",
    code: 1
  };
}

function summariseDslResults(perTicker: Array<{ ticker: string; stats?: any }>, startDate: string, endDate: string) {
  const withStats = perTicker.filter((item) => item.stats);
  const totalReturn = withStats.reduce((sum, item) => sum + item.stats.totalReturnPct, 0);
  const totalTrades = withStats.reduce((sum, item) => sum + item.stats.trades, 0);
  const avgReturn = withStats.length ? totalReturn / withStats.length : 0;
  return {
    mode: "dsl",
    requestedTickers: perTicker.length,
    processedTickers: withStats.length,
    avgReturnPct: avgReturn,
    totalTrades,
    startDate,
    endDate,
  };
}

function summariseMlResults(perTicker: Array<{ ticker: string; result?: any }>, startDate: string, endDate: string) {
  return {
    mode: "ml",
    requestedTickers: perTicker.length,
    processedTickers: perTicker.filter((item) => item.result).length,
    startDate,
    endDate,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: StrategyRunReq = await req.json().catch(() => ({}));

    // Validate tickers array (strict)
    if (!Array.isArray(body.tickers) || body.tickers.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "tickers array required (must have at least one ticker)"
      }, { status: 400 });
    }

    const tickers = uniqueTickers(body.tickers);
    const startDate = body.startDate ?? "2020-01-01";
    const endDate = body.endDate ?? new Date().toISOString().slice(0, 10);
    const mode = body.mode === "ml" ? "ml" : "dsl";
    const logs: string[] = [];
    const perTicker: any[] = [];

    if (mode === "ml") {
      // Check if ML service is available
      if (!mlClient.isMLAvailable()) {
        return NextResponse.json({
          ok: false,
          error: "ML service is not available. Set ML_API_URL or ALLOW_LOCAL_PY=1 in development."
        }, { status: 501 });
      }

      const { ml } = body;
      if (!ml?.code || typeof ml.code !== "string") {
        return NextResponse.json({ ok: false, error: "ml.code required for ML mode" }, { status: 400 });
      }
      if (!ml.hyperparams || typeof ml.hyperparams !== "object") {
        return NextResponse.json({ ok: false, error: "ml.hyperparams required for ML mode" }, { status: 400 });
      }

      try {
        // Call ML service for training and prediction
        const result = await mlClient.trainPredict({
          tickers,
          start: startDate,
          end: endDate,
          modelType: (ml as any).modelType || "RandomForestRegressor",
          code: ml.code,
          hyperparams: ml.hyperparams,
        });

        return NextResponse.json({
          ok: true,
          mode: "ml",
          ...result,
          tickers,
          startDate,
          endDate,
        });
      } catch (mlError) {
        return NextResponse.json({
          ok: false,
          error: mlError instanceof Error ? mlError.message : "ML execution failed"
        }, { status: 500 });
      }
    }

    const dsl: StrategyDSL = body.dsl ? normaliseDsl(body.dsl) : DEFAULT_DSL;
    const portfolio: PortfolioConfig = body.portfolio || DEFAULT_PORTFOLIO;

    // Check if Python DSL backtest path is enabled
    const usePyBacktester = process.env.USE_PY_BACKTESTER === "1" || process.env.USE_PY_BACKTESTER === "true";

    if (usePyBacktester) {
      // Forward to Python service for DSL backtesting
      const ML_API_URL = process.env.ML_API_URL;
      if (!ML_API_URL) {
        return NextResponse.json({
          ok: false,
          error: "USE_PY_BACKTESTER=1 requires ML_API_URL to be set"
        }, { status: 501 });
      }

      try {
        const response = await fetch(`${ML_API_URL}/backtest/dsl`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tickers,
            start: startDate,
            end: endDate,
            dsl,
            portfolio,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Python DSL backtest failed: ${error}`);
        }

        const result = await response.json();
        return NextResponse.json(result);
      } catch (pyError) {
        return NextResponse.json({
          ok: false,
          error: pyError instanceof Error ? pyError.message : "Python DSL backtest failed"
        }, { status: 500 });
      }
    }

    // Default: TypeScript DSL backtest path
    // Prepare ticker signals for portfolio simulator
    const tickerSignals = [];
    for (const ticker of tickers) {
      const rows = await readTickerRange(ticker, startDate, endDate);
      if (!rows.length) {
        logs.push(`${ticker}: no data in range`);
        continue;
      }

      // Generate signals from DSL
      const result = runBacktest(dsl, rows);

      // Convert trades to enter/exit signals
      const enterSignals = new Array(rows.length).fill(false);
      const exitSignals = new Array(rows.length).fill(false);

      for (const trade of result.trades) {
        if (trade.entryIdx < enterSignals.length) {
          enterSignals[trade.entryIdx] = true;
        }
        if (trade.exitIdx < exitSignals.length) {
          exitSignals[trade.exitIdx] = true;
        }
      }

      tickerSignals.push({
        ticker,
        rows,
        enterSignals,
        exitSignals,
      });
    }

    // Run portfolio simulation
    const portfolioResults = simulatePortfolio(tickerSignals, portfolio, "dsl");

    return NextResponse.json(portfolioResults);
  } catch (error) {
    console.error("/api/strategy/run", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

