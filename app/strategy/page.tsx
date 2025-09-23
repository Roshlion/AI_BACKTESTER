"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UploadCloud, Trash2 } from "lucide-react";

type ManifestItem = {
  ticker: string;
  name?: string;
  sector?: string;
  industry?: string;
};

type StrategySummary = {
  mode: "dsl" | "ml";
  requestedTickers: number;
  processedTickers: number;
  avgReturnPct?: number;
  totalTrades?: number;
  startDate: string;
  endDate: string;
};

type DslPerTicker = {
  ticker: string;
  stats?: {
    totalReturnPct: number;
    trades: number;
    winRatePct: number;
    avgTradePct: number;
  };
};

type MlPerTicker = {
  ticker: string;
  result?: Record<string, unknown>;
};

type ApiResponse = {
  ok: boolean;
  summary?: StrategySummary;
  perTicker?: Array<DslPerTicker | MlPerTicker>;
  logs?: string[];
  error?: string;
};

const DEFAULT_DSL = {
  name: "SMA Crossover",
  rules: [
    { type: "sma_cross", params: { fast: 10, slow: 30 }, enter: "long", exit: "long" },
  ],
};

const DEFAULT_PYTHON = import pandas as pd\n\n# Load data\ndf = pd.read_csv('data.csv', parse_dates=['date'])\ndf['return'] = df['close'].pct_change().fillna(0)\nresult = {\n    'ticker': df['ticker'].iloc[0] if 'ticker' in df.columns else 'UNKNOWN',\n    'totalReturnPct': float((df['return'] + 1).prod() - 1) * 100,\n    'bars': len(df)\n}\nprint(result);

function parseTickers(input: string): string[] {
  return input
    .split(/[\s,\n\t]+/)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
}

export default function StrategyPage() {
  const [manifest, setManifest] = useState<ManifestItem[]>([]);
  const [sector, setSector] = useState("all");
  const [industry, setIndustry] = useState("all");
  const [manualInput, setManualInput] = useState("");
  const [manualTickers, setManualTickers] = useState<string[]>([]);
  const [mode, setMode] = useState<"dsl" | "ml">("dsl");
  const [dslText, setDslText] = useState(JSON.stringify(DEFAULT_DSL, null, 2));
  const [pythonCode, setPythonCode] = useState(DEFAULT_PYTHON);
  const [startDate, setStartDate] = useState("2024-01-02");
  const [endDate, setEndDate] = useState("2024-06-28");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<StrategySummary | null>(null);
  const [perTicker, setPerTicker] = useState<Array<DslPerTicker | MlPerTicker>>([]);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchManifest = async () => {
      try {
        const res = await fetch("/api/index?limit=1000", { cache: "no-store" });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Failed to fetch manifest");
        if (!cancelled) setManifest(json.results ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    fetchManifest();
    return () => {
      cancelled = true;
    };
  }, []);

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    manifest.forEach((item) => {
      if (item.sector) set.add(item.sector);
    });
    return Array.from(set).sort();
  }, [manifest]);

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    manifest.forEach((item) => {
      if (item.industry) set.add(item.industry);
    });
    return Array.from(set).sort();
  }, [manifest]);

  const filteredTickers = useMemo(() => {
    return manifest
      .filter((item) => (sector === "all" ? true : item.sector === sector))
      .filter((item) => (industry === "all" ? true : item.industry === industry))
      .map((item) => item.ticker);
  }, [manifest, sector, industry]);

  const tickersToRun = useMemo(() => {
    const set = new Set<string>();
    manualTickers.forEach((ticker) => set.add(ticker));
    filteredTickers.forEach((ticker) => set.add(ticker));
    return Array.from(set);
  }, [manualTickers, filteredTickers]);

  const handleApplyManual = () => {
    setManualTickers(parseTickers(manualInput));
  };

  const handleClearManual = () => {
    setManualInput("");
    setManualTickers([]);
  };

  const handleCsvUpload = async (file: File) => {
    const text = await file.text();
    const entries = parseTickers(text);
    setManualTickers((prev) => Array.from(new Set([...prev, ...entries])));
  };

  const onRun = async () => {
    setError(null);
    setSummary(null);
    setPerTicker([]);
    setLogs([]);

    if (!tickersToRun.length) {
      setError("Select at least one ticker via filters, manual input, or CSV upload.");
      return;
    }

    let payload: any = {
      tickers: tickersToRun,
      startDate,
      endDate,
      mode,
    };

    if (mode === "dsl") {
      try {
        payload.dsl = JSON.parse(dslText);
      } catch (err) {
        setError("DSL JSON is invalid. Please fix and try again.");
        return;
      }
    } else {
      if (!pythonCode.trim()) {
        setError("Provide Python code for ML mode.");
        return;
      }
      payload.code = pythonCode;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/strategy/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: ApiResponse = await res.json();
      if (!json.ok) {
        throw new Error(json.error ?? "Strategy run failed");
      }
      setSummary(json.summary ?? null);
      setPerTicker(json.perTicker ?? []);
      setLogs(json.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-300">AI Strategy Lab</p>
            <h1 className="text-3xl font-semibold">Multi-ticker strategies</h1>
          </div>
          <Link className="text-sm text-emerald-300 hover:text-emerald-200" href="/dashboard">
            ? Back to dashboard
          </Link>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-4 flex flex-wrap gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-2">
              <input type="radio" value="dsl" checked={mode === "dsl"} onChange={() => setMode("dsl")} /> DSL mode
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" value="ml" checked={mode === "ml"} onChange={() => setMode("ml")} /> ML mode
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2 space-y-2">
              <label className="block text-sm text-slate-300">Manual tickers (comma or newline separated)</label>
              <textarea
                rows={3}
                value={manualInput}
                onChange={(event) => setManualInput(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              />
              <div className="flex gap-3 text-sm text-slate-300">
                <button className="rounded-lg border border-emerald-400/60 px-3 py-1 text-emerald-200 hover:border-emerald-300" onClick={handleApplyManual}>
                  Apply
                </button>
                <button className="flex items-center gap-1 rounded-lg border border-rose-400/50 px-3 py-1 text-rose-200 hover:border-rose-300" onClick={handleClearManual}>
                  <Trash2 className="h-4 w-4" /> Clear
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-slate-300">Upload tickers (CSV)</label>
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-600 bg-slate-900 text-sm text-slate-300 hover:border-slate-400">
                <UploadCloud className="mb-1 h-5 w-5" />
                <span>Drop file or click</span>
                <input
                  className="hidden"
                  type="file"
                  accept=".csv,.txt"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleCsvUpload(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-300">Sector filter</label>
              <select
                value={sector}
                onChange={(event) => setSector(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              >
                <option value="all">All sectors</option>
                {sectorOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-300">Industry filter</label>
              <select
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              >
                <option value="all">All industries</option>
                {industryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-slate-300">Selected tickers</label>
              <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs leading-5 text-slate-200">
                {tickersToRun.length ? tickersToRun.join(", ") : "—"}
              </div>
              <p className="text-xs text-slate-400">Filters auto-populate tickers; manual entries are merged in.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={onRun}
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? "Running…" : Run on  ticker}
            </button>
          </div>
        </section>

        {mode === "dsl" ? (
          <section className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <label className="mb-2 block text-sm text-slate-300">Strategy DSL (JSON)</label>
            <textarea
              rows={8}
              value={dslText}
              onChange={(event) => setDslText(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-emerald-200"
            />
          </section>
        ) : (
          <section className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <label className="mb-2 block text-sm text-slate-300">Python strategy code</label>
            <textarea
              rows={10}
              value={pythonCode}
              onChange={(event) => setPythonCode(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-200"
            />
            <p className="mt-2 text-xs text-slate-400">Script must print JSON (e.g. {"totalReturnPct": 12}). It runs once per ticker.</p>
          </section>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div>
        )}

        {summary && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold">Summary</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-4 text-sm text-slate-200">
              <div>
                <div className="text-slate-400">Mode</div>
                <div className="text-white capitalize">{summary.mode}</div>
              </div>
              <div>
                <div className="text-slate-400">Tickers processed</div>
                <div className="text-white">{summary.processedTickers} / {summary.requestedTickers}</div>
              </div>
              {summary.mode === "dsl" && (
                <div>
                  <div className="text-slate-400">Average return</div>
                  <div className="text-white">{summary.avgReturnPct?.toFixed(2)}%</div>
                </div>
              )}
              {summary.mode === "dsl" && (
                <div>
                  <div className="text-slate-400">Total trades</div>
                  <div className="text-white">{summary.totalTrades}</div>
                </div>
              )}
              <div>
                <div className="text-slate-400">Date range</div>
                <div className="text-white">{summary.startDate} ? {summary.endDate}</div>
              </div>
            </div>
          </section>
        )}

        {perTicker.length > 0 && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-3 text-lg font-semibold">Per-ticker results</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-white/10 text-left text-slate-300">
                  <tr>
                    <th className="px-4 py-2">Ticker</th>
                    {summary?.mode === "dsl" ? (
                      <>
                        <th className="px-4 py-2">Return %</th>
                        <th className="px-4 py-2">Trades</th>
                        <th className="px-4 py-2">Win rate %</th>
                        <th className="px-4 py-2">Avg trade %</th>
                      </>
                    ) : (
                      <th className="px-4 py-2">Output</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {perTicker.map((item) => (
                    <tr key={item.ticker} className="border-b border-white/5 text-slate-100">
                      <td className="px-4 py-2 font-semibold">{item.ticker}</td>
                      {"stats" in item && item.stats ? (
                        <>
                          <td className="px-4 py-2">{item.stats.totalReturnPct.toFixed(2)}</td>
                          <td className="px-4 py-2">{item.stats.trades}</td>
                          <td className="px-4 py-2">{item.stats.winRatePct.toFixed(1)}</td>
                          <td className="px-4 py-2">{item.stats.avgTradePct.toFixed(2)}</td>
                        </>
                      ) : (
                        <td className="px-4 py-2 font-mono text-xs text-emerald-200">
                          {JSON.stringify((item as MlPerTicker).result ?? {}, null, 2)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {logs.length > 0 && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-3 text-lg font-semibold">Logs</h2>
            <ul className="list-disc space-y-1 pl-6 text-sm text-slate-300">
              {logs.map((line, index) => (
                <li key={${line}-}>{line}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}