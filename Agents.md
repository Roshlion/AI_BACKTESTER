Claude/Codex prompt (copy-paste)

You are modifying a Next.js 14 (TS, App Router, RSC) app named AI_BACKTESTER.
Objective: make both local & prod read datasets from S3; fix dashboard “Tickers: 0” by creating and serving prod/index.json; remove any fs reads from API routes; ensure Node runtime where needed.

Known config

S3 bucket: ai-backtester-data-rosh (region: us-east-1)

Prefix: prod

Public GET works for objects like prod/AMD.parquet (200).

prod/index.json does not exist → must be generated.

1) Env layer

Create lib/env.ts:

// lib/env.ts
function req(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const AWS_BUCKET = req("AWS_BUCKET");             // ai-backtester-data-rosh
export const AWS_REGION = process.env.AWS_REGION || "us-east-1";
export const AWS_PREFIX = process.env.AWS_PREFIX || "prod";

// Global endpoint is fine for this bucket:
export const S3_BASE = process.env.S3_BASE
  || `https://${AWS_BUCKET}.s3.amazonaws.com/${AWS_PREFIX}`;


README: document required envs:

AWS_BUCKET=ai-backtester-data-rosh
AWS_REGION=us-east-1
AWS_PREFIX=prod
S3_BASE=https://ai-backtester-data-rosh.s3.amazonaws.com/prod
NEXT_PUBLIC_APP_URL=http://localhost:3000
POLYGON_API_KEY=<if used by server code>

2) Manifest API (Node runtime)

Replace app/api/index/route.ts:

import { NextResponse } from "next/server";
import { S3_BASE } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = `${S3_BASE}/index.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `manifest fetch failed: ${res.status}`, tickers: [], source: url, asOf: null },
        { status: 502 }
      );
    }
    const j = await res.json();
    const tickers = Array.isArray(j?.tickers) ? j.tickers : [];
    return NextResponse.json({
      tickers,
      asOf: j?.asOf ?? null,
      source: j?.source ?? url
    });
  } catch (e:any) {
    return NextResponse.json({ error: String(e), tickers: [] }, { status: 500 });
  }
}

3) Dashboard no-cache

Edit app/dashboard/page.tsx to fetch /api/index with no-store and show counts safely:

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let manifest: any = { tickers: [], asOf: null, source: null, error: null };
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/index`, { cache: "no-store" });
    manifest = res.ok ? await res.json() : { tickers: [], error: `HTTP ${res.status}` };
  } catch (e:any) {
    manifest = { tickers: [], error: String(e) };
  }

  const count = Array.isArray(manifest.tickers) ? manifest.tickers.length : 0;

  return (
    <main className="p-6">
      <h1>Dashboard</h1>
      <p>Tickers: {count}</p>
      <p>Source: {manifest.source ?? "S3"}</p>
      <p>As of: {manifest.asOf ?? "unknown"}</p>
      {manifest.error ? <p style={{color:"crimson"}}>Error: {manifest.error}</p> : null}
    </main>
  );
}

4) S3-fetch loaders (no fs in API routes)

Update any ingestion that reads local files to use HTTP fetch from S3:

In lib/ingest-bars.ts (CSV) add:

import { S3_BASE } from "@/lib/env";

export async function loadCsv(symbol: string) {
  const url = `${S3_BASE}/datasets/${symbol}.csv`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV fetch failed ${res.status} for ${symbol}`);
  const text = await res.text();
  // parse to timeseries...
  return parseCsvToBars(text);
}


For Parquet in any server code or API route, ensure Node runtime and:

import { S3_BASE } from "@/lib/env";
// import a parquet reader that accepts Buffer/Uint8Array (e.g., parquet-wasm/parquets)
export async function loadParquet(symbol: string) {
  const url = `${S3_BASE}/${symbol}.parquet`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Parquet fetch failed ${res.status} for ${symbol}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // decode parquet to rows
  const rows = await parseParquet(buf);
  return normalizeRows(rows);
}


In all affected API routes (e.g., app/api/strategy/run/route.ts) add:

export const runtime = "nodejs";

5) Manifest builder script (local, then upload to S3)

Add scripts/build-manifest.ts:

/**
 * Build a manifest by listing S3 objects under PREFIX,
 * extract ticker symbols from keys like "prod/AMD.parquet",
 * and upload prod/index.json (public-read).
 *
 * Run locally:  npx tsx scripts/build-manifest.ts
 * Requires AWS CLI creds OR AWS SDK credentials in env.
 */

import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";

const AWS_BUCKET = process.env.AWS_BUCKET!;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_PREFIX = process.env.AWS_PREFIX || "prod";

async function main() {
  if (!AWS_BUCKET) throw new Error("AWS_BUCKET env required");

  const s3 = new S3Client({ region: AWS_REGION });

  const tickers = new Set<string>();
  let ContinuationToken: string | undefined = undefined;

  do {
    const out = await s3.send(new ListObjectsV2Command({
      Bucket: AWS_BUCKET,
      Prefix: AWS_PREFIX + "/",
      ContinuationToken,
      MaxKeys: 1000,
    }));
    (out.Contents || []).forEach(obj => {
      const k = obj.Key || "";
      // accept .parquet or .csv
      const m = k.match(/\/([A-Z0-9\.\-_]+)\.(parquet|csv)$/i);
      if (m) tickers.add(m[1]);
    });
    ContinuationToken = out.NextContinuationToken;
  } while (ContinuationToken);

  const manifest = {
    asOf: new Date().toISOString(),
    source: `s3://${AWS_BUCKET}/${AWS_PREFIX}/`,
    tickers: Array.from(tickers).sort(),
  };

  const body = Buffer.from(JSON.stringify(manifest, null, 2));
  await s3.send(new PutObjectCommand({
    Bucket: AWS_BUCKET,
    Key: `${AWS_PREFIX}/index.json`,
    Body: body,
    ContentType: "application/json",
    ACL: "public-read", // bucket policy already allows GetObject, but this is safe
  }));

  console.log(`Wrote s3://${AWS_BUCKET}/${AWS_PREFIX}/index.json with ${manifest.tickers.length} tickers`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});


Add dev deps if needed in package.json:

{
  "devDependencies": {
    "tsx": "^4.7.0",
    "@aws-sdk/client-s3": "^3.616.0"
  },
  "scripts": {
    "build:manifest": "tsx scripts/build-manifest.ts"
  }
}

6) Health route (optional quick ping)

Add app/api/health/route.ts:

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const r = await fetch(`${process.env.S3_BASE}/index.json`, { cache: "no-store" });
    return new Response(JSON.stringify({ ok: r.ok, status: r.status }), { headers: { "content-type": "application/json"}});
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { headers: { "content-type": "application/json"}, status: 500});
  }
}

7) Acceptance

npm run build passes.

npm run dev → GET /api/index returns JSON with non-empty tickers.

Dashboard shows Tickers: N (N > 0).

No fs reads in API routes.

Parquet/CSV fetching uses HTTP from S3; routes using Parquet are runtime="nodejs".

Create commits/PR accordingly.