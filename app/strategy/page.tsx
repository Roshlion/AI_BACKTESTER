"use client";
import { useState } from "react";

const DEFAULT_DSL = `{
  "tickers": ["AAPL","MSFT"],
  "rules": [
    {"type":"sma","length":10,"field":"close","alias":"sma10"},
    {"type":"cross","fast":"close","slow":"sma10","enter":"fast_above","exit":"fast_below"}
  ],
  "capital": 100000
}`;

export default function StrategyPage() {
  const [dsl, setDsl] = useState(DEFAULT_DSL);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setErr("");
    try {
      const res = await fetch("/api/strategy/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: dsl,
      });
      const j = await res.json();
      setResult(j);
    } catch (e: any) {
      setErr(String(e));
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-3xl space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold">Strategy Lab</h1>
            <p className="text-sm sm:text-base text-gray-300">
              Quickly experiment with strategy DSL payloads and view raw execution responses.
            </p>
          </div>

          <textarea
            value={dsl}
            onChange={(e) => setDsl(e.target.value)}
            className="w-full min-h-[16rem] rounded bg-gray-800 text-gray-100 p-4 text-sm sm:text-base border border-gray-700 focus:outline-none focus:border-blue-500"
          />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              onClick={run}
              className="px-5 py-3 sm:py-2 bg-blue-600 hover:bg-blue-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            >
              Run
            </button>
          </div>
          {err && (
            <pre className="text-sm text-red-400 whitespace-pre-wrap">{err}</pre>
          )}
          {result && (
            <pre className="whitespace-pre-wrap bg-gray-800 border border-gray-700 rounded p-4 text-sm sm:text-base">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </main>
  );
}
