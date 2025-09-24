// app/dashboard/page.tsx
"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { TickerSelector } from "@/components/ticker-selector";
import { PriceChart } from "@/components/price-chart";
import Link from "next/link";

function DashboardInner() {
  const [selectedTicker, setSelectedTicker] = useState<string>("");
  const searchParams = useSearchParams();

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) setSelectedTicker(t.toUpperCase());
  }, [searchParams]);

  return (
    <Suspense fallback={<div className="p-6 text-gray-300">Loading…</div>}>
      <main className="min-h-screen bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="mb-8 space-y-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-sm sm:text-base text-gray-400">
              Real-time overview of available stock tickers and price data visualization
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Ticker Selection Panel */}
            <div className="lg:col-span-1 order-2 lg:order-1">
              <TickerSelector
                onTickerSelect={setSelectedTicker}
                selectedTicker={selectedTicker}
              />

              {selectedTicker && (
                <div className="mt-4 p-4 bg-blue-900/30 rounded-lg border border-blue-700">
                  <h4 className="text-lg sm:text-xl font-semibold text-white mb-2">Selected</h4>
                  <div className="text-blue-200">
                    <div className="text-base sm:text-lg font-bold">{selectedTicker}</div>
                    <div className="text-sm text-blue-300">
                      Click a ticker to view its price chart and data
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 p-3 bg-gray-800 rounded-lg text-sm">
                <h4 className="text-lg sm:text-xl font-semibold text-white mb-2">Quick Actions</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Link
                    href="/backtester"
                    className="w-full text-left px-3 py-3 sm:py-2 bg-green-600 hover:bg-green-700 rounded text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                  >
                    → Test Trading Strategy
                  </Link>
                  <Link
                    href="/data"
                    className="w-full text-left px-3 py-3 sm:py-2 bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                  >
                    → Explore Data
                  </Link>
                </div>
              </div>
            </div>

            {/* Chart Panel */}
            <div className="lg:col-span-2 order-1 lg:order-2">
              {selectedTicker ? (
                <PriceChart ticker={selectedTicker} />
              ) : (
                <div className="bg-gray-800 rounded-lg p-6 sm:p-8 text-center">
                  <div className="text-gray-400 mb-4">
                    <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a 2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">
                    Select a Ticker to View Chart
                  </h3>
                  <p className="text-sm sm:text-base text-gray-400">
                    Choose a stock ticker from the list on the left to display its historical price data and interactive chart.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Status Bar */}
          <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <div className="flex flex-col gap-4 text-sm sm:text-base md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-gray-300">Data Source: S3</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  <span className="text-gray-300">API Status: Active</span>
                </div>
              </div>
              <div className="text-gray-400">
                Last Updated: {new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </main>
    </Suspense>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-300">Loading…</div>}>
      <DashboardInner />
    </Suspense>
  );
}
