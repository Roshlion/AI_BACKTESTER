"use client";
import { useEffect, useState } from "react";

type Ticker = { ticker: string; records: number; url: string; firstDate: string; lastDate: string; format: string };
type Manifest = { version: number; source: string; asOf: string; tickers: Ticker[] };
type IndexResp = { ok: boolean; manifest: Manifest };

export default function DashboardPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/index", { cache: "no-store" });
        const j: IndexResp = await res.json();
        setManifest(j.manifest);
      } catch (e: any) {
        setErr(String(e));
      }
    })();
  }, []);

  const total = manifest?.tickers?.length ?? 0;

  return (
    <div className="p-8 text-white">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {err && <pre>{err}</pre>}
      <p className="mt-4">Tickers: {total}</p>
      <p>Source: {manifest?.source}</p>
      <p>As of: {manifest?.asOf}</p>
    </div>
  );
}
