import { Suspense } from "react";
import ExploreClient from "./ExploreClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ExplorePageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function ExplorePage({ searchParams }: ExplorePageProps) {
  const symbol = typeof searchParams.symbol === 'string' ? searchParams.symbol : undefined;

  return (
    <Suspense fallback={<div className="p-6 text-gray-300">Loading data warehouse...</div>}>
      <ExploreClient symbol={symbol} />
    </Suspense>
  );
}