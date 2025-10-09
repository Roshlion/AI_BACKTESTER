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

## 11. Portfolio Simulator & Backtest Execution

### 11.1 Overview

The portfolio simulator applies realistic trading costs, position sizing, and risk controls to convert indicator signals into portfolio-level performance metrics. It runs identically in **TypeScript** (default, fast) and **Python** (optional, via `USE_PY_BACKTESTER=1` flag).

### 11.2 Portfolio Configuration

All backtest requests accept a `portfolio` object with the following fields:

```typescript
{
  startingCash: number;                     // Initial capital (e.g., 100000)
  leverage?: number;                        // Max leverage multiplier (default: 1)
  maxGross?: number;                        // Max gross exposure in dollars

  // Position Sizing
  sizing: {
    type: "fixed_dollar" | "percent_of_equity" | "risk_per_trade_pct";
    amount?: number;                        // For fixed_dollar: $ per position
    pct?: number;                           // For percent_of_equity or risk_per_trade_pct: %
    atr_lookback?: number;                  // For risk_per_trade_pct: ATR window
  };

  // Trading Costs
  commissionFixed?: number;                 // Fixed commission per trade (e.g., 0)
  commissionPct?: number;                   // Commission as decimal (0.0005 = 5 bps)
  slippageBps?: number;                     // Slippage in basis points (e.g., 2)
  borrowRateShort?: number;                 // Annualized short borrow rate (%)

  // Risk Controls
  allowShort?: boolean;                     // Enable short selling
  maxPositions?: number;                    // Max concurrent positions
  maxWeightPerTicker?: number;              // Max weight per ticker (%)
  stopLossPct?: number;                     // Auto-exit when PnL drops below %
  takeProfitPct?: number;                   // Auto-exit when PnL exceeds %

  // Rebalancing
  rebalance?: "none" | "daily" | "weekly" | "monthly";
  rebalanceDriftPct?: number;               // Threshold for rebalance trigger
  benchmark?: string;                       // Optional benchmark ticker (e.g., "SPY")
}
```

**Default Portfolio** (if not provided):
```json
{
  "startingCash": 100000,
  "leverage": 1,
  "sizing": { "type": "percent_of_equity", "pct": 10 },
  "commissionFixed": 0,
  "commissionPct": 0.0005,
  "slippageBps": 2,
  "borrowRateShort": 0,
  "allowShort": false,
  "rebalance": "none",
  "rebalanceDriftPct": 5
}
```

### 11.3 Simulation Process

**Daily Loop (for each date in backtest period):**

1. **Process Enter/Exit Signals**:
   - Check exit signals first (close existing positions)
   - Check enter signals (open new positions if capacity available)

2. **Position Sizing**:
   - `fixed_dollar`: Fixed dollar amount per position
   - `percent_of_equity`: Percentage of current NAV
   - `risk_per_trade_pct`: Position sized so ATR-based stop risk equals % of NAV

3. **Execution & Costs**:
   - Market-on-close fills at end-of-day close price
   - **Commission**: `fixed + (notional * commissionPct)`
   - **Slippage**: `notional * (slippageBps / 10000)`
   - **Short Borrow** (if applicable): `short_notional * (borrowRateShort / 252)` per day

4. **Risk Controls**:
   - Check `stopLossPct` and `takeProfitPct` triggers after each day
   - Enforce `maxPositions`, `maxWeightPerTicker`, `leverage`, `maxGross` constraints

5. **Calculate Daily NAV**:
   - `NAV = cash + sum(position_qty * current_price for all positions)`
   - Track high water mark for drawdown calculation
   - `drawdownPct = (NAV - highWaterMark) / highWaterMark * 100`

6. **Record Trade Ledger**:
   - Each trade: `{ date, ticker, side, qty, fillPrice, fees, slippage, pnlPct }`

### 11.4 Output Schema

All backtest endpoints return a unified JSON structure:

```json
{
  "ok": true,
  "summary": {
    "mode": "dsl" | "ml",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "startingCash": 100000,
    "endingEquity": 142350.42,
    "totalReturnPct": 42.35,
    "CAGR": 18.5,
    "volatilityPct": 12.3,
    "sharpe": 1.52,
    "sortino": 2.1,
    "maxDrawdownPct": -8.5,
    "exposurePct": 85.2,
    "turnoverPct": 150.0,
    "totalTrades": 45,
    "winRatePct": 58.3,
    "avgWinPct": 4.2,
    "avgLossPct": -2.1,
    "bestDayPct": 5.3,
    "worstDayPct": -3.2,
    "benchmark": {
      "totalReturnPct": 25.0,
      "alphaPct": 17.35,
      "beta": 1.15
    }
  },
  "perTicker": [
    {
      "ticker": "AAPL",
      "stats": {
        "totalReturnPct": 35.2,
        "trades": 12,
        "winRatePct": 66.7,
        "avgTradePct": 2.9,
        "contributionPct": 55.0
      },
      "trades": [
        {
          "date": "2023-01-15",
          "ticker": "AAPL",
          "side": "buy",
          "qty": 50,
          "fillPrice": 145.50,
          "fees": 3.64,
          "slippage": 1.46,
          "pnlPct": 0
        },
        {
          "date": "2023-02-10",
          "ticker": "AAPL",
          "side": "sell",
          "qty": 50,
          "fillPrice": 152.30,
          "fees": 3.81,
          "slippage": 1.52,
          "pnlPct": 4.67
        }
      ],
      "equity": [
        { "date": "2023-01-01", "nav": 10000 },
        { "date": "2023-01-02", "nav": 10150 }
      ]
    }
  ],
  "portfolioDaily": [
    {
      "date": "2023-01-01",
      "nav": 100000,
      "drawdownPct": 0,
      "exposurePct": 0
    },
    {
      "date": "2023-01-15",
      "nav": 108520,
      "drawdownPct": 0,
      "exposurePct": 72.5
    }
  ],
  "logs": []
}
```

### 11.5 Risk Metrics Definitions

- **CAGR** (Compound Annual Growth Rate): `((endingEquity / startingCash) ^ (1 / years)) - 1`
- **Volatility**: Annualized standard deviation of daily returns (`stddev * sqrt(252)`)
- **Sharpe Ratio**: `(totalReturnPct / volatilityPct) * sqrt(252)`
- **Sortino Ratio**: Sharpe using only downside volatility (negative returns)
- **Max Drawdown**: Largest peak-to-trough decline from high water mark
- **Exposure**: Average percentage of NAV invested (`abs(marketValue) / NAV`)
- **Turnover**: Total traded notional relative to average NAV (per period)

### 11.6 Execution Paths

**TypeScript (Default)**:
- DSL rules → `lib/strategy-engine.ts` → signals → `lib/portfolio.ts` → results
- Fast, serverless-friendly, no external dependencies
- Runs in Next.js API routes on Vercel

**Python (Optional, via `USE_PY_BACKTESTER=1`)**:
- DSL rules → Next.js forwards to `ML_API_URL/backtest/dsl` → Python service
- Endpoint: `POST /backtest/dsl`
- Request: `{ tickers, start, end, dsl, portfolio }`
- Response: Same unified schema as TS
- **Use case**: Parity testing, leveraging Python ML libraries, custom indicators

**ML Path (Always Python)**:
- ML config → `ML_API_URL/ml/train-predict` → Python service
- Endpoint: `POST /ml/train-predict`
- Request: `{ tickers, start, end, modelType, code, hyperparams, portfolio }`
- Runs model training, generates predictions → signals → portfolio sim
- Response: Same unified schema

## 12. API Contracts (Detailed)

### 12.1 POST /api/strategy/run

**Request Body**:
```json
{
  "mode": "dsl" | "ml",
  "tickers": ["AAPL", "MSFT"],      // REQUIRED: array of ticker symbols (>=1)
  "startDate": "2023-01-01",         // REQUIRED
  "endDate": "2024-01-01",           // REQUIRED
  "dsl": {                            // REQUIRED if mode = "dsl"
    "name": "SMA Crossover",
    "rules": [
      {
        "type": "sma_cross",
        "params": {
          "fast": 10,
          "slow": 30,
          "enter": "fast_above",
          "exit": "fast_below"
        }
      }
    ]
  },
  "ml": {                             // REQUIRED if mode = "ml"
    "modelType": "RandomForestClassifier",
    "code": "# Python ML code...",
    "hyperparams": {
      "n_estimators": 100,
      "max_depth": 10
    }
  },
  "portfolio": {                      // OPTIONAL (uses defaults if omitted)
    // ... see section 11.2
  }
}
```

**Response** (Success, 200):
```json
{
  "ok": true,
  "summary": { ... },      // Portfolio-level metrics
  "perTicker": [ ... ],    // Per-ticker attribution
  "portfolioDaily": [ ... ], // Daily NAV series
  "logs": [ ... ]          // Optional execution logs
}
```

**Response** (Error):
```json
{
  "ok": false,
  "error": "Error message"
}
```

**Status Codes**:
- `200`: Success
- `400`: Invalid request (missing tickers, invalid DSL/ML config)
- `500`: Internal error (data fetch failed, simulation error)
- `501`: Service unavailable (ML service down, Python DSL path not configured)

### 12.2 Environment Variables

**Frontend (Next.js)**:
```bash
S3_BASE=https://ai-backtester-data-rosh.s3.amazonaws.com/prod
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
ML_API_URL=https://<apprunner-domain>      # Python service URL
USE_PY_BACKTESTER=0                         # Set to 1 to use Python for DSL
```

**Python Service (Docker)**:
```bash
S3_BASE=https://ai-backtester-data-rosh.s3.amazonaws.com/prod
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<optional if using IAM role>
AWS_SECRET_ACCESS_KEY=<optional if using IAM role>
DATA_BUCKET=ai-backtester-data-rosh
DATA_PREFIX=prod/
```

## 13. Testing

### 13.1 TypeScript Tests (Vitest)

**Run all tests**:
```bash
npm test
```

**Test files**:
- `tests/lib/portfolio.spec.ts` — Portfolio simulator (fees, slippage, stop-loss, take-profit, multi-ticker)
- `tests/lib/safeParquet.spec.ts` — Parquet normalization (field aliases, decimals, bigint, missing data)
- `tests/strategy-engine.test.ts` — DSL strategy engine (SMA/EMA/RSI/MACD signals)
- `tests/indicators.test.ts` — Technical indicator calculations
- `tests/normalizers.test.ts` — Data normalization edge cases
- `tests/api/strategy-run.spec.ts` — API route tests (DSL/ML modes, portfolio config, error handling)

**Coverage targets**:
- Core logic (portfolio, strategy-engine, indicators): ≥90%
- API routes: ≥70%
- UI components: ≥60%

**Run specific test file**:
```bash
npm test tests/lib/portfolio.spec.ts
```

### 13.2 Python Tests (Pytest)

**Setup** (first time):
```bash
cd python-service
pip install -r requirements.txt
pip install pytest pytest-cov
```

**Run all tests**:
```bash
cd python-service
pytest tests/ -v
```

**Test files**:
- `tests/test_portfolio.py` — Portfolio simulator (Python parity with TS)
- `tests/test_indicators.py` — Indicator calculations (future)
- `tests/test_backtest_dsl.py` — DSL execution (future)
- `tests/test_backtest_ml.py` — ML template execution (future)

**Run with coverage**:
```bash
pytest tests/ -v --cov=app --cov-report=html
```

### 13.3 Integration Testing

**Manual Integration Test (DSL TS path)**:
1. Start Next.js dev server: `npm run dev`
2. Navigate to http://localhost:3000/backtester
3. Select tickers: `AAPL, MSFT`
4. Choose DSL mode, add SMA crossover rule (fast=10, slow=30)
5. Set portfolio: $100k starting cash, 10% of equity per position
6. Click "Run Backtest"
7. Verify: Results display with equity curve, trades ledger, and summary stats

**Manual Integration Test (Python DSL path)**:
1. Set `USE_PY_BACKTESTER=1` in `.env.local`
2. Start Python service: `cd python-service && uvicorn app.main:app --port 8081`
3. Set `ML_API_URL=http://localhost:8081` in `.env.local`
4. Run same DSL backtest as above
5. Verify: Results match TS path (within rounding tolerance)

**Manual Integration Test (ML path)**:
1. Ensure `ML_API_URL` is set and Python service is running
2. Navigate to http://localhost:3000/backtester
3. Switch to ML mode
4. Select model: RandomForestClassifier
5. Set hyperparams: n_estimators=100, max_depth=10
6. Click "Run Backtest"
7. Verify: Results display with model metrics and predictions

### 13.4 Test Data

**Mock Data** (for unit tests):
- Small fixtures (5-20 rows) with known OHLCV values
- Edge cases: missing data, all zeros, extreme prices, bigint volumes
- Golden outputs for indicator calculations (SMA/EMA/RSI/MACD)

**S3 Test Data** (for integration tests):
- Use real tickers from production S3 bucket
- Small date ranges (e.g., 2023-01-01 to 2023-03-31)
- Test with: AAPL (stable), TSLA (volatile), low-volume tickers

## 14. Extensibility

- Indicators: add BBANDS/ATR/ADX
- Asset universe: extend manifest with sector/industry and filter UI
- Security: switch to presigned URLs if bucket becomes private
- Scale: windowed reads, pagination, caching for large Parquet files
- ML: add more model templates (LSTM, Transformer, ensemble methods)
- Optimization: Hyperparameter tuning via grid search or Bayesian optimization

## 15. Appendix — Parquet Normalization Checklist

- Map all common aliases for OHLCV
- If a field is DECIMAL with `scale`, divide raw value by `10^scale`
- Convert BigInt/Int64 to number carefully
- Parse date from ISO or epoch; skip invalid rows
- Do not silently set missing values to 0
- Add tests with a fixture mirroring ABBV schema to prevent regressions
