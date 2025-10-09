Here’s a single **copy-paste CLAUDE prompt** for your **FeatureComponent** branch. It folds in *everything* we discussed (DSL tickers fix, ML wiring + loading/disable, auto example prompts per mode, **Manual Checker** toggle with prefilled DSL/ML scripts, ML sector select, expanded tests incl. API + run flows, and deep docs on AWS/ECR/App Runner/S3 parquet + manifests). **Make all changes in one commit.**

---

# CLAUDE.md — Final sweep: DSL tickers fix, ML Generate/Run, loading guards, Manual Checker, sectors, tests, and docs (single commit)

You’re on branch **FeatureComponent**. Apply all changes below. Keep current style/structure (Next.js App Router, Zustand, Vitest + RTL). **Single commit only** at the end.

---

## 0) Objectives (recap)

* Fix **DSL** run failing with “tickers array required”.
* Make **ML** tab fully functional (Generate → code/hyperparams, Run → metrics/preds/logs).
* Add **loading/disable** states to prevent double-click & concurrent runs.
* **Auto example prompts** swap when switching between **DSL** and **ML** modes.
* Add **Manual Checker** toggle: same page, *Generate* buttons disabled, prefilled sample **DSL** and **ML** scripts + editable hyperparams; can still **Run**.
* Add **sector selection** in ML panel (union with chosen tickers, deduped).
* Add **tests** for API routes, UI payload correctness, Manual Checker behavior, sector expansion, loading guards, and smoke running of samples.
* Expand **README.md**, **DOCUMENTATION.md**, **agents.md** with AWS (Docker/ECR/App Runner), S3 parquet layout & manifests, envs, runbooks, and test plans.

---

## 1) Types (shared contracts)

**Create:** `types/strategy.ts`

```ts
export type StrategyMode = 'dsl' | 'ml';

export interface DateRange { startDate?: string; endDate?: string; }

export interface DslIndicators {
  sma?: { periods: number[] };
  ema?: { periods: number[] };
  rsi?: { enabled: boolean; period?: number };
  macd?: { enabled: boolean; fast?: number; slow?: number; signal?: number };
}

export interface StrategyGenerateReq extends DateRange {
  mode: StrategyMode;
  tickers: string[];                 // required (>=1)
  indicators?: DslIndicators;        // DSL only
  prompt?: string;                   // DSL or ML
  hyperparams?: Record<string, any>; // ML only
}

export interface StrategyRunReq extends DateRange {
  mode: StrategyMode;
  tickers: string[];                 // required
  dsl?: string;                      // DSL mode
  ml?: { code?: string; hyperparams?: Record<string, any> }; // ML mode
}
```

---

## 2) API: validate & unify (fix “tickers array required”)

**Edit:** `app/api/strategy/generate/route.ts` and `app/api/strategy/run/route.ts`

* Parse body as `StrategyGenerateReq` / `StrategyRunReq`.
* If `!Array.isArray(body.tickers) || body.tickers.length===0` → `return NextResponse.json({ error:'tickers array required' }, { status: 400 })`.
* **DSL** path: accept `prompt` and/or `indicators`; keep existing DSL logic but consume values from the unified payload.
* **ML** path: forward to `process.env.ML_API_URL`:

  * Generate → `POST {base}/ml/generate`
  * Run → `POST {base}/ml/run`
  * `base = process.env.ML_API_URL?.replace(/\/+$/,'')`, return 501 if unset.

Add small helpers (optional) for clean fetch:

```ts
async function proxyMl(path: string, body: any) {
  const base = process.env.ML_API_URL?.replace(/\/+$/,'');
  if (!base) return { status: 501, json: { error: 'ML_API_URL not set' } };
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    // optionally: next: { revalidate: 0 }
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, json: j };
}
```

---

## 3) Client wiring: always send `tickers: string[]`

**Edit:** Strategy Lab client (e.g. `app/(shell)/strategy/StrategyClient.tsx` and any sub-panels).

* Pull `tickers: string[]` & `dateRange` from store.
* **All** generate/run calls (DSL & ML) must include `tickers` array (never a single string).

---

## 4) Loading/disable (single-flight) for DSL & ML

**Create:** `lib/useAsyncAction.ts`

```ts
import * as React from 'react';
export function useAsyncAction<T extends any[]>(fn: (...a: T) => Promise<any>) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string|null>(null);
  const run = React.useCallback(async (...a: T) => {
    if (loading) return;
    setLoading(true); setError(null);
    try { return await fn(...a); }
    catch (e:any) { setError(e?.message || 'Action failed'); throw e; }
    finally { setLoading(false); }
  }, [fn, loading]);
  return { run, loading, error, setError };
}
```

**Apply:**

* Wrap **DSL Generate**, **DSL Run**, **ML Generate**, **ML Run** with `useAsyncAction`.
* Buttons show `Generating…` / `Running…`; **disabled** while loading or ML offline (for ML side).
* Disable form inputs that would mutate a pending run (tickers/sectors/dates) during **Run**.
* Add a slim top **progress bar** (CSS) or overlay while loading.
* Render inline error text if `{ error }` returned.

---

## 5) ML tab: fully functional

**Generate →** `/api/strategy/generate` with:

```ts
{ mode:'ml', tickers, ...dateRange, prompt, hyperparams }
```

On success:

* Populate **CodePane** with returned code (`j.code || j.python || ''`).
* Sync **hyperparams** (merge defaults & returned values).
* Clear errors.

**Run →** `/api/strategy/run` with:

```ts
{ mode:'ml', tickers, ...dateRange, ml: { code, hyperparams } }
```

On success:

* Show **metrics** (key/value list), **predictions** preview table (e.g., timestamp, symbol, y_pred, prob?), and optional **logs** in a right-side results pane.

**Remove** any “in development” banners; keep **ML health badge** in header (green/red), and **disable** ML actions if offline.

---

## 6) Auto example prompts swap with mode

**Edit:** the helper section component at bottom of Strategy Lab.

* Two arrays:

```ts
const DSL_EXAMPLES = [
  'Momentum cross: Buy EMA(20)>SMA(50); sell on cross-down.',
  'RSI mean reversion: Buy RSI<30; exit RSI>55 or after 10 bars.'
];
const ML_EXAMPLES = [
  'RandomForest on OHLCV + RSI/MACD with 60-day window; predict next-day up/down.',
  'XGBoost with volatility features; optimize F1; threshold=0.55 for buys.'
];
```

* When tab = **DSL**, show DSL examples; when tab = **ML**, show ML examples.
* Clicking an example **fills the active mode’s main prompt** textarea/editor.

---

## 7) **Manual Checker** toggle (top-right)

* Header contains a **Manual checker** switch (`manual:boolean` in state).
* In **Manual** mode:

  * Keep same page/UX, but **Generate** buttons are disabled/greyed.
  * If editors are empty on entering Manual:

    * Prefill **DSL** editor with a *valid* sample strategy (use your accepted DSL syntax).
    * Prefill **ML** editor with a runnable **Python** template (imports, feature windowing, basic model fit/predict) and default **hyperparams**.
  * **Run Backtest / Run ML** remain enabled (with loading guards).
* Note in UI (small hint) that Manual mode skips AI generation by design.

---

## 8) ML **sector selection**

**Data source priority:**

1. If `process.env.S3_BASE` available, try `${S3_BASE}/sectors.json`.
2. Fallback to local `public/data/sectors.json`.

**Format:**

```json
{
  "Technology": ["AAPL","MSFT","NVDA"],
  "Financials": ["JPM","BAC","C"]
}
```

**Add component:** `components/strategy/SectorSelect.tsx`

* Multi-select sectors; show chips with counts.
* On change, compute **union** of sector tickers and manually selected tickers → **dedupe**.
* Store additions in Zustand: `selectedSectors: string[]`, `setSelectedSectors`.
* Payload `tickers[]` always uses this **union**.

---

## 9) Tests (Vitest + RTL) — add comprehensive coverage

**a) API route tests** (invoke route handlers directly)

* **File:** `tests/api-strategy-generate.test.ts`

  * 400 if `tickers` missing/empty.
  * DSL path returns 200 with mock OpenAI/DSL generator (stub internal fn or bypass).
  * ML path proxies to `ML_API_URL` (mock `global.fetch`) and bubbles status/body.
* **File:** `tests/api-strategy-run.test.ts`

  * 400 if `tickers` missing/empty.
  * DSL path consumes `dsl` and returns 200 in happy path (stub backtester).
  * ML path proxies to `/ml/run` and returns metrics/preds.

**b) Strategy Lab UI tests**

* **File:** `tests/strategy-dsl-payload.test.tsx`

  * Select 2 tickers; click **Run DSL**; assert `fetch` body contains `tickers: ["AAPL","MSFT"]`.
* **File:** `tests/strategy-ml-generate-run.test.tsx`

  * Mock `/api/strategy/generate` → `{ code:"print('ok')", hyperparams:{ n_estimators:100 } }`. Click **Generate**; CodePane updates; hyperparam control shows 100; button disabled while loading.
  * Mock `/api/strategy/run` → `{ metrics:{ accuracy:0.7 }, predictions:[{ts:"2024-01-01",symbol:"AAPL",y_pred:1}] }`. Click **Run ML**; metrics rendered; 1 prediction row present.
* **File:** `tests/strategy-manual-mode.test.tsx`

  * Toggle **Manual checker**; **Generate** buttons disabled; sample DSL/ML code present (non-empty).
  * Run buttons still enabled; clicking triggers single request (ensure single-flight).
* **File:** `tests/strategy-sectors.test.tsx`

  * Provide mock `sectors.json` (jest/vitest mock for fetch). Select “Technology” + “AAPL” manually; payload includes deduped union.
* **File:** `tests/strategy-loading-guards.test.tsx`

  * Click **Run** twice quickly → only one network call fires; button text flips to `Running…`.
* **File:** `tests/strategy-health-badge.test.tsx`

  * Mock `/api/ml/health` ok → badge “ML online”; error → “ML offline” and ML actions disabled with tooltip.

> Keep tests fast by mocking `fetch` and any heavy components. Use `data-testid`/`aria-label`s consistently (we already added specific labels earlier).

---

## 10) Docs updates

**.env.example**

```
NEXT_PUBLIC_APP_URL=http://localhost:3000

# S3 parquet (public discovery)
AWS_REGION=us-east-1
AWS_BUCKET=ai-backtester-data-rosh
AWS_PREFIX=prod
S3_BASE=https://ai-backtester-data-rosh.s3.amazonaws.com/prod

# ML service
ML_API_URL=https://<your-app-runner-domain>/
# optional (local): ALLOW_LOCAL_PY=0
```

**README.md** (append/replace sections as needed)

* **Strategy Lab (DSL & ML):**

  * Tabs, **ML health badge** (`/api/ml/health`), auto example prompts.
  * **Manual Checker** mode (Generate disabled; prefilled scripts; Run allowed).
  * **Loading/disable** behavior to prevent double-clicks.
* **Sectors (ML):** Select sectors or stocks; union + dedupe; `sectors.json` source (S3_BASE then local).
* **Quick test plan:** how to run `npm test`, what to expect (key passing assertions).
* **Environment vars:** list and meanings.
* **Troubleshooting:** CORS on ML, 400 tickers error, ML_API_URL unset (501).

**DOCUMENTATION.md**

* **API contracts** (`/api/strategy/generate`, `/api/strategy/run`)

  * Request/response for DSL & ML; error shape `{ error: string }`.
* **Data layout:** S3 parquet per symbol at `s3://<bucket>/<prefix>/<SYMBOL>.parquet`; optional `sectors.json` manifest; future sector expansion.
* **AWS Deployment:** Docker → ECR → App Runner. Roles (`AppRunnerECRAccessRole`, `AppRunnerInstanceS3ReadRole`), env vars, health check `/health`, scaling hints.
* **Runtime model:** ML service reads S3 parquet via role with S3 read.
* **Test coverage map:** list the test files and what they verify.

**agents.md**

* **Purpose & scope:** DSL and ML backtesting agents; what state/store to touch.
* **State/UX contract:** Single-flight, health polling, disabling rules, Manual checker behavior.
* **Templates:** DSL sample, ML Python template, hyperparams schema expectations.
* **Data sources:** S3 parquet layout; `sectors.json` contract and priority (S3 then local).
* **AWS runbook:** How the Docker/ECR/App Runner pieces fit; redeploy steps; env changes.
* **Diagnostics:** What to log/return from ML service (`metrics`, `predictions`, optional `logs`).

---

## 11) Small UI affordances (consistency)

* Ensure **aria-label**/`data-testid` on:

  * Generate/Run buttons for DSL & ML (distinct).
  * Health badge (`ml-health-badge`).
  * Sector chips and sector multi-select.
  * Manual checker toggle.
  * Code editors (`dsl-editor`, `ml-editor`).
* Tooltips on disabled ML actions when offline: “ML service offline.”

---

## 12) Finalize (single commit)

Run and verify:

```bash
npm run test
npm run typecheck
npm run build
```

**Stage all**, then **one commit** only:

```bash
git add -A
git commit -m "feat(strategy): unify payloads; fix DSL tickers; fully wire ML generate/run with loading & results; add Manual Checker; sector selection; comprehensive tests; and expanded docs for AWS/S3/ML. (single commit)"
```

Push to **FeatureComponent**.

**End.**
