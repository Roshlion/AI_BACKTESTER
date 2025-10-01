import { Suspense } from "react";
import StrategyClient from "./StrategyClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: {
    tickers?: string;
    indicators?: string;
    start?: string;
    end?: string;
  };
};

function parseQueryList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function normaliseTickers(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const upper = value.toUpperCase();
    if (upper && !seen.has(upper)) {
      seen.add(upper);
      result.push(upper);
    }
  }
  return result;
}

export default function StrategyPage({ searchParams }: PageProps) {
  const tickers = normaliseTickers(parseQueryList(searchParams?.tickers));
  const indicators = parseQueryList(searchParams?.indicators);
  const start = searchParams?.start ?? null;
  const end = searchParams?.end ?? null;

  return (
    <Suspense fallback={<div className="p-4 text-sm">Loading strategy…</div>}>
      <StrategyClient
        initialTickers={tickers}
        initialIndicators={indicators}
        initialStartDate={start}
        initialEndDate={end}
      />
    </Suspense>
  );
}
