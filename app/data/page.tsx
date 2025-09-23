"use client";
import { useEffect, useState } from "react";

type Row = {
  ticker: string;
  url: string;
  records: number;
  firstDate: string;
  lastDate: string;
  format: string;
  sector?: string;
  industry?: string;
};
type IndexManifest = { tickers: Row[] };
type IndexResp = { ok: boolean; manifest: IndexManifest };

export default function DataPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch("/api/index?" + params.toString(), { cache: "no-store" });
      const j: IndexResp = await res.json();
      setRows(j.manifest?.tickers || []);
    })();
  }, [q]);

  return (
    <div className="p-8 text-white">
      <h1 className="text-2xl font-bold">Data</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="text-black p-2 rounded mt-4" />
      <ul className="mt-4 list-disc pl-6">
        {rows.map((r) => (
          <li key={r.ticker}>
            {r.ticker} — {r.records} bars —{" "}
            <a href={r.url} className="underline">
              download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
