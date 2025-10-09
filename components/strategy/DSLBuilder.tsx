"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export type RuleType = "sma_cross" | "ema_cross" | "macd_cross" | "rsi_threshold";

export interface Rule {
  id: string;
  type: RuleType;
  params: Record<string, any>;
}

export interface DSL {
  name: string;
  rules: Rule[];
}

interface DSLBuilderProps {
  value: DSL;
  onChange: (dsl: DSL) => void;
}

export function DSLBuilder({ value, onChange }: DSLBuilderProps) {
  const addRule = (type: RuleType) => {
    const defaultParams = {
      sma_cross: { fast: 10, slow: 30, enter: "fast_above", exit: "fast_below" },
      ema_cross: { fast: 12, slow: 26, enter: "fast_above", exit: "fast_below" },
      macd_cross: { fast: 12, slow: 26, signal: 9, enter: "bull", exit: "bear" },
      rsi_threshold: { period: 14, low: 30, high: 70, enter: "long", exit: "long" },
    };

    const newRule: Rule = {
      id: Math.random().toString(36).slice(2),
      type,
      params: defaultParams[type],
    };

    onChange({ ...value, rules: [...value.rules, newRule] });
  };

  const removeRule = (id: string) => {
    onChange({ ...value, rules: value.rules.filter((r) => r.id !== id) });
  };

  const updateRule = (id: string, params: Record<string, any>) => {
    onChange({
      ...value,
      rules: value.rules.map((r) => (r.id === id ? { ...r, params } : r)),
    });
  };

  const updateName = (name: string) => {
    onChange({ ...value, name });
  };

  return (
    <div className="space-y-4">
      {/* Strategy Name */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Strategy Name
        </label>
        <input
          type="text"
          value={value.name}
          onChange={(e) => updateName(e.target.value)}
          placeholder="My Custom Strategy"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Rules */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-300">Rules</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addRule("sma_cross")}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              <Plus className="w-3 h-3 inline mr-1" />
              SMA
            </button>
            <button
              type="button"
              onClick={() => addRule("ema_cross")}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              <Plus className="w-3 h-3 inline mr-1" />
              EMA
            </button>
            <button
              type="button"
              onClick={() => addRule("macd_cross")}
              className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            >
              <Plus className="w-3 h-3 inline mr-1" />
              MACD
            </button>
            <button
              type="button"
              onClick={() => addRule("rsi_threshold")}
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              <Plus className="w-3 h-3 inline mr-1" />
              RSI
            </button>
          </div>
        </div>

        {value.rules.length === 0 && (
          <p className="text-sm text-gray-400 italic">No rules added yet. Click above to add one.</p>
        )}

        <div className="space-y-3">
          {value.rules.map((rule) => (
            <RuleEditor
              key={rule.id}
              rule={rule}
              onUpdate={(params) => updateRule(rule.id, params)}
              onRemove={() => removeRule(rule.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface RuleEditorProps {
  rule: Rule;
  onUpdate: (params: Record<string, any>) => void;
  onRemove: () => void;
}

function RuleEditor({ rule, onUpdate, onRemove }: RuleEditorProps) {
  const updateParam = (key: string, value: any) => {
    onUpdate({ ...rule.params, [key]: value });
  };

  const renderParams = () => {
    switch (rule.type) {
      case "sma_cross":
      case "ema_cross":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fast Period</label>
              <input
                type="number"
                value={rule.params.fast ?? 10}
                onChange={(e) => updateParam("fast", Number(e.target.value))}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Slow Period</label>
              <input
                type="number"
                value={rule.params.slow ?? 30}
                onChange={(e) => updateParam("slow", Number(e.target.value))}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Enter On</label>
              <select
                value={rule.params.enter ?? "fast_above"}
                onChange={(e) => updateParam("enter", e.target.value)}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value="fast_above">Fast Above</option>
                <option value="fast_below">Fast Below</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Exit On</label>
              <select
                value={rule.params.exit ?? "fast_below"}
                onChange={(e) => updateParam("exit", e.target.value)}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value="fast_above">Fast Above</option>
                <option value="fast_below">Fast Below</option>
              </select>
            </div>
          </div>
        );

      case "macd_cross":
        return (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fast</label>
              <input
                type="number"
                value={rule.params.fast ?? 12}
                onChange={(e) => updateParam("fast", Number(e.target.value))}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Slow</label>
              <input
                type="number"
                value={rule.params.slow ?? 26}
                onChange={(e) => updateParam("slow", Number(e.target.value))}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Signal</label>
              <input
                type="number"
                value={rule.params.signal ?? 9}
                onChange={(e) => updateParam("signal", Number(e.target.value))}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Enter On</label>
              <select
                value={rule.params.enter ?? "bull"}
                onChange={(e) => updateParam("enter", e.target.value)}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value="bull">Bullish Cross</option>
                <option value="bear">Bearish Cross</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Exit On</label>
              <select
                value={rule.params.exit ?? "bear"}
                onChange={(e) => updateParam("exit", e.target.value)}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value="bull">Bullish Cross</option>
                <option value="bear">Bearish Cross</option>
              </select>
            </div>
          </div>
        );

      case "rsi_threshold":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Period</label>
              <input
                type="number"
                value={rule.params.period ?? 14}
                onChange={(e) => updateParam("period", Number(e.target.value))}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Low Threshold</label>
              <input
                type="number"
                value={rule.params.low ?? 30}
                onChange={(e) => updateParam("low", Number(e.target.value))}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">High Threshold</label>
              <input
                type="number"
                value={rule.params.high ?? 70}
                onChange={(e) => updateParam("high", Number(e.target.value))}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Enter/Exit</label>
              <select
                value={rule.params.enter ?? "long"}
                onChange={(e) => {
                  updateParam("enter", e.target.value);
                  updateParam("exit", e.target.value);
                }}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value="long">Long (Buy Low)</option>
                <option value="short">Short (Sell High)</option>
              </select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const ruleTypeLabels: Record<RuleType, string> = {
    sma_cross: "SMA Cross",
    ema_cross: "EMA Cross",
    macd_cross: "MACD Cross",
    rsi_threshold: "RSI Threshold",
  };

  return (
    <div className="p-4 bg-gray-750 border border-gray-600 rounded">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-white">{ruleTypeLabels[rule.type]}</h4>
        <button
          type="button"
          onClick={onRemove}
          className="text-red-400 hover:text-red-300 transition-colors"
          title="Remove rule"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {renderParams()}
    </div>
  );
}
