"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Database, LineChart as LineChartIcon, Beaker } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type ManifestItem = {
  ticker: string;
  name?: string;
  sector?: string;
  industry?: string;
  records?: number;
  firstDate?: string;
  lastDate?: string;
};

type IndexResponse = {
  ok: boolean;
  total: number;
  asOf?: string;
  results: ManifestItem[];
};

export default function DashboardPage() {
  const [manifest, setManifest] = useState<ManifestItem[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchManifest = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/index?limit=1000", { cache: "no-store" });
        const json: IndexResponse = await res.json();
        if (!json.ok) {
          throw new Error((json as any).error ?? "Failed to load manifest");
        }
        if (!cancelled) {
          setManifest(json.results ?? []);
          setTotal(json.total ?? json.results.length ?? 0);
          setAsOf(json.asOf ?? null);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchManifest();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    const totalRecords = manifest.reduce((sum, item) => sum + (item.records ?? 0), 0);
    return { totalRecords };
  }, [manifest]);

  const sectorData = useMemo(() => {
    const counts = new Map<string, number>();
    manifest.forEach((item) => {
      const key = item.sector && item.sector.trim().length > 0 ? item.sector : "Unclassified";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count);
  }, [manifest]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">AI Backtester Dashboard</h1>
            <p className="text-sm text-slate-300">Universe coverage and data freshness at a glance.</p>
          </div>
          <nav className="flex gap-3 text-sm text-slate-300">
            <Link className="rounded-lg border border-white/10 px-3 py-2 hover:border-white/40 hover:text-white" href="/data">
              Data Warehouse
            </Link>
            <Link className="rounded-lg border border-white/10 px-3 py-2 hover:border-white/40 hover:text-white" href="/strategy">
              Strategy Lab
            </Link>
          </nav>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Total tickers" value={loading ? "–" : total.toLocaleString()} />
          <StatCard label="Total records" value={loading ? "–" : totals.totalRecords.toLocaleString()} />
          <StatCard label="Last refresh" value={asOf ? new Date(asOf).toLocaleString() : "Unknown"} />
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Universe by sector</h2>
              <p className="text-xs text-slate-300">Distribution of tickers currently available in the manifest.</p>
            </div>
            <span className="text-xs text-slate-400">{loading ? "Loading sectors…" : ${sectorData.length} sectors}</span>
          </div>
          <div className="h-72">
            {sectorData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="sector" tick={{ fill: "#cbd5f5", fontSize: 12 }} interval={0} angle={-25} textAnchor="end" height={80} />
                  <YAxis tick={{ fill: "#cbd5f5" }} allowDecimals={false} />
                  <Tooltip wrapperStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)" }} />
                  <Bar dataKey="count" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">{loading ? "Loading…" : "No sector data"}</div>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <LinkCard href="/data" icon={<Database className="h-5 w-5" />} title="Explore Data" caption="Search, filter, and download parquet datasets." />
          <LinkCard href="/strategy" icon={<Beaker className="h-5 w-5" />} title="Run Strategies" caption="Execute DSL or ML strategies across the universe." />
          <LinkCard href="/backtester" icon={<LineChartIcon className="h-5 w-5" />} title="Legacy Backtester" caption="Access historical single-ticker tooling." />
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function LinkCard({ href, icon, title, caption }: { href: string; icon: ReactNode; title: string; caption: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left text-slate-200 transition hover:border-white/30 hover:text-white"
    >
      <span className="mt-1 text-emerald-300">{icon}</span>
      <span>
        <div className="text-base font-semibold text-white">{title}</div>
        <div className="text-sm text-slate-300">{caption}</div>
      </span>
    </Link>
  );
}
