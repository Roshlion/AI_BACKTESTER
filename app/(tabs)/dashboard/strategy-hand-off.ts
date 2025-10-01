import type { StrategySelection } from "@/components/strategy-state-context";

export type StrategyNavigationArgs = {
  tickers: string[];
  indicators: string[];
  dateRange: { start?: string; end?: string };
  prompt: string;
  setSelection: (selection: Partial<StrategySelection>) => void;
  push: (href: string) => void;
};

export function commitStrategyNavigation({
  tickers,
  indicators,
  dateRange,
  prompt,
  setSelection,
  push,
}: StrategyNavigationArgs) {
  if (!tickers.length) return;

  setSelection({
    tickers,
    indicators,
    start: dateRange.start?.trim() ? dateRange.start : null,
    end: dateRange.end?.trim() ? dateRange.end : null,
    prompt: prompt.trim() ? prompt : null,
  });

  push("/strategy");
}
