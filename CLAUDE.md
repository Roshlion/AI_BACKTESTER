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

## Additional Instructions
1) Prompt to send to Claude

Title: Expand to 100 tickers, 3-year data, manifest-first, public mode, future Blob-ready

Context:
Repo: AI_BACKTESTER (Next.js 14, TypeScript). We already have:

lib/safeParquet.ts helper

manifest-based endpoints (/api/index, /api/local-data, /api/local-batch, /api/strategy/*)

scripts: fetch-polygon-to-parquet.mjs, generate-manifest.mjs, copy-to-public.mjs, vercel-smoke.mjs, and a scaffold blob-upload.mjs

public fallback: /public/data/*.parquet + /public/manifest.json

future dual-mode support with PARQUET_URL (Blob manifest)

Goal: Get us to a working prototype with ~100 tickers and ~3 years of OHLCV in Parquet under public/data, all driven by a manifest. Keep it fast, resumable, and easy to expand. Do not wire Blob yet (just keep the code ready).

A. Data list

Create data/tickers/sp100.txt containing 100 symbols (S&P-100 style list). One ticker per line, UPPERCASE, e.g.:

AAPL
MSFT
GOOGL
AMZN
NVDA
META
TSLA
AVGO
COST
AMD
INTC
TXN
IBM
ORCL
CRM
NFLX
PEP
KO
WMT
MRK
ABBV
...


(Fill to 100; avoid duplicates. It doesn’t need to be perfect; just a reasonable large-cap set.)

Update scripts/fetch-polygon-to-parquet.mjs to accept either:

--tickers=AAPL,MSFT,...

or --tickers-file=./data/tickers/sp100.txt

Add flags:

--years=3 (derives start = today-3y, end = today) if --start/--end absent

--bar=day (default day)

--limit-per-ticker=N (optional cap on bars for testing)

Fetch logic (Polygon aggregates v2):

respect process.env.POLYGON_API_KEY (error if missing)

throttle: concurrency ≤ 3; exponential backoff on 429/5xx

resume-safe: if ./data/parquet-final/TICKER.parquet exists and covers last date, only fetch missing tail

write clean Parquet with a consistent schema:

ticker (string)
date (string, YYYY-MM-DD)
timestamp (number, ms)
open (number)
high (number)
low (number)
close (number)
volume (number)
vwap (number?) optional
transactions (number?) optional


ensure sorted ascending by timestamp before write

log a compact per-ticker summary: firstDate → lastDate, records

Keep output under ./data/parquet-final/TICKER.parquet (overwrite safe).

B. Manifest generation

Keep your new real analyzer in scripts/generate-manifest.mjs (parquetjs-lite).

Add flags:

--limit=100 (keeps only first N tickers)

--from=./data/parquet-final (input dir)

--out=./public/manifest.json

--source=public (default) or blob (future)

Output format (unchanged):

{
  "version": 1,
  "source": "public",
  "asOf": "2025-09-21T00:00:00.000Z",
  "tickers": [
    { "ticker": "AAPL", "path": "/data/AAPL.parquet", "firstDate": "2022-09-21", "lastDate": "2025-09-20", "records": 754 },
    ...
  ]
}


If --source=blob, keep path as placeholder (__BLOB_URL__/AAPL.parquet)—we’ll fill later in the Blob uploader.

C. Staging to public/

Ensure scripts/copy-to-public.mjs:

reads ./public/manifest.json

creates ./public/data

copies only tickers listed in manifest from ./data/parquet-final to ./public/data (preserve names)

supports --clean=1 to clear public/data first

prints a summary table

Do not exceed ~40–60 MB in repo; if 100 tickers is >100 MB, adjust --limit to 40–60 for public mode. (We’ll move the full set to Blob later.)

D. API + UI sanity

Verify /api/index loads the manifest and returns the list + coverage.

Verify /api/local-data and /api/local-batch use safeParquet + manifest lookup.

In /app/api-tester/page.tsx, add two presets:

Index → GET /api/index

Batch (multi) → POST /api/local-batch with a JSON example using 3–5 symbols from the manifest and a range inside their coverage.

E. Scripts & npm tasks

Update/confirm package.json scripts:

{
  "scripts": {
    "data:fetch": "node scripts/fetch-polygon-to-parquet.mjs",
    "data:manifest": "node scripts/generate-manifest.mjs",
    "data:stage": "node scripts/copy-to-public.mjs",
    "smoke": "node scripts/vercel-smoke.mjs"
  }
}


Ensure vercel-smoke.mjs tests:

GET /api/index (expect tickers length ≥ 50 if limit 100 but staged fewer; at least > 1)

GET /api/local-data?mode=metadata&ticker=AAPL

POST /api/local-batch with 3–5 tickers from manifest

GET /api/strategy/test

F. Guardrails

No fs in API routes (serverless-safe)

Keep export const runtime='nodejs'; export const dynamic='force-dynamic';

No secrets in next.config.js

All env only via process.env.* on server

All responses { ok: true|false, ... }

G. Output deliverables (commit-ready)

data/tickers/sp100.txt (100 symbols)

Updated scripts/fetch-polygon-to-parquet.mjs (years, tickers-file, throttle, resume)

Updated scripts/generate-manifest.mjs (real analyzer, limit=100)

Updated scripts/copy-to-public.mjs (clean flag, summary)

Updated app/api-tester/page.tsx (presets)

Confirmed package.json scripts

Leave a short section in CLAUDE.md describing how to use the new flags

Please make these changes now, self-test build (npm run build) and leave a short “what changed” summary I can paste back to the team.
If any heavy dependencies are added, keep them dev-only where possible and avoid bloating serverless bundles.

End of prompt.

## 100-Ticker Data Pipeline Usage

### Data Fetching
```bash
# Fetch 3 years of data for all 100 tickers
npm run data:fetch -- --tickers-file=./data/tickers/sp100.txt --years=3

# Fetch specific tickers only
npm run data:fetch -- --tickers=AAPL,MSFT,GOOGL --years=2

# Test with limited data
npm run data:fetch -- --tickers=AAPL,MSFT --years=1 --limit-per-ticker=100
```

### Manifest Generation
```bash
# Generate manifest for public deployment (default limit 100)
npm run data:manifest

# Generate with custom limit for smaller repo size
npm run data:manifest -- --limit=50

# Generate for blob deployment (future)
npm run data:manifest -- --source=blob
```

### Staging to Public
```bash
# Copy files to public/ directory
npm run data:stage

# Clean and copy
npm run data:stage -- --clean=1
```

### Testing
```bash
# Run all endpoint smoke tests
npm run smoke
```

### Full Pipeline Example
```bash
# 1. Fetch data (requires POLYGON_API_KEY)
npm run data:fetch -- --tickers-file=./data/tickers/sp100.txt --years=3

# 2. Generate manifest (adjust limit for repo size)
npm run data:manifest -- --limit=50

# 3. Stage to public
npm run data:stage -- --clean=1

# 4. Test endpoints
npm run smoke

# 5. Deploy to Vercel
```