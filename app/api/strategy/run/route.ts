import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { normaliseDsl, runBacktest, type StrategyDSL } from "@/lib/strategy-engine";
import { readTickerRange } from "@/lib/safeParquet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DSL: StrategyDSL = {
  name: "SMA Crossover",
  rules: [
    { type: "sma_cross", params: { fast: 10, slow: 30, enter: "fast_above", exit: "fast_below" } },
  ],
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
  const baseDir = process.env.AI_TMP_DIR ?? process.env.TMPDIR ?? process.env.TEMP ?? "/tmp";
  const runDir = path.join(baseDir, `ai_backtester_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  await fs.mkdir(runDir, { recursive: true });
  const scriptPath = path.join(runDir, "strategy_ml.py");
  const dataPath = path.join(runDir, "data.csv");
  await fs.writeFile(scriptPath, code, "utf8");
  await fs.writeFile(dataPath, rowsToCsv(rows), "utf8");

  const python = process.env.PYTHON_BIN ?? "python";
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const proc = spawn(python, [scriptPath], { cwd: runDir });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
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
    const body = await req.json().catch(() => ({}));
    const tickers = uniqueTickers(body.tickers ?? body.ticker);
    if (!tickers.length) {
      return NextResponse.json({ ok: false, error: "tickers[] required" }, { status: 400 });
    }

    const startDate = body.startDate ?? "2020-01-01";
    const endDate = body.endDate ?? new Date().toISOString().slice(0, 10);
    const mode = body.mode === "ml" ? "ml" : "dsl";
    const logs: string[] = [];
    const perTicker: any[] = [];

    if (mode === "ml") {
      const code = body.code;
      if (!code || typeof code !== "string") {
        return NextResponse.json({ ok: false, error: "code (Python) required for ML mode" }, { status: 400 });
      }

      for (const ticker of tickers) {
        const rows = await readTickerRange(ticker, startDate, endDate);
        if (!rows.length) {
          logs.push(`${ticker}: no data in range`);
          continue;
        }
        const { stdout, stderr, code: exitCode } = await runPythonStrategy(code, ticker, rows);
        if (exitCode !== 0) {
          logs.push(`${ticker}: python exited with ${exitCode}`);
          if (stderr) logs.push(`${ticker} stderr: ${stderr.trim()}`);
          continue;
        }
        let result: any;
        try {
          result = JSON.parse(stdout.trim());
        } catch (error) {
          logs.push(`${ticker}: failed to parse python output`);
          continue;
        }
        perTicker.push({ ticker, mode: "ml", result });
      }

      const summary = summariseMlResults(perTicker, startDate, endDate);
      return NextResponse.json({ ok: true, summary, perTicker, logs });
    }

    const dsl: StrategyDSL = body.dsl ? normaliseDsl(body.dsl) : DEFAULT_DSL;

    for (const ticker of tickers) {
      const rows = await readTickerRange(ticker, startDate, endDate);
      if (!rows.length) {
        logs.push(`${ticker}: no data in range`);
        continue;
      }
      const result = runBacktest(dsl, rows);
      perTicker.push({ ticker, mode: "dsl", stats: result.stats, trades: result.trades, equity: result.equity });
    }

    const summary = summariseDslResults(perTicker, startDate, endDate);
    return NextResponse.json({ ok: true, summary, perTicker, logs });
  } catch (error) {
    console.error("/api/strategy/run", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

