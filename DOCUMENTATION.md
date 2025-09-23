# DOCUMENTATION.md

# AI Backtester — Technical Documentation

## 1. Purpose & Scope

Deliver a web UI that:
- Lists available tickers from **S3**
- Lets users **prompt** an AI to generate a **DSL** strategy
- Runs **backtests** on OHLCV time series (Parquet in S3)
- Visualizes **price** and **equity curves**
- (Future) Supports **ML strategies** via Python

Polygon is optional (for periodic refresh); day-to-day operation uses S3 data only.

## 2. System Overview

Flow:

- S3 (Parquet + `index.json`)  
  → Next.js 14 API routes (Node runtime)  
  → UI pages (Dashboard, Backtester, Data Explorer)

Key invariants:

- No local filesystem reads for datasets
- HTTP(S) fetch from S3 using `S3_BASE`
- Manifest (`index.json`) is the catalog of tickers
- Normalization converts raw Parquet rows into `{date, open, high, low, close, volume}` for engine/UI

## 3. Data Model & Normalization

Source of truth: Parquet files in `s3://ai-backtester-data-rosh/prod/`.

Manifest: `index.json` with fields:

- `asOf`: ISO timestamp when manifest generated
- `source`: `s3://bucket/prefix/`
- `tickers`: array of ticker symbols

Normalized row shape:

- `date`: ISO string `YYYY-MM-DD` (or Date)
- `open|high|low|close|volume`: JS numbers

Schema flexibility (critical):

- Aliases:
    - open: `open | o | OpenPrice | openPrice`
    - high: `high | h | HighPrice | highPrice`
    - low:  `low  | l | LowPrice  | lowPrice`
    - close:`close| c | ClosePrice | closePrice`
    - vol:  `volume| v | Volume | tradedVolume`
- DECIMAL/scale handling:
    - If values are stored as scaled ints (e.g., DECIMAL(10,2), Int64 with `scale=2`), divide by `10^scale`
- BigInt/Int64:
    - Convert to JS `number` with care; if range is huge, consider `Number()` or decimal helpers
- Date:
    - Accept ISO string, epoch millis, or vendor key `t`/`timestamp`
- Invalid rows:
    - Do **not** coerce to 0; skip or throw (prefer skipping with a warning) to avoid flat-line charts

Recommendation: keep a single `normalizeRow(row)` used by Parquet and CSV loaders to ensure consistency.

## 4. APIs (Node Runtime)

- `GET /api/health`  
  Returns `{ ok: true, status: 200 }` if `S3_BASE/index.json` is reachable.

- `GET /api/index`  
  Returns manifest `{ tickers, asOf, source }`.

- `GET /api/local-data?ticker=XYZ&start=YYYY-MM-DD&end=YYYY-MM-DD`  
  Loads `S3_BASE/XYZ.parquet` (or `.csv` fallback), normalizes rows, date-filters, returns JSON.

- `POST /api/strategy/generate`  
  Body: `{ "prompt": "string" }`  
  Returns: `{ "dsl": { name, rules:[...] } }` using `OPENAI_API_KEY`/`OPENAI_MODEL`.

- `POST /api/strategy/run`  
  Body:

        {
          "mode": "dsl" | "ml",
          "tickers": ["AAPL", "..."],
          "startDate": "YYYY-MM-DD",
          "endDate": "YYYY-MM-DD",
          "dsl": { "name": "...", "rules": [...] },   // when mode = "dsl"
          "code": "..."                                // when mode = "ml" (future)
        }

  Returns:

        {
          "ok": true,
          "results": [
            {
              "ticker": "AAPL",
              "stats": { "totalReturnPct": 42.1, "winRatePct": 58.3, "trades": 21, ... },
              "equity": [{ "date": "YYYY-MM-DD", "value": 100000 }, ...],
              "signals": [{ "date": "YYYY-MM-DD", "type": "buy|sell" }, ...]
            }
          ]
        }

## 5. Strategy Engine (DSL)

Indicators: SMA, EMA, RSI, MACD.

Rules:
- `sma_cross` / `ema_cross` with `fast/slow`, enter on `fast_above`, exit on `fast_below`
- `rsi_threshold` (enter `< 30`, exit `> 70`, configurable)
- `macd_cross` (signal cross, histogram sign)

Execution (per ticker):
- Load normalized rows
- Compute indicators
- Iterate over time, manage long/flat state, record trades
- Produce equity series, trade list, and summary stats

## 6. Frontend Pages

- `/dashboard`
    - Loads `/api/index`, shows ticker count and quick info
    - Selecting a ticker loads `/api/local-data` and renders a price chart + small stats

- `/backtester`
    - Textarea for prompt → `/api/strategy/generate` → DSL JSON
    - Allows manual DSL editing
    - Runs `/api/strategy/run`, shows equity curve, trades, metrics

- `/data-explorer`
    - Lists all tickers from manifest
    - Optional filters (sector/industry) if present in manifest metadata

## 7. Scripts

- `scripts/build-manifest.ts`
    - Scans `s3://AWS_BUCKET/AWS_PREFIX/` for ticker files
    - Writes `index.json` back into the prefix (no ACLs; compatible with Object Ownership: Bucket owner enforced)
    - Re-run whenever adding more Parquet datasets

## 8. Environment & Deployment

Local: `.env.local` (already present; keep unchanged)

- Required:

        AWS_BUCKET=ai-backtester-data-rosh
        AWS_REGION=us-east-1
        AWS_PREFIX=prod
        S3_BASE=https://ai-backtester-data-rosh.s3.amazonaws.com/prod
        OPENAI_API_KEY=sk-...
        OPENAI_MODEL=gpt-4o-mini
        NEXT_PUBLIC_APP_URL=http://localhost:3000   # or your prod URL on Vercel

Vercel:
- Add the same vars in Project Settings → Environment Variables (Production + Preview)
- APIs must run on Node runtime (already configured)

## 9. Current Status / Known Issues

- S3 manifest + data loading works for AAPL and most tickers
- Flat-line at 0 for some tickers (e.g., ABBV):
    - Cause: normalization gaps (aliases, DECIMAL scale, BigInt) → values defaulting to 0
    - Fix: robust `normalizeRow` (see §3), skip invalid rows, add unit tests with representative schema
- Vercel build “stream did not contain valid UTF-8” for `app/.../page.tsx`:
    - Fix by re-saving files as UTF-8 LF and adding `.gitattributes` (`* text=auto eol=lf`)
- ML strategies: scaffold present; execution disabled in serverless paths; integrate Python service when ready

## 10. Operability (Runbooks)

Regenerate manifest:

- Ensure env set (locally `.env.local` or shell)
- Run:

        npm run build:manifest

Validate manifest & data:

- Check:

        curl.exe "$env:S3_BASE/index.json" | Select-Object -First 40

- Check a ticker:

        curl.exe "http://localhost:3000/api/local-data?ticker=ABBV&start=2023-01-01&end=2024-12-31" | Select-Object -First 20

Verify OpenAI DSL path:

- Generate:

        POST /api/strategy/generate  { "prompt": "Buy when 14-day RSI < 30; sell when RSI > 70" }

- Run:

        POST /api/strategy/run  with mode="dsl" and returned dsl

Deploy to Vercel:

- Push to main; add environment vars; redeploy; verify `/api/health` and `/api/index`.

## 11. Extensibility

- Indicators: add BBANDS/ATR/ADX
- Asset universe: extend manifest with sector/industry and filter UI
- Security: switch to presigned URLs if bucket becomes private
- Scale: windowed reads, pagination, caching for large Parquet files
- ML: add Python microservice (FastAPI/Lambda/Modal) to run models

## 12. Appendix — Parquet Normalization Checklist

- Map all common aliases for OHLCV
- If a field is DECIMAL with `scale`, divide raw value by `10^scale`
- Convert BigInt/Int64 to number carefully
- Parse date from ISO or epoch; skip invalid rows
- Do not silently set missing values to 0
- Add tests with a fixture mirroring ABBV schema to prevent regressions
