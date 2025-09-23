CLAUDE: AI_BACKTESTER — 100-Ticker Parquet-Only Prototype (Fresh Run)

You are modifying the repo AI_BACKTESTER. Make all changes below exactly as specified. If a file exists, overwrite it; if missing, create it.

0) Ground rules

All runtime data access = Parquet only (local public/*.parquet or S3 later).

Polygon API/Flat Files are used only by scripts to create/update Parquet.

Remove any auto-DSL generation API if present; the UI will still let users run DSL/ML, but all data loads come from Parquet.

Keep Vercel compatibility.

1) Cleanup (delete)

Remove legacy data and unused stubs:

Delete: public/data/**, public/*-aapl.json, public/check-*.json, public/out-*.json, public/prod-*.json, any stray JSON bar dumps.

Delete old pages if present: app/data-manager/page.tsx.

Delete API gen endpoint if present: app/api/strategy/generate/route.ts.

Keep: public/manifest.json (will be replaced), public/*.parquet (AAPL can stay), any relevant framework files.

2) Env template

Overwrite .env.example with:

# Core keys (only used by build scripts; app itself reads Parquet only)
POLYGON_API_KEY=

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Parquet discovery (local now; S3 later)
PARQUET_URL=
S3_BUCKET_NAME=
S3_PREFIX=
AWS_REGION=us-east-1

# Seed + ETL toggles
TICKER_SEED_CSV=./data/universe-100.csv
USE_POLYGON_FOR_BARS=false

# ML runner helpers (local only)
PYTHON_BIN=python
AI_TMP_DIR=.ai_tmp

3) Add the 100-ticker seed

Create data/universe-100.csv with exactly this content:

ticker
AAPL
MSFT
GOOGL
AMZN
NVDA
META
TSLA
BRK.B
LLY
AVGO
JPM
V
JNJ
WMT
PG
UNH
XOM
MA
HD
KO
PEP
COST
MRK
ABBV
ORCL
BAC
PFE
CSCO
ADBE
NFLX
CRM
TMO
ABT
INTC
ACN
MCD
CMCSA
DHR
TXN
LIN
AMD
NKE
AMGN
WFC
PM
IBM
CAT
NEE
HON
LOW
UNP
GS
QCOM
AMAT
GE
INTU
RTX
SBUX
BKNG
MDLZ
MS
PLD
CVX
SPGI
BLK
NOW
ISRG
ELV
C
DE
ETN
LMT
ADP
CB
AXP
SYK
T
VRTX
PGR
SO
MMC
REGN
TGT
ADI
BA
ZTS
SCHW
MU
CI
AMT
CSX
PNC
MO
ICE
MDT
CL
DUK
EMR
GM
GILD

4) SIC → Sector/Industry mapping

Create lib/sic-map.ts:

// Minimal SIC → sector/industry map (expand as needed).
export const sicToSector: Record<string, {sector: string; industry?: string}> = {
  "3571": { sector: "Technology", industry: "Computer Hardware" },
  "7372": { sector: "Technology", industry: "Software" },
  "2834": { sector: "Health Care", industry: "Pharmaceuticals" },
  "2911": { sector: "Energy", industry: "Oil & Gas" },
  "5411": { sector: "Consumer Staples", industry: "Food & Staples Retailing" },
  // fallback sector buckets by first 1–2 digits
};
export function guessSectorBySIC(sic?: string) {
  if (!sic) return undefined;
  if (sicToSector[sic]) return sicToSector[sic];
  const h1 = sic[0];
  if (h1 === "2" || h1 === "3") return { sector: "Manufacturing" };
  if (h1 === "4") return { sector: "Transportation & Public Utilities" };
  if (h1 === "5") return { sector: "Wholesale/Retail Trade" };
  if (h1 === "6") return { sector: "Finance, Insurance & Real Estate" };
  if (h1 === "7") return { sector: "Services" };
  if (h1 === "8") return { sector: "Public Administration" };
  return { sector: "Unclassified" };
}

5) Bars ingest helper (script-only)

Create lib/ingest-bars.ts:

import fs from "fs";
import path from "path";
import parquet from "parquetjs-lite";
import fetch from "node-fetch";

type Bar = { date: string; o:number; h:number; l:number; c:number; v:number; vw?:number };

export async function fetchDailyBarsFromPolygon(ticker: string): Promise<Bar[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw new Error("POLYGON_API_KEY missing");
  // fetch last ~2 years daily to keep payload small for prototype; adjust later
  const now = new Date();
  const end = now.toISOString().slice(0,10);
  const start = new Date(now); start.setFullYear(start.getFullYear() - 2);
  const startStr = start.toISOString().slice(0,10);

  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${startStr}/${end}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Polygon aggs failed: ${r.status}`);
  const j = await r.json();
  const results = j.results || [];
  return results.map((b: any) => ({
    date: new Date(b.t).toISOString().slice(0,10),
    o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw
  }));
}

export async function writeBarsParquet(ticker: string, bars: Bar[], outDir = "public") {
  if (!bars.length) return;
  const schema = new parquet.ParquetSchema({
    ticker: { type: "UTF8" },
    date: { type: "UTF8" },
    o: { type: "DOUBLE" },
    h: { type: "DOUBLE" },
    l: { type: "DOUBLE" },
    c: { type: "DOUBLE" },
    v: { type: "DOUBLE" },
    vw: { type: "DOUBLE", optional: true }
  });
  const file = path.join(outDir, `${ticker}.parquet`);
  const writer = await parquet.ParquetWriter.openFile(schema, file);
  for (const b of bars) await writer.appendRow({ ticker, ...b });
  await writer.close();
  return file;
}

6) Universe/manifest builder (script)

Create scripts/universe-build.ts:

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import parquet from "parquetjs-lite";
import fetch from "node-fetch";
import { sicToSector, guessSectorBySIC } from "../lib/sic-map";
import { fetchDailyBarsFromPolygon, writeBarsParquet } from "../lib/ingest-bars";

type ManifestRow = {
  ticker: string; name?: string; sic?: string; sector?: string; industry?: string;
  currency?: string; locale?: string; exchange?: string;
  first_date?: string; last_date?: string; records?: number;
  url: string; source: "Local"|"S3";
};

async function getTickerMeta(ticker: string) {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return {};
  const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) return {};
  const { results } = await r.json();
  const sic = results?.sic_code?.toString();
  const mapped = sicToSector[sic] || guessSectorBySIC(sic);
  return {
    name: results?.name,
    currency: results?.currency_name,
    locale: results?.locale,
    exchange: results?.primary_exchange,
    sic,
    sector: mapped?.sector,
    industry: mapped?.industry
  };
}

async function parquetInfoLocal(ticker: string) {
  const file = path.join("public", `${ticker}.parquet`);
  if (!fs.existsSync(file)) return null;
  const reader = await parquet.ParquetReader.openFile(file);
  const cursor = reader.getCursor();
  let row: any, first: any, last: any, count = 0;
  while ((row = await cursor.next())) {
    count++;
    if (count === 1) first = row;
    last = row;
  }
  await reader.close();
  return {
    first_date: first?.date,
    last_date: last?.date,
    records: count,
    url: `/${ticker}.parquet`,
    source: "Local" as const
  };
}

async function main() {
  const seedPath = process.env.TICKER_SEED_CSV || "./data/universe-100.csv";
  const usePolygon = (process.env.USE_POLYGON_FOR_BARS || "false").toLowerCase() === "true";

  const csv = fs.readFileSync(seedPath, "utf8");
  const seed = parse(csv, { columns: true, skip_empty_lines: true }) as {ticker:string}[];

  if (!fs.existsSync("public")) fs.mkdirSync("public");

  const rows: ManifestRow[] = [];
  for (const { ticker } of seed) {
    if (!ticker) continue;

    // create parquet if missing and allowed
    const localBefore = fs.existsSync(path.join("public", `${ticker}.parquet`));
    if (!localBefore && usePolygon) {
      const bars = await fetchDailyBarsFromPolygon(ticker);
      if (bars.length) await writeBarsParquet(ticker, bars, "public");
    }

    const info = await parquetInfoLocal(ticker);
    const meta = await getTickerMeta(ticker);

    rows.push({
      ticker,
      ...meta,
      ...(info || { url: `/${ticker}.parquet`, source: "Local" }),
      ...(info || {})
    });
  }

  // manifest.json for UI
  fs.writeFileSync("public/manifest.json", JSON.stringify({
    version: 1,
    source: "local",
    asOf: new Date().toISOString(),
    tickers: rows
  }, null, 2));

  // manifest.parquet for warehouse
  const schema = new parquet.ParquetSchema({
    ticker: { type: "UTF8" },
    name: { type: "UTF8", optional: true },
    sic: { type: "UTF8", optional: true },
    sector: { type: "UTF8", optional: true },
    industry: { type: "UTF8", optional: true },
    currency: { type: "UTF8", optional: true },
    locale: { type: "UTF8", optional: true },
    exchange: { type: "UTF8", optional: true },
    first_date: { type: "UTF8", optional: true },
    last_date: { type: "UTF8", optional: true },
    records: { type: "INT64", optional: true },
    url: { type: "UTF8" },
    source: { type: "UTF8" }
  });
  const writer = await parquet.ParquetWriter.openFile(schema, "public/manifest.parquet");
  for (const r of rows) await writer.appendRow(r);
  await writer.close();

  console.log(`Manifest built for ${rows.length} tickers`);
}

main().catch(e => { console.error(e); process.exit(1); });


Add npm deps:

// package.json (ensure these are present)
"dependencies": {
  "csv-parse": "^5.5.6",
  "node-fetch": "^3.3.2",
  "parquetjs-lite": "^0.19.0"
}

7) /api/index with filters (read Parquet only)

Overwrite app/api/index/route.ts:

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const sector = url.searchParams.get("sector") || "";
    const industry = url.searchParams.get("industry") || "";
    const limit = parseInt(url.searchParams.get("limit") || "200", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const raw = fs.readFileSync("public/manifest.json", "utf8");
    const manifest = JSON.parse(raw);
    let list = manifest.tickers as any[];

    list = list.filter(x =>
      (!q || (x.ticker?.toLowerCase().includes(q) || x.name?.toLowerCase().includes(q))) &&
      (!sector || x.sector === sector) &&
      (!industry || x.industry === industry)
    );

    const total = list.length;
    list = list.slice(offset, offset + limit);

    return NextResponse.json({ ok: true, manifest: { ...manifest, tickers: list, total } });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

8) /api/local-data (unchanged behavior, Parquet only)

Ensure it reads public/{ticker}.parquet and returns a date-sliced array. If needed, add/overwrite app/api/local-data/route.ts:

import { NextRequest, NextResponse } from "next/server";
import parquet from "parquetjs-lite";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get("ticker") || "AAPL";
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    const file = path.join(process.cwd(), "public", `${ticker}.parquet`);
    if (!fs.existsSync(file)) return NextResponse.json({ ok: true, ticker, rows: [] });

    const reader = await parquet.ParquetReader.openFile(file);
    const cursor = reader.getCursor();
    const out:any[] = [];
    let r:any;
    while ((r = await cursor.next())) {
      const d = r.date;
      if (start && d < start) continue;
      if (end && d > end) continue;
      out.push(r);
    }
    await reader.close();

    return NextResponse.json({ ok: true, ticker, rows: out });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

9) /api/strategy/run — multi-ticker

Overwrite app/api/strategy/run/route.ts (keeps your existing backtest engine; just loops tickers):

import { NextRequest, NextResponse } from "next/server";
import parquet from "parquetjs-lite";
import path from "path";
import fs from "fs";
// import your existing runBacktest & DSL types:
import { runBacktest, type StrategyDSL } from "@/lib/strategy-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readBars(ticker: string, start?: string, end?: string) {
  const file = path.join(process.cwd(), "public", `${ticker}.parquet`);
  if (!fs.existsSync(file)) return [];
  const reader = await parquet.ParquetReader.openFile(file);
  const cursor = reader.getCursor();
  const rows:any[] = [];
  let r:any;
  while ((r = await cursor.next())) {
    const d = r.date;
    if (start && d < start) continue;
    if (end && d > end) continue;
    rows.push(r);
  }
  await reader.close();
  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tickers: string[] = body.tickers?.length ? body.tickers : [ body.ticker || "AAPL" ];
    const start = body.startDate;
    const end = body.endDate;

    if (body.code) {
      // ML path (optional): you can no-op or keep your existing python runner.
      return NextResponse.json({ ok: false, error: "ML runner not enabled in this build" }, { status: 400 });
    }

    const dsl: StrategyDSL = body.dsl;
    const perTicker:any[] = [];
    for (const t of tickers) {
      const bars = await readBars(t, start, end);
      const res = runBacktest(dsl, bars);
      perTicker.push({ ticker: t, stats: res.stats, trades: res.trades });
    }

    // simple equal-weighted summary (avg of stats that are numeric)
    const summary:any = {};
    const numericKeys = new Set<string>();
    for (const pt of perTicker) {
      for (const [k, v] of Object.entries(pt.stats||{})) {
        if (typeof v === "number") numericKeys.add(k);
      }
    }
    for (const k of numericKeys) {
      const vals = perTicker.map(pt => Number(pt.stats?.[k] ?? 0));
      summary[k] = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    }

    return NextResponse.json({ ok: true, summary, perTicker, logs: [] });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

10) /app/data/page.tsx — searchable grid

Overwrite with:

"use client";
import React, { useEffect, useState } from "react";

type Row = { ticker:string; name?:string; sector?:string; industry?:string; first_date?:string; last_date?:string; records?:number; url:string; source:string };
export default function DataPage(){
  const [rows,setRows] = useState<Row[]>([]);
  const [q,setQ]=useState(""); const [sector,setSector]=useState(""); const [industry,setIndustry]=useState("");
  const [sectors,setSectors]=useState<string[]>([]); const [industries,setIndustries]=useState<string[]>([]);

  async function load(){
    const u = new URL("/api/index", window.location.origin);
    if(q) u.searchParams.set("q", q);
    if(sector) u.searchParams.set("sector", sector);
    if(industry) u.searchParams.set("industry", industry);
    const r = await fetch(u); const j = await r.json();
    if(j.ok){
      setRows(j.manifest.tickers || []);
      const all = j.manifest.tickersFull || j.manifest.tickers || [];
      const secs = Array.from(new Set((all as Row[]).map(x=>x.sector).filter(Boolean))) as string[];
      const inds = Array.from(new Set((all as Row[]).map(x=>x.industry).filter(Boolean))) as string[];
      setSectors(secs.sort()); setIndustries(inds.sort());
    }
  }
  useEffect(()=>{ load(); },[]);
  useEffect(()=>{ load(); /* reload on filter */ },[q,sector,industry]);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Data Explorer</h1>
      <div className="flex gap-3 mb-4">
        <input className="bg-black/60 border border-neutral-700 rounded px-3 py-2 w-64" placeholder="Search ticker or name" value={q} onChange={e=>setQ(e.target.value)} />
        <select className="bg-black/60 border border-neutral-700 rounded px-3 py-2" value={sector} onChange={e=>setSector(e.target.value)}>
          <option value="">All Sectors</option>
          {sectors.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select className="bg-black/60 border border-neutral-700 rounded px-3 py-2" value={industry} onChange={e=>setIndustry(e.target.value)}>
          <option value="">All Industries</option>
          {industries.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-neutral-400">
            <tr>
              <th className="text-left p-2">Ticker</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Sector</th>
              <th className="text-left p-2">Industry</th>
              <th className="text-left p-2">Records</th>
              <th className="text-left p-2">First</th>
              <th className="text-left p-2">Last</th>
              <th className="text-left p-2">Source</th>
              <th className="text-left p-2">Download</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.ticker} className="border-t border-neutral-800">
                <td className="p-2 font-semibold">{r.ticker}</td>
                <td className="p-2">{r.name || "-"}</td>
                <td className="p-2">{r.sector || "-"}</td>
                <td className="p-2">{r.industry || "-"}</td>
                <td className="p-2">{r.records ?? "-"}</td>
                <td className="p-2">{r.first_date || "-"}</td>
                <td className="p-2">{r.last_date || "-"}</td>
                <td className="p-2">{r.source}</td>
                <td className="p-2"><a className="underline" href={r.url} download>parquet</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

11) /app/strategy/page.tsx — multi-ticker input (Parquet only)

Overwrite with a simple multi-ticker runner (rule DSL only; ML optional later):

"use client";
import React, { useMemo, useState } from "react";

export default function StrategyLab() {
  const [tickersText,setTickersText]=useState("AAPL,MSFT,GOOGL");
  const [start,setStart]=useState("2024-01-02");
  const [end,setEnd]=useState("2025-09-19");
  const [dslText,setDslText]=useState(JSON.stringify({
    name:"MACD Crossover",
    rules:[{type:"macd_cross", params:{fast:12, slow:26, signal:9}, enter:"long", exit:"long"}]
  },null,2));
  const [result,setResult]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const tickers = useMemo(()=>tickersText.split(/[,\s]+/).map(t=>t.trim()).filter(Boolean),[tickersText]);

  async function run(){
    setLoading(true); setResult(null);
    try{
      const r = await fetch("/api/strategy/run", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          tickers,
          startDate:start,
          endDate:end,
          dsl: JSON.parse(dslText)
        })
      });
      const j = await r.json();
      if(!j.ok) throw new Error(j.error || "Run failed");
      setResult(j);
    }catch(e:any){ alert(e.message); }
    finally{ setLoading(false); }
  }

  return (
    <div className="p-6 text-white space-y-4">
      <h1 className="text-2xl font-bold">Strategy Lab (Parquet-only)</h1>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm mb-1 opacity-80">Tickers (comma/space/CSV)</label>
          <textarea className="w-full h-24 bg-black/60 border border-neutral-700 rounded p-2"
            value={tickersText} onChange={e=>setTickersText(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1 opacity-80">Start</label>
          <input type="date" className="w-full bg-black/60 border border-neutral-700 rounded p-2"
            value={start} onChange={e=>setStart(e.target.value)} />
          <label className="block text-sm mb-1 opacity-80 mt-3">End</label>
          <input type="date" className="w-full bg-black/60 border border-neutral-700 rounded p-2"
            value={end} onChange={e=>setEnd(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1 opacity-80">Strategy DSL (JSON)</label>
          <textarea className="w-full h-40 bg-black/60 border border-neutral-700 rounded p-2 font-mono text-xs"
            value={dslText} onChange={e=>setDslText(e.target.value)} />
        </div>
      </div>
      <button disabled={loading} onClick={run} className="px-4 py-2 bg-blue-600 rounded disabled:opacity-50">
        {loading ? "Running..." : "Run Backtest"}
      </button>
      {result && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold mt-4">Summary</h2>
          <pre className="bg-black/60 border border-neutral-700 rounded p-3 overflow-auto">{JSON.stringify(result.summary,null,2)}</pre>
          <h2 className="text-xl font-semibold">Per Ticker</h2>
          <pre className="bg-black/60 border border-neutral-700 rounded p-3 overflow-auto">{JSON.stringify(result.perTicker,null,2)}</pre>
        </div>
      )}
    </div>
  );
}

12) Dashboard link fix (optional)

Ensure /dashboard links to /data and /strategy correctly. If needed, update nav buttons.

13) Package scripts

Add NPM scripts in package.json:

"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "universe:build": "tsx scripts/universe-build.ts"
}

DONE (Claude)