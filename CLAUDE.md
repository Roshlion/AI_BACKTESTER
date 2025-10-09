Here’s a single **copy-paste CLAUDE prompt** you can drop into `CLAUDE.md` on your **FeatureComponent** branch. It tells Claude exactly what to change, add, and verify—covering ML UI visibility, a health badge + health API proxy, “Example prompts” & “How it works” sections, and deep documentation (README + DOCUMENTATION.md + agents.md) with the AWS (Docker/ECR/App Runner) setup and your S3 Parquet layout.

---

# CLAUDE.md — IMPLEMENT ML UI + HEALTH + DOCS (FeatureComponent)

You are working on the **FeatureComponent** branch. Apply everything below, commit in logical chunks, and keep tests green. Assume Next.js App Router, Vitest + React Testing Library, and the Python FastAPI service at `services/ml/`.

## 0) Guardrails

* Don’t remove anything used by tests or by the app.
* Keep the three-tab shell (Dashboard/Strategy Lab/Data Warehouse).
* Always render the **Strategy Lab → ML** tab (show disabled controls if ML service is offline).
* After changes: `npm run test && npm run typecheck && npm run build`.

---

## A) ML VISIBILITY, HEALTH BADGE, & API PROXY

### A1) Add ML health proxy route

Create `app/api/ml/health/route.ts` (App Router):

```ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = process.env.ML_API_URL?.replace(/\/+$/, '');
  if (!base) {
    return NextResponse.json({ status: 'down', error: 'ML_API_URL not set' }, { status: 200 });
  }
  try {
    const r = await fetch(`${base}/health`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json().catch(() => ({}));
    return NextResponse.json({ status: 'ok', upstream: j }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ status: 'down', error: String(e?.message || e) }, { status: 200 });
  }
}
```

### A2) Strategy Lab: show DSL/ML tabs + health badge

Update the Strategy Lab client component (usually `app/(shell)/strategy/StrategyClient.tsx`; if this file doesn’t exist, create it and import it from `app/(shell)/strategy/page.tsx`). Requirements:

* Tabs at top-right: **DSL** | **ML**.
* Health badge next to “Strategy Lab” title. It polls `/api/ml/health` on mount and every 30s.
* If health is `down`, ML controls render but “Generate”/“Run” are **disabled** with a tooltip.

Add/merge (don’t duplicate imports):

```tsx
'use client';
import React from 'react';

type Health = { status: 'ok'|'down'; error?: string };

export default function StrategyClient() {
  const [mode, setMode] = React.useState<'dsl'|'ml'>('dsl');
  const [health, setHealth] = React.useState<Health>({ status: 'down' });

  React.useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const r = await fetch('/api/ml/health', { cache: 'no-store' });
        const j = await r.json();
        if (alive) setHealth(j);
      } catch {
        if (alive) setHealth({ status: 'down', error: 'fetch failed' });
      }
    };
    ping();
    const id = setInterval(ping, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const badge =
    <span
      className={`ml-3 inline-flex items-center px-2 py-1 rounded text-xs
      ${health.status==='ok' ? 'bg-green-700/40 text-green-200' : 'bg-red-700/40 text-red-200'}`}
      title={health.status==='ok' ? 'ML service reachable' : (health.error || 'ML service down')}
      data-testid="ml-health-badge"
    >
      {health.status==='ok' ? 'ML online' : 'ML offline'}
    </span>;

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-3xl font-bold text-white">Strategy Lab</h1>
          {badge}
        </div>

        <div className="inline-flex rounded-lg overflow-hidden border border-gray-700">
          <button
            data-testid="tab-dsl"
            onClick={() => setMode('dsl')}
            className={`px-4 py-2 text-sm ${mode==='dsl'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300 hover:text-white'}`}
          >DSL</button>
          <button
            data-testid="tab-ml"
            onClick={() => setMode('ml')}
            className={`px-4 py-2 text-sm ${mode==='ml'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300 hover:text-white'}`}
          >ML</button>
        </div>
      </div>

      {/* render the two panels */}
      {mode==='dsl' ? <DslPanel /> : <MlPanel mlOnline={health.status==='ok'} />}
      
      <HelpSections />
    </div>
  );
}

// Placeholders; wire to existing panels/components if present
function DslPanel() { return <div>{/* existing DSL UI */}</div>; }
function MlPanel({ mlOnline }: { mlOnline: boolean }) {
  return (
    <div className="space-y-6">
      {/* existing ML UI (ModelCard, HyperparamForm, CodePane) */}
      <button
        className="mt-3 px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-600"
        disabled={!mlOnline}
        title={mlOnline ? '' : 'ML service offline'}
      >
        Generate
      </button>
      <button
        className="mt-3 px-4 py-2 rounded bg-green-600 text-white disabled:bg-gray-600"
        disabled={!mlOnline}
        title={mlOnline ? '' : 'ML service offline'}
      >
        Run ML
      </button>
    </div>
  );
}
```

---

## B) “EXAMPLE PROMPTS” + “HOW IT WORKS” (DSL & ML)

Append a unified helper section to Strategy Lab, at the bottom of the page, used by both modes:

```tsx
function HelpSections() {
  const exampleDsl = [
    'Momentum cross: Buy when 20 EMA crosses above 50 EMA; sell on cross down.',
    'RSI mean reversion: Buy RSI<30 with 2% stop; sell RSI>55 or after 10 days.',
    'MACD trend follow: Enter on MACD>0 & price>200SMA; exit on MACD<0.'
  ];
  const exampleMl = [
    'GradientBoosting on daily OHLCV features with 60-day lookback; predict next-day return.',
    'RandomForest using RSI/MACD/SMA(20,50) with sector embedding; optimize F1 for “up day”.',
    'XGBoost with engineered volatility & rolling-beta; predict 5-day risk-adjusted return.'
  ];

  const fill = (text: string) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Describe your trading strategy"]');
    if (ta) { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
  };

  return (
    <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Example prompts</h3>
        <div className="space-y-2">
          {[...exampleDsl, ...exampleMl].map((p, i) => (
            <button
              key={i}
              onClick={() => fill(p)}
              className="block w-full text-left px-3 py-2 rounded bg-gray-700 text-gray-100 hover:bg-gray-600"
              data-testid={`example-prompt-${i}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-3">How it works</h3>
        <ol className="text-gray-300 list-decimal pl-5 space-y-2">
          <li>Describe your idea → we generate either DSL (rules) or ML (model + params).</li>
          <li>Review and edit: indicators, tickers, dates (auto min/max from selected), hyperparameters.</li>
          <li>Run: backtester executes DSL; ML service trains/evaluates using Parquet from S3.</li>
          <li>Inspect outputs: metrics, charts, predictions; iterate quickly.</li>
        </ol>
      </div>
    </div>
  );
}
```

---

## C) API-TESTER: add ML section with live health

Update the existing `/api-tester` page (do not remove current content). Add a small ML box:

```tsx
// Inside api-tester page
function MlHealthBox() {
  const [j, setJ] = React.useState<any>(null);
  return (
    <div className="bg-gray-800 rounded-lg p-4 mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">ML Service</h3>
        <button
          className="px-3 py-1 rounded bg-gray-700 text-gray-100"
          onClick={async () => {
            const r = await fetch('/api/ml/health'); const x = await r.json(); setJ(x);
          }}
          data-testid="ml-health-refresh"
        >Check</button>
      </div>
      <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap">{j ? JSON.stringify(j, null, 2) : '—'}</pre>
    </div>
  );
}
```

---

## D) PYTHON ML SERVICE: confirm S3 layout & (optional) CORS

**S3 layout:** per-symbol Parquet at `s3://ai-backtester-data-rosh/prod/<SYMBOL>.parquet`.

1. Ensure `services/ml/app/*` loads Parquet via env:

   * `DATA_BUCKET=ai-backtester-data-rosh`
   * `DATA_PREFIX=prod/`
   * `DATA_LAYOUT=per-symbol`
   * `AWS_REGION=us-east-1`

2. Add adjustable CORS (if not present) in `services/ml/app/main.py`:

```py
from fastapi.middleware.cors import CORSMiddleware
import os

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins!=["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

* We will set `CORS_ORIGINS` in App Runner later if needed (e.g., your Vercel domain).

3. Make sure `requirements.txt` includes: `fastapi uvicorn boto3 s3fs pyarrow pandas numpy scikit-learn`.

*Rebuild/push image only if you changed the Python code; otherwise skip.*

---

## E) TESTS (vitest)

Add/adjust tests to cover:

1. Strategy Lab renders DSL/ML tabs and health badge:

   * `getByTestId('tab-ml')` exists.
   * `getByTestId('ml-health-badge')` shows “ML online/offline” depending on mocked `/api/ml/health`.
2. Example prompt button inserts text into the correct textarea.
3. ML disabled state when health is `down`.

You can stub `global.fetch` in tests to return `{status:'ok'}` or `{status:'down'}` for `/api/ml/health`.

---

## F) DOCUMENTATION — expand thoroughly

### F1) README.md (top-level)

Add a new section **“Architecture overview & deployments”**:

* **Frontend (Vercel)**: Next.js app (Dashboard / Strategy Lab / Data Warehouse), `ML_API_URL` consumed by `/api/ml/health` and strategy routes.
* **ML Service (AWS App Runner)**: Docker image from **ECR**, runs FastAPI on **port 8000**.
* **Data**: S3 bucket `ai-backtester-data-rosh`, layout **per-symbol** at `prod/<SYMBOL>.parquet`.
* **Environments**:

  * Local: set `.env.local` (`ML_API_URL` optional), run `npm run dev`.
  * Cloud: set Vercel env `ML_API_URL=https://<apprunner-domain>/`.

Add **Quickstart**:

1. Build/push ML: `services/ml/Dockerfile` → ECR.
2. App Runner: create service, **Instance role** with `AmazonS3ReadOnlyAccess`, envs (`DATA_BUCKET=ai-backtester-data-rosh`, `DATA_PREFIX=prod/`, `DATA_LAYOUT=per-symbol`), health `/health`, port 8000.
3. Vercel: add `ML_API_URL`, redeploy.

### F2) DOCUMENTATION.md

Add detailed runbook sections (bullet points, not prose walls):

* **S3 Data Layout**

  * Bucket: `ai-backtester-data-rosh`
  * Prefix: `prod/`
  * Files: `prod/<SYMBOL>.parquet` (per-symbol)
  * Expected columns: date/time, open/high/low/close/volume (+ engineered features if present)
  * Min/Max date discovery for selected tickers (used to auto-populate date range in UI)
* **Docker/ECR/App Runner**

  * Build: `docker build -t ai-backtester-ml:latest .` (from `services/ml`)
  * Tag/push to: `<ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/ai-backtester-ml:latest`
  * App Runner: container URI, automatic deployments, port 8000, health `/health`
  * Roles:

    * **ECR access role** (created by App Runner wizard)
    * **Instance role** with **AmazonS3ReadOnlyAccess**
  * Env vars on service:

    * `DATA_BUCKET=ai-backtester-data-rosh`
    * `DATA_PREFIX=prod/`
    * `DATA_LAYOUT=per-symbol`
    * `AWS_REGION=us-east-1`
    * `CORS_ORIGINS=https://<your-vercel-domain>` (optional)
* **Environment Variables**

  * **App (Vercel / local)**: `ML_API_URL`, `OPENAI_API_KEY` (if used by the app), `NEXT_PUBLIC_APP_URL`
  * **ML service (App Runner)**: `DATA_*`, `AWS_REGION`, optional `CORS_ORIGINS`
  * Do **not** store AWS keys in `.env.local` or Vercel. App Runner uses its **instance role** for S3.
* **Health & Troubleshooting**

  * `/api/ml/health` (frontend) → proxies App Runner `/health`.
  * Common errors: 403 S3 (missing instance role), CORS, `ML_API_URL` blank.
  * How to tail App Runner logs; redeploy steps.

### F3) agents.md (new or extend heavily)

Purpose: a living handoff file for ML agents. Include:

* **System diagram**: Vercel (Next.js) → `ML_API_URL` → App Runner (FastAPI) → S3 (Parquet per-symbol).
* **Data contracts**

  * Request: tickers[], startDate, endDate, modelType, hyperparams (strict schema), renderedCode (if using templating)
  * Response: metrics (accuracy/F1/MSE/etc.), feature importances (if supported), predictions (per timestamp), logs.
* **Templates & Models**

  * Supported: RandomForest, XGBoost/GradientBoosting, LogisticRegression; feature windowing (rolling means, RSI/MACD/SMA/EMA).
  * Template placeholder list and validation rules.
* **S3 paths**

  * `s3://ai-backtester-data-rosh/prod/<SYMBOL>.parquet` (CSV/Parquet schema expectations).
* **Deployment playbook**

  * ECR build/tag/push commands.
  * App Runner create/update, required roles & envs.
  * CORS tuning via `CORS_ORIGINS`.
* **Ops**

  * Health checks, log locations, how to bump instance size, autoscaling notes.
  * Security: instance role only, no long-lived secrets in app.
* **TODOs**

  * Sector filters—expected `sectors.json` manifest (optional) and how to wire sector→tickers.
  * Model registry (persist configs).
  * Batched training/explainability.

---

## G) CLEANUP & ENV EXAMPLES

* Update `.env.example`:

  ```
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  OPENAI_API_KEY=
  OPENAI_MODEL=gpt-4o-mini
  ML_API_URL=
  S3_BASE=https://ai-backtester-data-rosh.s3.amazonaws.com/prod
  ```
* Do not include AWS keys in `.env.example` or README.
* Remove duplicate/unused envs from examples; keep comments short.

---

## H) FINALIZE

1. Implement code + docs above.
2. Add/adjust tests (as noted).
3. Run locally:

   ```
   npm ci
   npm run test
   npm run typecheck
   npm run build
   npm run dev
   ```
4. Commit with messages:

   * `feat(strategy): add DSL/ML tabs, ML health badge, helper sections`
   * `feat(api): add /api/ml/health proxy`
   * `docs: expand README/DOCUMENTATION/agents for AWS + S3 layout`
   * `test: cover ML health, example prompts, disabled states`
5. Push to **FeatureComponent** and open a PR.

---

**NOTE:** If ML service is online (App Runner `/health` OK) but browser calls fail due to CORS, set in App Runner **Environment variables**:

```
CORS_ORIGINS=https://<your-vercel-domain>
```

and redeploy the service.

---

**End of instructions.**
