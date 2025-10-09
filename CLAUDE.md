Alright — here’s your **single, giant, copy-paste Codex prompt** to overhaul the repo exactly as we discussed. It’s tailored to your current **FeatureComponent** branch structure, uses **S3-only** data (no local reads for market data), and assumes the **container has S3 permissions**. It keeps the **manual-first Strategy Lab** with an **“Generate with AI”** autofill button, adds a full **portfolio simulation layer**, and cleanly splits **rule-based backtests** (TS engine or Python engine behind a flag) and **ML** (Python in Docker). It also includes **quick local commands/scripts** for Docker + S3 and **documentation/test plans**.

---

# 🔧 CODEX MASTER PROMPT — AI_BACKTESTER Overhaul (Manual-First, S3-Only, Python/TS Hybrid, Portfolio Sim, ML in Docker)

**Important constraints (do not violate):**

* **Data source:** **S3-only** via `S3_BASE` (HTTP GET to parquet/json). **No local filesystem reads** for market data.
* **Containers:** Requests to the ML/backtest container **have S3 access** via IAM/creds. Use that when needed inside Python (e.g., boto3 or HTTPS fetches).
* **Branch:** Work in the **FeatureComponent** branch. Keep `main` untouched.
* **Keep existing integration points** and file structure wherever reasonable. Improve, don’t break.
* **Default UX:** **Manual builder first** (DSL & ML). **“Generate with AI”** is a **button** that **autofills** the manual forms (doesn’t run automatically).

## 0) Repository context you can rely on (paths & behavior)

(Use these references as ground truth while editing.)

* **Docs:**

  * `README.md` — user overview (Dashboard, Strategy Lab, Data Warehouse) and S3-first flow.
  * `DOCUMENTATION.md` — technical flow: S3 → Next.js APIs → UI; **no local FS**; manifest `index.json`.
  * `Agents.md`, `CLAUDE.md` — agent instructions and “final-sweep” prompts.

* **APIs (Next.js):**

  * `app/api/index/route.ts` — reads manifest from `${S3_BASE}/index.json`
  * `app/api/local-data/route.ts` — fetches ticker data from S3 within a date range
  * `app/api/strategy/generate/route.ts` — OpenAI DSL/ML generation (returns **DSL JSON** or **Python code string**)
  * `app/api/strategy/run/route.ts` — runs backtests (currently: DSL in TS engine; ML via `mlClient` remote or local)
  * `app/api/strategy/ping/route.ts`, `app/api/health/route.ts`, `app/api/ml/health/route.ts` — health checks.

* **Libs / Engine:**

  * `lib/safeParquet.ts` — **S3-first** fetch; map Parquet/JSON schemas; `readTickerRange(ticker,start,end)`.
  * `lib/strategy-engine.ts` — **DSL backtester in TS** (MACD/RSI/SMA/EMA), returns `stats,trades,equity`.
  * `lib/ml-client.ts` — **ML API client**: `ML_API_URL` remote, or `ALLOW_LOCAL_PY=1` local fallback stubs.

* **UI:**

  * `components/strategy-form.tsx` — prompt + DSL/ML toggle + (old) run flow
  * `components/backtest-results.tsx` — equity chart + per-ticker stats/trades
  * `components/strategy/HyperparamForm.tsx`, `ModelCard.tsx`, `CodePane.tsx` — ML UI bits
  * `components/MultiTickerChart.tsx`, `components/ticker-selector.tsx`
  * Dashboard: `app/(shell)/dashboard/*.tsx` (fetch tickers; Quick Actions; chart)

---

## 1) Goal & High-Level Plan

### What we’re building

* A **manual-first Strategy Lab** (two tabs: **DSL** & **ML**) with:

  * **DSL Builder** (rule blocks for SMA/EMA cross, RSI thresholds, MACD crosses; more later).
  * **Portfolio Panel** (starting cash, initial positions, leverage, costs, sizing, rebalance, constraints).
  * **ML Builder** (model selection + hyperparams; template-generated Python; advanced **code editor**).
  * **“Generate with AI”** (button): takes a prompt → **autofills manual forms** (DSL rules or ML model+params or code). The user can tweak before running.

* **Backtest execution paths**:

  * **DSL (Rule-based):**

    * Default: **TS engine** (`lib/strategy-engine.ts`) for speed & parity.
    * Optional: **Python engine** (new microservice) via env flag `USE_PY_BACKTESTER=1`.
  * **ML:** **Python** (Docker) templates or custom code, invoked via **HTTP** `ML_API_URL` from Next.js.
  * All market data loads **from S3** (`S3_BASE`) — **no local reads**.
  * Containers have S3 access via IAM or env; use that for any internal fetches as needed.

* **Outputs:** Full **portfolio-aware** results: trade ledger, daily equity, attribution, risk metrics.

* **Everything documented & tested** (Vitest + Pytest) with **S3-only** in mind.

---

## 2) Environment Variables & S3-Only Contract

**Honor these variables (and only these data paths for market data):**

```
# S3 data (read-only HTTP)
S3_BASE=https://<your-bucket>.s3.amazonaws.com/<prefix>

# OpenAI
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini

# ML service
ML_API_URL=https://<your-app-runner-or-ecs-service>    # remote Python microservice
ALLOW_LOCAL_PY=1                                        # dev-only local mode (optional)

# Strategy runner
PYTHON_BIN=python                                       # optional local runner
AI_TMP_DIR=.ai_tmp                                      # optional temp dir

# Switch DSL execution path (TS default, Python if set)
USE_PY_BACKTESTER=0|1
```

**Rules:**

* Market data is fetched by **Next.js** via `lib/safeParquet.ts` from **`${S3_BASE}/index.json`** and **`${S3_BASE}/${TICKER}.parquet|.json`**.
* **Python service** should also fetch via HTTPS from S3 (or use IAM if it wants to list), but **must accept ticker + date range** and **must not require local data files**.
* When Next.js calls the ML/Backtest service, assume the **container has S3 permissions** (IAM) — okay to fetch directly.

---

## 3) UI Overhaul — Manual-First Strategy Lab

### 3.1 Create/Refactor Components

* **New** `components/strategy/DSLBuilder.tsx`

  * Add/Remove **Rule Blocks**:

    * **sma_cross / ema_cross**: `{ fast, slow, enter, exit }`
    * **macd_cross**: `{ fast, slow, signal, enter, exit }`
    * **rsi_threshold**: `{ period, low?, high?, enter, exit }`
  * Each rule gets UI **inputs with defaults** (use `normaliseDsl` defaults in `lib/strategy-engine.ts` as ground truth for ranges/defaults).

* **New** `components/strategy/PortfolioPanel.tsx`

  * Inputs:

    ```
    startingCash: number
    initialPositions?: Record<string, number>  // shares
    leverage: number
    maxGross?: number
    commissionFixed?: number
    commissionPct?: number     // 0.0005 = 5 bps
    slippageBps?: number       // 2 = 2 bps
    borrowRateShort?: number   // annualized; apply daily
    allowShort?: boolean
    sizing:
      - fixed_dollar { amount }
      - percent_of_equity { pct }
      - risk_per_trade_pct { pct, atr_lookback }
    maxPositions?: number
    maxWeightPerTicker?: number
    rebalance?: "none"|"daily"|"weekly"|"monthly"
    rebalanceDriftPct?: number
    stopLossPct?: number
    takeProfitPct?: number
    benchmark?: string
    ```
  * Validate, persist to store, and pass through to the **run request**.

* **New** `components/strategy/MLBuilder.tsx`

  * **Model select** (all major families):

    * Linear/Logistic Regression, Ridge/Lasso/ElasticNet
    * DecisionTree, RandomForest, ExtraTrees
    * XGBoost, LightGBM (optional if available), CatBoost (optional)
    * SVM (SVC/SVR), KNN (KNeighbors), MLP (scikit-learn)
  * **Hyperparam inputs** (reuse `HyperparamForm.tsx` & `uiSchema`); add train-window, feature choices (OHLC/returns/indicators).
  * **Code editor** (advanced): show/edit generated Python; switch to “custom code mode” once edited.

* **Update** `components/strategy-form.tsx`

  * Keep **DSL/ML toggle**. Remove the old “manual vs AI” checkbox.
  * **Manual UI** is always visible for the chosen tab (DSLBuilder + PortfolioPanel, or MLBuilder + PortfolioPanel).
  * Add **“Generate with AI”** button (Sparkles icon): opens modal with **prompt textarea**.

    * **On submit:** call `/api/strategy/generate` with `{ mode, prompt, tickers, startDate, endDate }`.
    * **If DSL:** parse `dsl` and **autofill** DSLBuilder (name + rules).
    * **If ML:** inspect `code` to detect model if possible; otherwise fill **code editor** and basic params; keep editable.
    * Do **not** run automatically; user still clicks **Run Backtest**.
  * **Run Backtest** button:

    * Build payload: `{ mode, tickers[], startDate, endDate, dsl?, ml?, portfolio }`.
    * Call `/api/strategy/run`.
    * Show spinner (“Loading… Running backtest…”).
    * Render `BacktestResults` on success; show errors otherwise.

* **Update** `components/backtest-results.tsx` to support **portfolio outputs**:

  * **Show at top:**

    * Starting cash, ending equity, return %, CAGR, volatility, Sharpe, Sortino, max drawdown, exposure, turnover, # trades, hit rate, avg win/loss.
  * **Tabs:**

    * **Equity Curve** (daily NAV)
    * **Trade Ledger** (time, ticker, side, qty, fill_price, fees, slippage, PnL)
    * **Per-Ticker Attribution** (PnL, hit rate, average trade, contribution)
    * **Risk** (drawdown curve, rolling volatility, rolling Sharpe)
  * Accept a unified response shape for both TS/Python engines (see **Section 5** API contracts).

* **Dashboard integration** (`app/(shell)/dashboard/*`):

  * Allow multi-select tickers & date range; keep “Generate Strategy with this” button.
  * Link to `/backtester?tickers=AAPL,MSFT&start=2022-01-01&end=2024-12-31` and **pre-fill** Strategy Lab inputs.

---

## 4) Backend — Execution Paths & Flags

### 4.1 Keep TS DSL engine (default), add Python DSL engine (flag)

* In `app/api/strategy/run/route.ts`:

  * Add env flag `USE_PY_BACKTESTER`:

    * If `mode === "dsl"` **and** `USE_PY_BACKTESTER=1`, call **Python service** (see **4.2**).
    * Else, run existing **TS engine** (`runBacktest`) as today.
  * **Always pass `portfolio` config**; TS engine should **apply portfolio sim** (see **4.3**) or Python engine should, depending on path.
  * **ML path** remains via `mlClient.trainPredict(...)` (implemented to call Python service).

### 4.2 Python microservice (Docker) — endpoints

Add/extend the Python service (container you already have). If you prefer, fold into your existing ML service (`ML_API_URL`).

**New/Updated endpoints:**

* `POST /backtest/dsl`
  **Input:**

  ```
  {
    "tickers": ["AAPL","MSFT"],
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "dsl": { "name": "...", "rules": [ ... ] },
    "portfolio": { ... }   // see PortfolioPanel schema
  }
  ```

  **Behavior:**

  * For each ticker: fetch OHLCV **via HTTPS** from `${S3_BASE}` or use IAM to read S3 (either is fine)
  * Compute rule signals (SMA/EMA/MACD/RSI) → position targets → portfolio simulator (below)
  * Return per-ticker stats + equity + trades, and summary (portfolio-level metrics)

* `POST /ml/train-predict`   (**keep** current route for `mlClient.trainPredict`)
  **Input:**

  ```
  {
    "tickers": [...],
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "modelType": "RandomForestClassifier" | ...,
    "code": "<python or empty if using template>",
    "hyperparams": { ... },
    "portfolio": { ... }       // apply same sim after predictions -> trades
  }
  ```

  **Behavior:**

  * If `code` provided → run that (sandboxed subprocess).
  * Else render **template** for `modelType` with `hyperparams` and a **simple trade rule** (e.g., predict next-day up → long).
  * Read OHLCV from S3 via HTTPS or boto3; compute features; train/test; generate **daily signals**; feed **portfolio simulator**.
  * Return same output shape as DSL.

* `GET /health` → `{ status: "ok" }`

**Security/runtime:**

* Constrain subprocess: **timeout**, **CPU/mem limits**, **kill on exceed**.
* Use `requests`/`s3fs`/`boto3` for data; **do not** expect local files.
* Provide `requirements.txt` (pandas, numpy, scikit-learn, xgboost, lightgbm optional, ta/pandas-ta optional).

### 4.3 Portfolio Simulator (TS & Python parity)

**Daily loop (per portfolio, across tickers):**

1. Compute **signals** → desired **target weights** or **orders** per ticker.
2. **Sizing**:

   * `fixed_dollar`: $ per position
   * `percent_of_equity`: % of NAV
   * `risk_per_trade_pct`: position sized so ATR-stop risk equals % of NAV
3. Enforce **constraints**: `maxPositions`, `maxWeightPerTicker`, `allowShort`, `maxGross`, `leverage`.
4. **Execution:**

   * Market-on-close fills; apply **commission** (`fixed + pct * notional`) and **slippage** (`bps * notional / 10_000`).
   * **Short borrow** = `short_notional * borrowRateShort/252` per day.
5. Update **cash**, **positions**, **equity (NAV)**.
6. Apply **stopLossPct / takeProfitPct** triggers.
7. **Rebalance** on schedule or **drift threshold**.
8. Record **trade ledger** entries.

**Outputs (per run):**

```
{
  ok: true,
  summary: {
    mode: "dsl" | "ml",
    startDate, endDate,
    startingCash, endingEquity, totalReturnPct, CAGR,
    volatilityPct, sharpe, sortino, maxDrawdownPct,
    exposurePct, turnoverPct,
    totalTrades, winRatePct, avgWinPct, avgLossPct,
    bestDayPct, worstDayPct,
    benchmark?: { totalReturnPct, alphaPct, beta }
  },
  perTicker: [
    {
      ticker,
      stats: { totalReturnPct, trades, winRatePct, avgTradePct, contributionPct },
      trades: [{ date, side, qty, fillPrice, fees, slippage, pnlPct }],
      equity: [{ date, nav }]
    },
    ...
  ],
  portfolioDaily: [{ date, nav, drawdownPct, exposurePct }],
  logs: [ ... ]
}
```

Unify response shape for both TS and Python paths so `backtest-results.tsx` renders identically.

---

## 5) API Contracts (front↔back)

### 5.1 `/api/strategy/generate` (Next.js → OpenAI)

* **Request:** `{ mode: "dsl" | "ml", prompt, tickers[], startDate?, endDate? }`
* **Response (DSL):** `{ ok: true, mode:"dsl", dsl: { name, rules:[...] } }`
* **Response (ML):** `{ ok: true, mode:"ml", code: "<python>", modelType? }`
* **UI behavior:** Fill DSLBuilder or MLBuilder fields/code and **stop** (do not auto-run).

### 5.2 `/api/strategy/run` (Next.js)

* **Request (DSL/TS default):**

  ```
  {
    mode: "dsl",
    tickers, startDate, endDate,
    dsl: { name, rules:[...] },
    portfolio: { ... }
  }
  ```
* **Request (DSL/Python if `USE_PY_BACKTESTER=1`):** same body; Next.js proxies to Python `/backtest/dsl`.
* **Request (ML):**

  ```
  {
    mode: "ml",
    tickers, startDate, endDate,
    ml: { modelType?, code?, hyperparams: { ... } },
    portfolio: { ... }
  }
  ```

  Next.js calls Python `/ml/train-predict`.
* **Response (both):** unified as in **4.3 Outputs**.

---

## 6) Implementation Steps (edits to make)

### 6.1 UI & State

* Create `components/strategy/DSLBuilder.tsx`

* Create `components/strategy/PortfolioPanel.tsx`

* Create `components/strategy/MLBuilder.tsx`

* Refactor `components/strategy-form.tsx`:

  * Remove requirement for `prompt` on submit.
  * Insert DSLBuilder/MLBuilder + PortfolioPanel.
  * Add “Generate with AI” modal → call `/api/strategy/generate` → autofill.
  * Validate inputs; then call `/api/strategy/run` with full payload.

* Update `components/backtest-results.tsx`:

  * Support `summary`, `perTicker`, `portfolioDaily` with new fields.
  * Tabs: Equity, Trades, Attribution, Risk.

* Update Dashboard:

  * Allow multi-ticker + date selection.
  * Link to backtester with `tickers`/`start`/`end` params and **pre-fill**.

### 6.2 Next.js APIs

* `app/api/strategy/generate/route.ts`:

  * Keep as is; ensure it returns **normalized DSL** (uses `normaliseDsl`) and **python code** for ML.
  * (Optional) add `tickers/start/end` in the OpenAI “system prompt” for better hints.

* `app/api/strategy/run/route.ts`:

  * Extend schema to accept `portfolio` object in both modes; default sensible values.

    * If **TS DSL** path: integrate **portfolio simulator** in TS (see 6.3).
    * If `USE_PY_BACKTESTER=1`: forward to Python `/backtest/dsl` with same body.
  * **ML path:** continue to use `mlClient.trainPredict`; include `portfolio` in body. Ensure `mlClient` forwards it.

* `lib/ml-client.ts`:

  * Extend requests to include `portfolio`.
  * Provide `generate`, `trainPredict`, `healthCheck` against `ML_API_URL`.
  * Keep local dev stubs minimal.

### 6.3 TS Portfolio Simulator (for TS DSL path)

* Create `lib/portfolio.ts` with:

  * Types: `PortfolioConfig`, `PositionSizing`, `Trade`, `PortfolioDaily`, `PortfolioStats`.
  * `simulatePortfolio({ rowsByTicker, signalsByTicker, portfolioConfig }) → { perTicker, portfolioDaily, summary }`
  * Implement the equations in **4.3** (cash, fees, slippage, NAV, risk metrics).
  * Integrate with `runBacktest`:

    * `runBacktest` can remain as **signal generator** (enter/exit arrays) or produce trades;
    * Prefer producing **signals** (enter/exit vectors), then portfolio sim consumes them.
    * If easier short-term, use existing `trades/equity` from `runBacktest` and inflate into portfolio terms (but full fidelity wants target weights).

* Update `run` route to use `simulatePortfolio` outputs.

### 6.4 Python Service

* Add endpoints:

  * `POST /backtest/dsl` — parse DSL, compute signals, run **same** portfolio sim logic as TS.
  * `POST /ml/train-predict` — template or custom code → predictions → signals → portfolio sim.

* Implement indicator set (SMA/EMA/MACD/RSI) and sim; use pandas/numpy (and ta/pandas-ta if desired).

* Enforce timeouts and limits for subprocess (`code` path).

* Output **exact JSON shape** described in **4.3**.

* **Model templates** (Jinja2 or string format):

  * RandomForest (clf/reg), ExtraTrees, XGBoost, LightGBM (optional), Logistic/Linear, DecisionTree, SVM, KNN, MLP.
  * Accept `hyperparams` and `train_window` (days).
  * Features: close/returns/rolling stats/indicators (basic set), deterministic seeds.

### 6.5 Tests

**Vitest (TS):**

* `lib/safeParquet.spec.ts` — schema normalization (odd field names, decimals, bigint)
* `lib/strategy-engine.spec.ts` — SMA/EMA/RSI/MACD signal correctness on toy data
* `lib/portfolio.spec.ts` — portfolio math (cash/fees/slippage/leverage/short borrow)
* `app/api/strategy/run.spec.ts` — DSL request → summary/perTicker shape (mock S3 fetch)
* E2E smoke: call `/api/strategy/generate` (mock OpenAI) → fill DSL → `/api/strategy/run` (TS path) → assert response keys

**PyTest (Python service):**

* `tests/test_indicators.py`, `test_portfolio.py`, `test_dsl_backtest.py`, `test_ml_templates.py`
* Tiny fixtures (5–20 rows) to assert trades and NAV.
* Integration: call `/backtest/dsl` and `/ml/train-predict` with fixture tickers (mock S3 fetch with requests_mock or moto if using boto3), assert output schema.

**Optional integration tests** (only if Python available locally):

* From Next.js, run `mode: "ml"` with trivial code that prints fixed JSON → ensure `/api/strategy/run` path parses result.

---

## 7) Documentation Updates

* **README.md**

  * Update **Features** to: Manual Strategy Builder (DSL/ML), AI Autofill, Portfolio Simulator, S3-only data, ML in Docker.
  * Update **Quick Start**:

    * `docker compose up` starts Next.js and Python service.
    * `.env` example using **only S3_BASE** for data.
  * Update **Usage**:

    * Strategy Lab: Build DSL or ML manually; optionally “Generate with AI”; then Run.
    * Explain Portfolio panel inputs and their effects.
  * State **deployment**: Next.js on Vercel; Python service on AppRunner/ECS. ML/DSL Python endpoints accept S3-based runs.

* **DOCUMENTATION.md**

  * Clarify **S3-only** flow and **no local FS** invariant.
  * Add **API contracts** (Section 5) plus response schema.
  * Add **Portfolio simulator math** and metrics definitions (CAGR, Sharpe, Sortino, DD).
  * Add **Testing** section with Vitest & PyTest commands.
  * Add **Config flags**: `USE_PY_BACKTESTER`, `ML_API_URL`, `ALLOW_LOCAL_PY`.

* **Agents.md / CLAUDE.md**

  * New **agent instructions**:

    * **Do not change data path**: always S3 for market data.
    * Respect **manual-first UX**; AI only autofills.
    * If editing run paths, keep **TS DSL** default unless `USE_PY_BACKTESTER=1`.
    * For ML, always call Python service and return unified JSON.

---

## 8) Minimal local scripts & commands (Docker + S3)

### S3 sanity checks (host)

```bash
# List manifest and sample ticker via HTTPS
curl -s "${S3_BASE}/index.json" | jq '.tickers | length, .[0:5]'
curl -I "${S3_BASE}/AAPL.parquet"   # HEAD check
curl -s "${S3_BASE}/AAPL.json" | head -n 2 || true

# If AWS CLI (container IAM or local creds)
aws s3 ls s3://ai-backtester-data-rosh/prod/
aws s3 cp s3://ai-backtester-data-rosh/prod/index.json - | jq .
```

### Quick Python snippet (in container or host) to pull S3 via HTTPS (no SDK):

```python
import requests, pandas as pd, io
import os
S3_BASE = os.environ.get("S3_BASE")
# Fetch manifest
m = requests.get(f"{S3_BASE}/index.json").json()
print("Tickers:", len(m.get("tickers", [])))
# Fetch JSON rows for a ticker if available
r = requests.get(f"{S3_BASE}/AAPL.json")
if r.ok:
    df = pd.read_json(io.StringIO(r.text))
    print(df.head())
```

### Docker: run Python service locally (example)

```bash
# Build python service image
docker build -t backtester-py ./python-service

# Run with S3 env & IAM via local creds (or via task role in ECS)
docker run --rm -p 8081:8081 \
  -e S3_BASE="$S3_BASE" \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  backtester-py

# Health check
curl http://localhost:8081/health
```

### Next.js local

```bash
# .env.local: set S3_BASE, OPENAI_* (if using AI), ML_API_URL=http://localhost:8081
pnpm i
pnpm dev
# Visit http://localhost:3000/backtester
```

---

## 9) Acceptance Criteria (do not merge until all pass)

* **Strategy Lab**

  * **Default view is manual**. No prompt required to run.
  * **DSL Builder**: can add/remove rules; normalize values; run on multiple tickers.
  * **ML Builder**: select model, edit hyperparams, optional code editor; can run template or custom code.
  * **“Generate with AI”**: Autofills manual forms (DSL rules or ML code/params), does **not auto-run**.
  * **Portfolio Panel**: settings affect results (fees/slippage/leverage/short/etc.).

* **Execution**

  * **S3-only data** path confirmed (turn off any local file read).
  * **DSL (TS)** produces unified output shape; **Python DSL** produces **identical shape** behind flag.
  * **ML** runs via Python service; unified output shape; handles errors & timeouts gracefully.

* **Results**

  * Equity curve, trades ledger, attribution, risk metrics appear and are consistent across TS/Python paths (within expected tolerance).
  * Multi-ticker summary stats make sense; per-ticker stats sum/average correctly.

* **Docs & Tests**

  * README/DOCS/Agents updated with new UX, APIs, sim model, test commands.
  * Vitest & PyTest suites pass locally.
  * Health endpoints OK; `/api/strategy/generate`, `/api/strategy/run` work for both DSL/ML flows.

---

## 10) Commit Plan

* Commit 1: UI scaffolding (DSLBuilder, MLBuilder, PortfolioPanel) + StrategyForm refactor (manual-first + AI modal)
* Commit 2: TS portfolio simulator + run route wiring + results component updates
* Commit 3: Python service endpoints + model templates + portfolio sim parity
* Commit 4: ml-client extension + run route Python proxy (`USE_PY_BACKTESTER`)
* Commit 5: Tests (Vitest + PyTest) + smoke e2e
* Commit 6: Docs (README, DOCUMENTATION, Agents/CLAUDE)
* Commit 7: Cleanup (dead code, old toggles) + final polish

Use descriptive messages, e.g.,
`feat(strategy-lab): manual-first UI, AI autofill modal, portfolio sim, S3-only`

---

## 11) Extra Notes & Hints

* **Indicator parity:** Keep indicator math equivalent between TS and Python (test with golden fixtures).
* **AI prompt templates:** Keep existing `DSL_PROMPT_TEMPLATE` & `ML_PROMPT_TEMPLATE`, but you can add hints (e.g., “respond with JSON only”, include tickers/dates).
* **Error UX:** Surface clear errors from Python service (timeout, parse errors, model import issues).
* **Performance:** For multi-ticker, fetch in parallel but cap concurrency to avoid S3 throttling.
* **Security:** In custom ML code mode, restrict runtime; disallow file writes/reads except stdout; kill on timeout.

---

**End of Codex Prompt.**
Implement all items above in the **FeatureComponent** branch, honoring the **S3-only** data rule and keeping **manual-first UX** with optional **AI autofill**. After you finish, run all tests and update docs as specified.
