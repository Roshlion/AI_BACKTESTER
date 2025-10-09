"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, DollarSign, TrendingUp, Shield } from "lucide-react";
import type { PortfolioConfig, PositionSizingType } from "@/types/portfolio";

interface PortfolioPanelProps {
  value: PortfolioConfig;
  onChange: (config: PortfolioConfig) => void;
}

export function PortfolioPanel({ value, onChange }: PortfolioPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const updateField = <K extends keyof PortfolioConfig>(key: K, val: PortfolioConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const updateSizing = (type: PositionSizingType, field?: string, fieldValue?: any) => {
    const newSizing = { ...value.sizing, type };
    if (field) {
      (newSizing as any)[field] = fieldValue;
    }
    onChange({ ...value, sizing: newSizing });
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-semibold text-white">Portfolio Settings</h3>
        </div>
        {expanded ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-4 pt-0 space-y-6">
          {/* Capital & Leverage */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-blue-400" />
              <h4 className="text-sm font-medium text-gray-300">Capital & Leverage</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Starting Cash ($)</label>
                <input
                  type="number"
                  value={value.startingCash}
                  onChange={(e) => updateField("startingCash", Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Leverage (x)</label>
                <input
                  type="number"
                  step="0.1"
                  value={value.leverage ?? 1}
                  onChange={(e) => updateField("leverage", Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Max Gross ($)</label>
                <input
                  type="number"
                  value={value.maxGross ?? ""}
                  onChange={(e) => updateField("maxGross", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Unlimited"
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                />
              </div>
            </div>
          </div>

          {/* Position Sizing */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <h4 className="text-sm font-medium text-gray-300">Position Sizing</h4>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-2">Sizing Method</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSizing("fixed_dollar")}
                    className={`px-3 py-2 text-sm rounded border ${
                      value.sizing.type === "fixed_dollar"
                        ? "border-blue-500 bg-blue-500/10 text-white"
                        : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    Fixed Dollar
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSizing("percent_of_equity")}
                    className={`px-3 py-2 text-sm rounded border ${
                      value.sizing.type === "percent_of_equity"
                        ? "border-blue-500 bg-blue-500/10 text-white"
                        : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    % of Equity
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSizing("risk_per_trade_pct")}
                    className={`px-3 py-2 text-sm rounded border ${
                      value.sizing.type === "risk_per_trade_pct"
                        ? "border-blue-500 bg-blue-500/10 text-white"
                        : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    Risk %
                  </button>
                </div>
              </div>

              {value.sizing.type === "fixed_dollar" && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Amount per Position ($)</label>
                  <input
                    type="number"
                    value={value.sizing.amount ?? 10000}
                    onChange={(e) => updateSizing("fixed_dollar", "amount", Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>
              )}

              {value.sizing.type === "percent_of_equity" && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Percent of NAV (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={value.sizing.pct ?? 10}
                    onChange={(e) => updateSizing("percent_of_equity", "pct", Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>
              )}

              {value.sizing.type === "risk_per_trade_pct" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Risk per Trade (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={value.sizing.pct ?? 1}
                      onChange={(e) => updateSizing("risk_per_trade_pct", "pct", Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">ATR Lookback</label>
                    <input
                      type="number"
                      value={value.sizing.atr_lookback ?? 14}
                      onChange={(e) => updateSizing("risk_per_trade_pct", "atr_lookback", Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Costs & Risks */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-yellow-400" />
              <h4 className="text-sm font-medium text-gray-300">Costs & Risk Controls</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Commission Fixed ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={value.commissionFixed ?? 0}
                  onChange={(e) => updateField("commissionFixed", Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Commission % (bps)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={((value.commissionPct ?? 0) * 10000).toFixed(1)}
                  onChange={(e) => updateField("commissionPct", Number(e.target.value) / 10000)}
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Slippage (bps)</label>
                <input
                  type="number"
                  step="0.1"
                  value={value.slippageBps ?? 2}
                  onChange={(e) => updateField("slippageBps", Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Short Borrow (% p.a.)</label>
                <input
                  type="number"
                  step="0.1"
                  value={value.borrowRateShort ?? 0}
                  onChange={(e) => updateField("borrowRateShort", Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Stop Loss (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={value.stopLossPct ?? ""}
                  onChange={(e) => updateField("stopLossPct", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="None"
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Take Profit (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={value.takeProfitPct ?? ""}
                  onChange={(e) => updateField("takeProfitPct", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="None"
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Max Positions</label>
                <input
                  type="number"
                  value={value.maxPositions ?? ""}
                  onChange={(e) => updateField("maxPositions", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Unlimited"
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Max Weight/Ticker (%)</label>
                <input
                  type="number"
                  step="1"
                  value={value.maxWeightPerTicker ?? ""}
                  onChange={(e) => updateField("maxWeightPerTicker", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Unlimited"
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.allowShort ?? false}
                  onChange={(e) => updateField("allowShort", e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300">Allow Short Selling</span>
              </label>
            </div>
          </div>

          {/* Rebalancing */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-3">Rebalancing</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Frequency</label>
                <select
                  value={value.rebalance ?? "none"}
                  onChange={(e) => updateField("rebalance", e.target.value as any)}
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Drift Threshold (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={value.rebalanceDriftPct ?? 5}
                  onChange={(e) => updateField("rebalanceDriftPct", Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Benchmark (optional)</label>
                <input
                  type="text"
                  value={value.benchmark ?? ""}
                  onChange={(e) => updateField("benchmark", e.target.value || undefined)}
                  placeholder="e.g., SPY"
                  className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
