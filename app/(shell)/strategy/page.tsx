import { Suspense } from "react";
import StrategyClient from "./StrategyClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface StrategyPageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function StrategyPage({ searchParams }: StrategyPageProps) {
  // Parse search params
  const tickers = typeof searchParams.tickers === 'string'
    ? searchParams.tickers.split(',').filter(Boolean)
    : undefined;

  const indicators = typeof searchParams.indicators === 'string'
    ? searchParams.indicators.split(',').filter(Boolean)
    : undefined;

  const start = typeof searchParams.start === 'string' ? searchParams.start : undefined;
  const end = typeof searchParams.end === 'string' ? searchParams.end : undefined;

  return (
    <Suspense fallback={<div className="p-6 text-gray-300">Loading strategy lab...</div>}>
      <StrategyClient
        tickers={tickers}
        indicators={indicators}
        start={start}
        end={end}
      />
    </Suspense>
  );
}