"use client";

import clsx from "clsx";

interface IndicatorState {
  rsi: boolean;
  macd: boolean;
  sma: boolean;
  ema: boolean;
}

interface IndicatorTogglesProps {
  value: IndicatorState;
  onChange: (value: IndicatorState) => void;
}

const INDICATOR_CONFIG: Array<{ key: keyof IndicatorState; label: string; description: string }> = [
  { key: "sma", label: "SMA (20)", description: "Simple moving average" },
  { key: "ema", label: "EMA (50)", description: "Exponential moving average" },
  { key: "rsi", label: "RSI (14)", description: "Momentum oscillator" },
  { key: "macd", label: "MACD", description: "Trend & momentum" },
];

export function IndicatorToggles({ value, onChange }: IndicatorTogglesProps) {
  const toggle = (key: keyof IndicatorState) => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <aside className="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-800/80 p-4 text-sm text-gray-300 shadow-sm">
      <h3 className="text-base font-semibold text-white">Indicators</h3>
      <p className="text-xs text-gray-400">
        Choose overlays and oscillators to display alongside price series.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {INDICATOR_CONFIG.map((indicator) => {
          const active = value[indicator.key];
          return (
            <button
              key={indicator.key}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(indicator.key)}
              className={clsx(
                "flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
                active
                  ? "border-blue-500 bg-blue-600/30 text-white shadow-inner"
                  : "border-gray-600 bg-gray-900/60 text-gray-200 hover:border-gray-500 hover:bg-gray-700/70"
              )}
            >
              <span className="text-sm font-medium tracking-wide">{indicator.label}</span>
              <span className="text-xs text-gray-400">{indicator.description}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
