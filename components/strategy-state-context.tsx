"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type StrategySelection = {
  tickers: string[];
  indicators: string[];
  start: string | null;
  end: string | null;
  prompt: string | null;
};

type StrategyStateValue = StrategySelection & {
  setSelection: (update: Partial<StrategySelection>) => void;
  reset: () => void;
};

const StrategyStateContext = createContext<StrategyStateValue | null>(null);

const DEFAULT_STATE: StrategySelection = {
  tickers: [],
  indicators: [],
  start: null,
  end: null,
  prompt: null,
};

export function StrategyStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StrategySelection>(DEFAULT_STATE);

  const value = useMemo<StrategyStateValue>(() => {
    return {
      ...state,
      setSelection: (update) => {
        setState((prev) => ({
          tickers: update.tickers ?? prev.tickers,
          indicators: update.indicators ?? prev.indicators,
          start: update.start === undefined ? prev.start : update.start,
          end: update.end === undefined ? prev.end : update.end,
          prompt: update.prompt === undefined ? prev.prompt : update.prompt,
        }));
      },
      reset: () => setState(DEFAULT_STATE),
    };
  }, [state]);

  return <StrategyStateContext.Provider value={value}>{children}</StrategyStateContext.Provider>;
}

export function useStrategyState() {
  const context = useContext(StrategyStateContext);
  if (!context) {
    throw new Error("useStrategyState must be used within a StrategyStateProvider");
  }
  return context;
}
