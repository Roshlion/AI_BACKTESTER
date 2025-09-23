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
    <div className="p-8 text-white">
      <h1 className="text-2xl font-bold">Strategy Lab</h1>
      <textarea value={dsl} onChange={(e) => setDsl(e.target.value)} className="w-full h-64 text-black p-2 mt-4 rounded" />
      <button onClick={run} className="mt-3 px-4 py-2 bg-blue-600 rounded">Run</button>
      {err && <pre className="mt-4 text-red-400">{err}</pre>}
      {result && <pre className="mt-4 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
