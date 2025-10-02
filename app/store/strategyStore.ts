import { create } from 'zustand';

interface StrategyState {
  tickers: string[];
  indicators: string[];
  start?: string;
  end?: string;
  setStrategy: (data: {
    tickers: string[];
    indicators: string[];
    start?: string;
    end?: string;
  }) => void;
  clearStrategy: () => void;
}

export const useStrategyStore = create<StrategyState>((set) => ({
  tickers: [],
  indicators: [],
  start: undefined,
  end: undefined,
  setStrategy: (data) => set(data),
  clearStrategy: () => set({
    tickers: [],
    indicators: [],
    start: undefined,
    end: undefined,
  }),
}));