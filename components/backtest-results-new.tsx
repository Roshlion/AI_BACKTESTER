"use client";

import { useState } from "react";
import { EquityChart } from "./ui/chart";
import { TrendingUp, TrendingDown, Activity, DollarSign, PieChart, Shield } from "lucide-react";
import type { BacktestResults as BacktestResultsType } from "@/types/portfolio";

interface BacktestResultsProps {
  results: BacktestResultsType | null;
}

export function BacktestResultsNew({ results }: BacktestResultsProps) {
  const [activeTab, setActiveTab] = useState<"equity" | "trades" | "attribution" | "risk">("equity");

  if (!results || !results.ok) {
    return null;
  }

  const { summary, perTicker, portfolioDaily, logs } = results;

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Portfolio Performance</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-700 rounded">
            <div className={`text-2xl font-bold ${summary.totalReturnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {summary.totalReturnPct.toFixed(2)}%
            </div>
            <div className="text-sm text-gray-400">Total Return</div>
          </div>

          <div className="text-center p-4 bg-gray-700 rounded">
            <div className="text-2xl font-bold text-blue-400">
              ${summary.endingEquity.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Ending Equity</div>
          </div>

          <div className="text-center p-4 bg-gray-700 rounded">
            <div className="text-2xl font-bold text-purple-400">{summary.totalTrades}</div>
            <div className="text-sm text-gray-400">Total Trades</div>
          </div>

          <div className="text-center p-4 bg-gray-700 rounded">
            <div className="text-2xl font-bold text-yellow-400">
              {summary.winRatePct?.toFixed(1) || 0}%
            </div>
            <div className="text-sm text-gray-400">Win Rate</div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          {summary.CAGR !== undefined && (
            <div className="text-center p-3 bg-gray-750 rounded">
              <div className="text-lg font-bold text-white">{summary.CAGR.toFixed(2)}%</div>
              <div className="text-xs text-gray-400">CAGR</div>
            </div>
          )}

          {summary.sharpe !== undefined && (
            <div className="text-center p-3 bg-gray-750 rounded">
              <div className="text-lg font-bold text-white">{summary.sharpe.toFixed(2)}</div>
              <div className="text-xs text-gray-400">Sharpe Ratio</div>
            </div>
          )}

          {summary.maxDrawdownPct !== undefined && (
            <div className="text-center p-3 bg-gray-750 rounded">
              <div className="text-lg font-bold text-red-400">{summary.maxDrawdownPct.toFixed(2)}%</div>
              <div className="text-xs text-gray-400">Max Drawdown</div>
            </div>
          )}

          {summary.volatilityPct !== undefined && (
            <div className="text-center p-3 bg-gray-750 rounded">
              <div className="text-lg font-bold text-white">{summary.volatilityPct.toFixed(2)}%</div>
              <div className="text-xs text-gray-400">Volatility</div>
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-400">
          Period: {summary.startDate} to {summary.endDate}
        </div>

        {logs && logs.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Logs</h4>
            <div className="bg-gray-900 rounded p-3 text-xs text-gray-400 max-h-32 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-gray-800 rounded-lg">
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab("equity")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "equity"
                ? "text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" />
            Equity Curve
          </button>
          <button
            onClick={() => setActiveTab("trades")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "trades"
                ? "text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            Trade Ledger
          </button>
          <button
            onClick={() => setActiveTab("attribution")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "attribution"
                ? "text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <PieChart className="w-4 h-4 inline mr-2" />
            Attribution
          </button>
          <button
            onClick={() => setActiveTab("risk")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "risk"
                ? "text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Shield className="w-4 h-4 inline mr-2" />
            Risk
          </button>
        </div>

        <div className="p-6">
          {/* Equity Curve Tab */}
          {activeTab === "equity" && portfolioDaily && portfolioDaily.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Portfolio NAV</h4>
              <EquityChart
                data={portfolioDaily.map((d) => d.nav)}
                title="Portfolio Equity Curve"
              />
            </div>
          )}

          {/* Trade Ledger Tab */}
          {activeTab === "trades" && (
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">All Trades</h4>
              <div className="bg-gray-900 rounded overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800 sticky top-0">
                      <tr className="text-gray-300">
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Ticker</th>
                        <th className="text-left p-2">Side</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Price</th>
                        <th className="text-right p-2">Fees</th>
                        <th className="text-right p-2">P&L %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perTicker.flatMap((ticker) =>
                        ticker.trades.map((trade, i) => (
                          <tr key={`${ticker.ticker}-${i}`} className="border-t border-gray-700">
                            <td className="p-2 text-gray-300">{trade.date}</td>
                            <td className="p-2 text-gray-300 font-medium">{trade.ticker}</td>
                            <td className="p-2">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  trade.side === "buy"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-red-500/20 text-red-400"
                                }`}
                              >
                                {trade.side}
                              </span>
                            </td>
                            <td className="p-2 text-right text-gray-300">{trade.qty}</td>
                            <td className="p-2 text-right text-gray-300">${trade.fillPrice.toFixed(2)}</td>
                            <td className="p-2 text-right text-gray-400">${trade.fees.toFixed(2)}</td>
                            <td
                              className={`p-2 text-right font-medium ${
                                (trade.pnlPct ?? 0) > 0 ? "text-green-400" : "text-red-400"
                              }`}
                            >
                              {trade.pnlPct ? `${trade.pnlPct.toFixed(2)}%` : "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Attribution Tab */}
          {activeTab === "attribution" && (
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Per-Ticker Performance</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {perTicker.map((ticker) => (
                  <div key={ticker.ticker} className="bg-gray-750 rounded-lg p-4">
                    <h5 className="text-lg font-semibold text-white mb-3">{ticker.ticker}</h5>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-gray-400">Return</div>
                        <div
                          className={`text-lg font-bold ${
                            ticker.stats.totalReturnPct >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {ticker.stats.totalReturnPct.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">Trades</div>
                        <div className="text-lg font-bold text-white">{ticker.stats.trades}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">Win Rate</div>
                        <div className="text-lg font-bold text-purple-400">
                          {ticker.stats.winRatePct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">Avg Trade</div>
                        <div className="text-lg font-bold text-blue-400">
                          {ticker.stats.avgTradePct.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Tab */}
          {activeTab === "risk" && portfolioDaily && portfolioDaily.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Risk Metrics</h4>
              <div className="space-y-4">
                <div className="bg-gray-750 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-gray-300 mb-3">Drawdown Curve</h5>
                  <EquityChart
                    data={portfolioDaily.map((d) => 100 + d.drawdownPct)}
                    title="Drawdown from Peak (%)"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gray-750 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Max Drawdown</div>
                    <div className="text-2xl font-bold text-red-400">
                      {summary.maxDrawdownPct?.toFixed(2)}%
                    </div>
                  </div>

                  <div className="bg-gray-750 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Volatility (Ann.)</div>
                    <div className="text-2xl font-bold text-yellow-400">
                      {summary.volatilityPct?.toFixed(2)}%
                    </div>
                  </div>

                  <div className="bg-gray-750 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Sharpe Ratio</div>
                    <div className="text-2xl font-bold text-blue-400">
                      {summary.sharpe?.toFixed(2)}
                    </div>
                  </div>

                  {summary.sortino !== undefined && (
                    <div className="bg-gray-750 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">Sortino Ratio</div>
                      <div className="text-2xl font-bold text-purple-400">
                        {summary.sortino.toFixed(2)}
                      </div>
                    </div>
                  )}

                  {summary.bestDayPct !== undefined && (
                    <div className="bg-gray-750 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">Best Day</div>
                      <div className="text-2xl font-bold text-green-400">
                        {summary.bestDayPct.toFixed(2)}%
                      </div>
                    </div>
                  )}

                  {summary.worstDayPct !== undefined && (
                    <div className="bg-gray-750 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">Worst Day</div>
                      <div className="text-2xl font-bold text-red-400">
                        {summary.worstDayPct.toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
