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
  → Three-tab shell UI (Dashboard, Strategy Lab, Data Warehouse)

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

- `GET /api/ml/health`
  Proxies health check to ML service at `ML_API_URL/health`.
  Returns: `{ "status": "ok"|"down", "upstream": {...}, "error"?: string }`

- `POST /api/strategy/generate`
  Body (unified for DSL and ML):

        {
          "mode": "dsl" | "ml",
          "tickers": ["AAPL", "MSFT"],           // REQUIRED: array of ticker symbols (>=1)
          "startDate": "YYYY-MM-DD",              // optional
          "endDate": "YYYY-MM-DD",                // optional
          "prompt": "strategy description",       // DSL or ML prompt
          "indicators": {                         // DSL only: indicator config
            "sma": { "periods": [50, 200] },
            "ema": { "periods": [12, 26] },
            "rsi": { "enabled": true, "period": 14 },
            "macd": { "enabled": true, "fast": 12, "slow": 26, "signal": 9 }
          },
          "hyperparams": {                        // ML only: initial hyperparameters
            "n_estimators": 100,
            "max_depth": 10,
            "learning_rate": 0.1
          }
        }

  Returns (DSL mode): `{ "dsl": { name, rules:[...] } }` using `OPENAI_API_KEY`/`OPENAI_MODEL`.
  Returns (ML mode): `{ "code": "python script", "hyperparams": {...} }` via ML service proxy.
  Error: `{ "error": "message" }` with 400/500/501 status.

- `POST /api/strategy/run`
  Body (unified for DSL and ML):

        {
          "mode": "dsl" | "ml",
          "tickers": ["AAPL", "..."],            // REQUIRED: array (>=1)
          "startDate": "YYYY-MM-DD",
          "endDate": "YYYY-MM-DD",
          "dsl": "...",                          // when mode = "dsl": DSL code/config
          "ml": {                                 // when mode = "ml"
            "code": "python script",
            "hyperparams": { "n_estimators": 100, ... }
          }
        }

  Returns (DSL mode):

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

  Returns (ML mode):

        {
          "metrics": { "accuracy": 0.72, "f1": 0.68, "precision": 0.71, "recall": 0.65 },
          "predictions": [
            { "ts": "2024-01-01", "symbol": "AAPL", "y_pred": 1, "prob": 0.62 },
            ...
          ],
          "logs": "Training completed in 3.2s..."  // optional
        }

  Error: `{ "error": "message" }` with 400/500 status.

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

The application uses a three-tab shell layout with consistent navigation.

### Shell Layout (`app/(shell)/layout.tsx`)
- Provides persistent top navigation with three tabs: Dashboard, Strategy Lab, Data Warehouse
- Uses Next.js App Router with proper client-side routing
- Maintains active tab highlighting and consistent theme

### Dashboard (`/dashboard`)
- **Multi-ticker selection**: Full-row highlight selection with search filtering
- **Eye icon navigation**: Click eye icon to deep-link to Data Warehouse (`/explore?symbol=TICKER`)
- **Isolate action**: Context menu to focus on single ticker
- **Indicator configuration**: Toggle SMA/EMA with editable periods (defaults: SMA 50, EMA 20), RSI (14), MACD (12,26,9)
- **Auto date range**: Computes min/max dates from selected tickers' data spans
- **Strategy handoff**: "Create a strategy with this" button stores context in Zustand and navigates to Strategy Lab

### Strategy Lab (`/strategy`)
- **Server→Client pattern**: Server component parses searchParams, passes to StrategyClient in Suspense
- **DSL & ML Mode Toggle**: Switch between rule-based DSL and ML-powered strategies
  - DSL mode: Natural language → OpenAI → executable DSL rules
  - ML mode: Prompt → ML service (`/ml/generate`) → Python code + hyperparameters
- **ML Health Monitoring**:
  - Real-time badge polls `/api/ml/health` every 30s
  - Shows "ML online/offline" status
  - Disables ML actions when service unavailable
- **Prefill support**: Accepts tickers, indicators, start/end from URL params or Zustand store fallback
- **Sector selection**: Multi-select sectors with union/dedupe logic
  - Combines sector-based tickers with manual selections
  - Deduplicates final ticker array
  - Source priority: `S3_BASE/sectors.json` → `public/data/sectors.json`
- **Manual Checker Mode**:
  - Toggle disables AI generation buttons
  - Prefills editable sample DSL and ML code on activation
  - Run buttons remain active for testing
- **Loading Guards**:
  - Single-flight protection via `useAsyncAction` hook
  - Prevents double-click issues
  - Visual loading states (progress bar + button text)
  - Disables form inputs during run to prevent mutation
- **Auto-swapping Example Prompts**:
  - DSL mode: Shows DSL-specific examples (EMA cross, RSI mean reversion)
  - ML mode: Shows ML-specific examples (RandomForest, XGBoost)
  - Click to fill corresponding prompt textarea
- **Hyperparameter Tuning** (ML only):
  - Interactive form with validation (min/max/step)
  - Types: number, select, text
  - Help text and range indicators
  - Syncs with generated/manual hyperparams
- **Results Visualization**:
  - DSL: Equity curves, trades list, summary stats
  - ML: Metrics grid, predictions table (first 10), optional logs
- **Standalone operation**: Works independently when accessed directly

### Data Warehouse (`/explore`)
- **Index view**: Comprehensive ticker catalog with search, sector filtering, date filtering, sortable columns
- **Symbol pages**: Deep-link support (`/explore?symbol=AAPL`) shows detailed ticker view with price chart
- **Metadata exploration**: Records count, date ranges, file formats, sector/industry classifications
- **Statistics dashboard**: Total tickers, data coverage, average records per ticker

## 7. Implementation Notes

### Chart Readability & Performance
- **Series management**: Legend click to hide/show individual tickers; hover for visual emphasis (opacity changes)
- **Multi-scale support**:
  - Price (absolute): Default mode showing actual price values
  - Indexed %: Normalize all series to 100 at start date, show percentage change
  - Small multiples: Grid of mini-charts (limit 6 by default, "Show all" toggle for more)
- **Indicator panels**: RSI and MACD rendered in separate sub-panels below main chart to prevent mixed scales
- **Reference lines**: RSI 30/70 levels, MACD zero line for visual analysis
- **Performance optimization**: Automatic downsampling when > 5k total points using largest triangle three buckets algorithm
- **Error boundaries**: Graceful handling when selected symbols have no data in chosen date window

### Sector Mapping Fallback Logic
1. Check if manifest items include `sector` field → use directly
2. Else, attempt to load `public/sectors.json` → map symbols to sectors
3. Else, check `lib/metadata/sectors.ts` for static mapping
4. If no mapping found, hide sector UI completely (no console errors)

### Next.js App Router Conventions
- **Page export restrictions**: Only allowed exports: `default`, `generateMetadata`, `generateStaticParams`, `revalidate`, `dynamic`, `dynamicParams`, `fetchCache`, `runtime`, `preferredRegion`, `maxDuration`, `metadata`
- **Helper functions**: Must be moved to `utils.ts` files in same directory, not exported from pages
- **Suspense boundaries**: Any component using `useSearchParams` must be client component under Suspense; prefer passing values from server page
- **Server/Client boundary**: Clear separation with server components handling data fetching, client components handling interactivity

### Global State Management
- **Zustand store**: `app/store/strategyStore.ts` manages strategy handoff between Dashboard and Strategy Lab
- **Handoff flow**: Dashboard → `setStrategy()` → `router.push('/strategy')` → Strategy Lab reads from store if URL params absent
- **State shape**: `{ tickers: string[], indicators: string[], start?: string, end?: string }`

## 8. Scripts

- `scripts/build-manifest.ts`
    - Scans `s3://AWS_BUCKET/AWS_PREFIX/` for ticker files
    - Writes `index.json` back into the prefix (no ACLs; compatible with Object Ownership: Bucket owner enforced)
    - Re-run whenever adding more Parquet datasets

- `scripts/check-page-exports.js`
    - Validates that all `app/**/page.tsx` files only export allowed Next.js exports
    - Prevents build failures due to invalid named exports from page files
    - Run via `npm run check-page-exports` or directly with Node

## 9. Environment & Deployment

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
- Add `ML_API_URL` pointing to your App Runner service
- APIs must run on Node runtime (already configured)

## 9a. ML Service (AWS App Runner)

### S3 Data Layout
- **Bucket**: `ai-backtester-data-rosh`
- **Prefix**: `prod/`
- **Layout**: Per-symbol Parquet files (`AAPL.parquet`, `MSFT.parquet`, etc.)
- **Expected columns**: `date`/`time`, `open`/`high`/`low`/`close`/`volume` (+ engineered features if present)
- **Date discovery**: ML service can scan Parquet metadata to determine min/max dates for selected tickers

### Docker/ECR/App Runner Workflow

**Build locally**:
```bash
cd services/ml
docker build -t ai-backtester-ml:latest .
```

**Tag and push to ECR**:
```bash
# Authenticate
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com

# Tag
docker tag ai-backtester-ml:latest <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/ai-backtester-ml:latest

# Push
docker push <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/ai-backtester-ml:latest
```

**App Runner configuration**:
- **Image URI**: `<ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/ai-backtester-ml:latest`
- **Port**: 8000
- **Health check path**: `/health`
- **Automatic deployments**: Enable to redeploy on new ECR pushes
- **Roles**:
  - **ECR access role**: Auto-created by App Runner wizard for pulling images
  - **Instance role**: Create/attach with `AmazonS3ReadOnlyAccess` policy

**Environment variables** (set in App Runner service configuration):
```
DATA_BUCKET=ai-backtester-data-rosh
DATA_PREFIX=prod/
DATA_LAYOUT=per-symbol
AWS_REGION=us-east-1
CORS_ORIGINS=https://<your-vercel-domain>
```

Note: `CORS_ORIGINS` is optional; defaults to `*` if not set. Set it to your Vercel domain to restrict access.

### Health & Troubleshooting

**Frontend health check**:
- `/api/ml/health` proxies to App Runner's `/health` endpoint
- Returns `{ status: 'ok'|'down', upstream: {...} }`
- Polls every 30 seconds in Strategy Lab UI

**Common errors**:
- **403 S3 access denied**: Instance role missing or lacks S3 permissions
- **CORS errors**: Set `CORS_ORIGINS` in App Runner environment variables
- **ML_API_URL blank**: Frontend can't reach ML service; badge shows "ML offline"

**Viewing App Runner logs**:
- AWS Console → App Runner → Service → Logs tab
- Or use CloudWatch Logs for detailed traces

**Redeploying**:
- Push new Docker image to ECR (same tag)
- App Runner auto-detects and redeploys (if automatic deployments enabled)
- Or manually trigger deployment in App Runner console

### Environment Variables Summary

**Next.js Frontend (Vercel / local)**:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
ML_API_URL=https://<apprunner-domain>/
S3_BASE=https://ai-backtester-data-rosh.s3.amazonaws.com/prod
```

**ML Service (App Runner)**:
```
DATA_BUCKET=ai-backtester-data-rosh
DATA_PREFIX=prod/
DATA_LAYOUT=per-symbol
AWS_REGION=us-east-1
CORS_ORIGINS=https://<your-vercel-domain>
```

**Security note**: Do NOT store AWS access keys in environment variables. App Runner uses the instance role for S3 access.

## 10. Current Status / Known Issues

- S3 manifest + data loading works for AAPL and most tickers
- Flat-line at 0 for some tickers (e.g., ABBV):
    - Cause: normalization gaps (aliases, DECIMAL scale, BigInt) → values defaulting to 0
    - Fix: robust `normalizeRow` (see §3), skip invalid rows, add unit tests with representative schema
- Vercel build “stream did not contain valid UTF-8” for `app/.../page.tsx`:
    - Fix by re-saving files as UTF-8 LF and adding `.gitattributes` (`* text=auto eol=lf`)
- ML strategies: scaffold present; execution disabled in serverless paths; integrate Python service when ready

## 11. Operability (Runbooks)

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
