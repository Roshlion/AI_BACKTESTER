# Claude Instructions

## Project Overview
AI Backtester - A trading strategy backtesting application built with Next.js

## Commands
- Build: `npm run build`
- Dev: `npm run dev`
- Lint: `npm run lint`
- Test: `npm test`

## Code Style
- TypeScript preferred
- Follow existing patterns in the codebase
- Use meaningful variable names
- Keep functions focused and small

## Project Structure
- `/app` - Next.js app router pages and API routes
- `/lib` - Shared utilities and business logic
- `/types` - TypeScript type definitions
- `/scripts` - Build and utility scripts

## Dependencies
- Next.js
- React
- TypeScript
- Parquet data processing

## Notes
- Uses parquet files for historical data storage
- Local data integration for backtesting
- Strategy engine for trading logic

## Testing
- Run tests before committing changes
- Ensure all type checks pass

## Additional Information
CLAUDE.md — Implementation plan for AI_BACKTESTER

Goal: Fix “Flat Files” mode so it actually pulls Polygon’s S3 CSV.gz day aggregates, parses them, and feeds our JSON. Keep current REST mode as-is. Ensure smoke passes with 2+ tickers. Leave secrets only in .env.local (do not commit).

🔐 The user will place credentials in .env.local. Do not hardcode or commit secrets.
✅ Invariants: Next API routes export runtime="nodejs", dynamic="force-dynamic", and never use fs (only fetch/safe loader). Manifest contract unchanged.

0) Dependencies

Edit package.json

  "dependencies": {
+   "@aws-sdk/client-s3": "^3.616.0",
    "fs-extra": "^11.2.0",
    ...
  }


Run (handled by the user later):

npm i @aws-sdk/client-s3

1) Env vars (do not commit secrets)

Create/append .env.local (local only; do not commit):

# REST (already used elsewhere)
POLYGON_API_KEY=REPLACE_WITH_YOUR_REST_API_KEY

# Flat Files S3 credentials from Polygon dashboard
POLYGON_FLATFILES_KEY=REPLACE_WITH_YOUR_S3_ACCESS_KEY_ID
POLYGON_FLATFILES_SECRET=REPLACE_WITH_YOUR_S3_SECRET
POLYGON_S3_ENDPOINT=https://files.polygon.io
POLYGON_S3_BUCKET=flatfiles


The user has provided:

Access Key ID: 1a55676b-ddac-4137-a70f-aa2780ea5b41

Secret Access Key: u0Y1BDQsFRJnZGPp8TlsH4LT7nBF8o8t

Endpoint: https://files.polygon.io

Bucket: flatfiles
The REST API key is the same string the user uses elsewhere. Do not hardcode; read from .env.local.
Also: advise the user to rotate keys after setup since they were shared in chat.

2) Implement true S3 Flat Files in the fetcher

File: scripts/fetch-polygon-to-parquet.mjs
What to change: Replace the current “Flat Files” branch (which hits /v1/open-close) with S3 CSV.gz reading for dataset us_stocks_sip/day_aggs_v1/YYYY/MM/YYYY-MM-DD.csv.gz. Filter rows by ticker in CSV.

a) Add imports at the top
 import { fileURLToPath } from 'url';
 import { dirname, join } from 'path';
 import fs from 'fs-extra';
+import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
+import zlib from 'zlib';
+import readline from 'node:readline';

b) Add S3 client factory & helpers (place near existing helpers)
function getS3Client() {
  const endpoint = process.env.POLYGON_S3_ENDPOINT || 'https://files.polygon.io';
  const accessKeyId = process.env.POLYGON_FLATFILES_KEY;
  const secretAccessKey = process.env.POLYGON_FLATFILES_SECRET;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Flat Files credentials missing: set POLYGON_FLATFILES_KEY and POLYGON_FLATFILES_SECRET in .env.local');
  }
  return new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function pick(obj, names) {
  for (const n of names) if (obj[n] != null && obj[n] !== '') return obj[n];
  return undefined;
}

// Normalize columns across flat-file variants
function mapCsvRow(obj) {
  const ticker = String(pick(obj, ['ticker', 'symbol']) ?? '').toUpperCase();

  // window_start might be epoch-ns; day/date is ISO; normalize to YYYY-MM-DD
  let iso = '';
  const ws = pick(obj, ['window_start', 'day', 'date']);
  if (ws) {
    if (/^\d{13,}$/.test(String(ws))) {
      const ms = String(ws).length > 13 ? Number(String(ws).slice(0, 13)) : Number(ws);
      iso = new Date(ms).toISOString().slice(0, 10);
    } else {
      iso = String(ws).slice(0, 10);
    }
  }
  const ts = Date.parse(iso ? `${iso}T16:00:00Z` : (pick(obj, ['timestamp']) ?? 0));

  const open = Number(pick(obj, ['open', 'o']));
  const high = Number(pick(obj, ['high', 'h']));
  const low = Number(pick(obj, ['low', 'l']));
  const close = Number(pick(obj, ['close', 'c']));
  const volume = Number(pick(obj, ['volume', 'v']));
  const vwap = pick(obj, ['vwap', 'vw']);
  const transactions = pick(obj, ['transactions', 'n']);

  return {
    ticker,
    date: iso,
    timestamp: ts,
    open, high, low, close, volume,
    vwap: vwap != null ? Number(vwap) : undefined,
    transactions: transactions != null ? Number(transactions) : undefined,
  };
}

async function listDayAggKeys(s3, startDate, endDate) {
  const bucket = process.env.POLYGON_S3_BUCKET || 'flatfiles';
  // Data set path: us_stocks_sip/day_aggs_v1/YYYY/MM/2024-01-03.csv.gz
  const keys = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (monthCursor <= end) {
    const y = monthCursor.getFullYear();
    const m = String(monthCursor.getMonth() + 1).padStart(2, '0');
    const Prefix = `us_stocks_sip/day_aggs_v1/${y}/${m}/`;

    let ContinuationToken;
    do {
      const out = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken }));
      for (const obj of out.Contents ?? []) {
        const key = obj.Key ?? '';
        const mDate = key.match(/(\d{4}-\d{2}-\d{2})\.csv\.gz$/);
        if (!mDate) continue;
        const date = mDate[1];
        if (date >= startDate && date <= endDate) keys.push({ key, date });
      }
      ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (ContinuationToken);

    monthCursor.setMonth(monthCursor.getMonth() + 1, 1);
  }

  keys.sort((a, b) => a.date.localeCompare(b.date));
  return keys;
}

c) Replace the current downloadFlatFileData(...) with S3 CSV.gz parsing
// True Flat Files fetcher via S3 (day aggregates)
async function downloadFlatFileData(_apiKey, ticker, startDate, endDate, options = {}) {
  const { limitPerTicker } = options;
  const want = new Set([String(ticker).toUpperCase()]);
  const s3 = getS3Client();
  const bucket = process.env.POLYGON_S3_BUCKET || 'flatfiles';

  const keys = await listDayAggKeys(s3, startDate, endDate);
  if (!keys.length) throw new Error('No files in Flat Files for requested range');

  const out = [];
  for (const { key } of keys) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const gunzip = zlib.createGunzip();
    const rl = readline.createInterface({ input: obj.Body.pipe(gunzip), crlfDelay: Infinity });

    let header = null;
    for await (const line of rl) {
      if (!line) continue;
      if (!header) { header = line.split(','); continue; }
      const cols = line.split(',');
      const rowObj = Object.fromEntries(header.map((h, i) => [h, cols[i]]));
      const mapped = mapCsvRow(rowObj);
      if (mapped.ticker && want.has(mapped.ticker) && mapped.date) {
        out.push(mapped);
        if (limitPerTicker && out.length >= limitPerTicker) break;
      }
    }
    if (limitPerTicker && out.length >= limitPerTicker) break;
    await sleep(50); // tiny politeness pause
  }

  if (!out.length) throw new Error('No data available via Flat Files');

  // Sort + de-dup by timestamp
  out.sort((a, b) => a.timestamp - b.timestamp);
  const uniq = Array.from(new Map(out.map(r => [r.timestamp, r])).values())
                    .sort((a, b) => a.timestamp - b.timestamp);

  console.log(`✓ ${ticker}: Flat Files returned ${uniq.length} bars`);
  return uniq;
}


Leave fetchPolygonBarsWithRetry (REST) as-is.
In mode=flat, never fallback to REST; in mode=auto, try flat then REST (current behavior).

3) Minor smoke improvement (if not already done)

File: scripts/vercel-smoke.mjs
Use the proper manifest shape.

- if (endpoint.name === 'Index (Manifest)' && parsedResponse.ok) {
-   const tickerCount = parsedResponse.tickers ? parsedResponse.tickers.length : 0;
+ if (endpoint.name === 'Index (Manifest)' && parsedResponse.ok) {
+   const tickerCount = parsedResponse.manifest?.tickers?.length ?? 0;


Keep your earlier fixes to /api/strategy/test and the batch warning logic.

4) Commit messages

feat(data): add Polygon S3 Flat Files support (day_aggs_v1) with CSV.gz parsing

chore(smoke): read ticker count from manifest

docs: .env keys for Flat Files S3