"use client";

import { EquityChart } from "./ui/chart";
import { TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";

interface Trade {
  entryIdx: number;
  exitIdx: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
}

interface BacktestStats {
  totalReturnPct: number;
  trades: number;
  winRatePct: number;
  avgTradePct: number;
}

interface TickerResult {
  ticker: string;
  mode: string;
  stats?: BacktestStats;
  trades?: Trade[];
  equity?: number[];
  result?: any; // For ML results
}

interface BacktestResultsProps {
  results: {
    ok: boolean;
    summary: any;
    perTicker: TickerResult[];
    logs: string[];
  } | null;
  generatedStrategy?: {
    mode: string;
    dsl?: any;
    code?: string;
  };
}

export function BacktestResults({ results, generatedStrategy }: BacktestResultsProps) {
  if (!results) return null;

  const { summary, perTicker, logs } = results;

  return (
    <div className="space-y-6">
      {/* Generated Strategy Display */}
      {generatedStrategy && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Generated {generatedStrategy.mode === "dsl" ? "Strategy DSL" : "Python Code"}
          </h3>

          {generatedStrategy.mode === "dsl" && generatedStrategy.dsl && (
            <div className="bg-gray-900 rounded p-4 text-sm">
              <div className="text-blue-400 font-medium mb-2">Strategy: {generatedStrategy.dsl.name}</div>
              <pre className="text-gray-300 whitespace-pre-wrap">
                {JSON.stringify(generatedStrategy.dsl, null, 2)}
              </pre>
            </div>
          )}

          {generatedStrategy.mode === "ml" && generatedStrategy.code && (
            <div className="bg-gray-900 rounded p-4 text-sm">
              <div className="text-purple-400 font-medium mb-2">Generated Python Code:</div>
              <pre className="text-gray-300 whitespace-pre-wrap overflow-x-auto">
                {generatedStrategy.code}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Summary Stats */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Backtest Summary</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center p-4 bg-gray-700 rounded">
            <div className="text-2xl font-bold text-blue-400">{summary.processedTickers}</div>
            <div className="text-sm text-gray-400">Tickers Processed</div>
          </div>

          {summary.mode === "dsl" && (
            <>
              <div className="text-center p-4 bg-gray-700 rounded">
                <div className="text-2xl font-bold text-green-400">
                  {summary.avgReturnPct?.toFixed(2) || 0}%
                </div>
                <div className="text-sm text-gray-400">Avg Return</div>
              </div>

              <div className="text-center p-4 bg-gray-700 rounded">
                <div className="text-2xl font-bold text-purple-400">{summary.totalTrades || 0}</div>
                <div className="text-sm text-gray-400">Total Trades</div>
              </div>
            </>
          )}

          <div className="text-center p-4 bg-gray-700 rounded">
            <div className="text-2xl font-bold text-yellow-400">
              {summary.startDate} to {summary.endDate}
            </div>
            <div className="text-sm text-gray-400">Test Period</div>
          </div>
        </div>

        {logs.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Processing Logs</h4>
            <div className="bg-gray-900 rounded p-3 text-xs text-gray-400 max-h-32 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Per-Ticker Results */}
      {perTicker.map((result, index) => (
        <div key={index} className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            {result.ticker} Results
          </h3>

          {result.mode === "dsl" && result.stats && (
            <>
              {/* DSL Results */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="flex items-center p-3 bg-gray-700 rounded">
                  <TrendingUp className="w-8 h-8 text-green-400 mr-3" />
                  <div>
                    <div className="text-lg font-bold text-white">
                      {result.stats.totalReturnPct.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-400">Total Return</div>
                  </div>
                </div>

                <div className="flex items-center p-3 bg-gray-700 rounded">
                  <Activity className="w-8 h-8 text-blue-400 mr-3" />
                  <div>
                    <div className="text-lg font-bold text-white">{result.stats.trades}</div>
                    <div className="text-xs text-gray-400">Total Trades</div>
                  </div>
                </div>

                <div className="flex items-center p-3 bg-gray-700 rounded">
                  <DollarSign className="w-8 h-8 text-purple-400 mr-3" />
                  <div>
                    <div className="text-lg font-bold text-white">
                      {result.stats.winRatePct.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400">Win Rate</div>
                  </div>
                </div>

                <div className="flex items-center p-3 bg-gray-700 rounded">
                  <TrendingDown className="w-8 h-8 text-yellow-400 mr-3" />
                  <div>
                    <div className="text-lg font-bold text-white">
                      {result.stats.avgTradePct.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-400">Avg Trade</div>
                  </div>
                </div>
              </div>

              {/* Equity Chart */}
              {result.equity && result.equity.length > 0 && (
                <div className="mb-6">
                  <EquityChart
                    data={result.equity}
                    title={`${result.ticker} Equity Curve`}
                  />
                </div>
              )}

              {/* Trades Table */}
              {result.trades && result.trades.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Trade History</h4>
                  <div className="bg-gray-900 rounded overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-800 sticky top-0">
                          <tr className="text-gray-300">
                            <th className="text-left p-2">Entry</th>
                            <th className="text-left p-2">Exit</th>
                            <th className="text-right p-2">Entry Price</th>
                            <th className="text-right p-2">Exit Price</th>
                            <th className="text-right p-2">P&L %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.trades.map((trade, i) => (
                            <tr key={i} className="border-t border-gray-700">
                              <td className="p-2 text-gray-300">{trade.entryIdx}</td>
                              <td className="p-2 text-gray-300">{trade.exitIdx}</td>
                              <td className="p-2 text-right text-gray-300">
                                ${trade.entryPrice.toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-gray-300">
                                ${trade.exitPrice.toFixed(2)}
                              </td>
                              <td className={`p-2 text-right font-medium ${
                                trade.pnl > 0 ? "text-green-400" : "text-red-400"
                              }`}>
                                {(trade.pnl * 100).toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {result.mode === "ml" && result.result && (
            <div className="bg-gray-900 rounded p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">ML Results</h4>
              <pre className="text-gray-300 text-sm whitespace-pre-wrap">
                {JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          )}

          {result.mode === "ml" && !result.result && (
            <div className="bg-red-900/20 border border-red-500/30 rounded p-4">
              <p className="text-red-300">
                ML strategy execution is currently disabled. This feature requires a local Python environment.
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}