Here’s your **full CLAUDE PROMPT** (raw text). Paste it into Claude and run it on the **FeatureComponent** branch.

---

TITLE: Finish 3-tab app, fix tests, re-integrate Strategy Builder into Strategy Lab (DSL + ML), add ML backend client + AWS deploy path, clean repo, and add agents.md

SCOPE / BRANCH:

* Work ONLY on branch `FeatureComponent`. Do NOT touch `main` or create new branches.
* Keep the 3 tabs: Dashboard (default), Strategy Lab, Data Warehouse.
* Fix failing tests, reintroduce the Strategy Builder UX into Strategy Lab (including example prompts + “How it works”), integrate ML flow with an external Python service (config-gated), clean unused code, and update docs.
* When done: run tests, typecheck, build, commit, push.

---

## A) TEST FAILURES (fix first)

Root cause: queries find multiple elements (duplicate aria-labels or roles).

1. In the ticker row component used on Dashboard:

   * Make labels/testids symbol-specific.

     * Eye icon (Data Warehouse link): aria-label = `Open ${symbol} in Data Warehouse`, data-testid = `eye-${symbol}`.
     * Isolate action: aria-label = `Isolate ${symbol}`, data-testid = `isolate-${symbol}`.
   * Add a data attribute on the row wrapper: `data-row="ticker-${symbol}"`.

2. Textareas in Strategy Lab:

   * Prompt textarea: `aria-label="Strategy Description"`.
   * DSL textarea: `aria-label="DSL Code"`.

3. Update tests accordingly:

   * In `tests/dashboard-select.test.tsx`: query **within the AAPL row** or use testids:

     * `const row = screen.getByText('AAPL').closest('[data-row="ticker-AAPL"]')`
     * `within(row!).getByTestId('eye-AAPL')`
     * `within(row!).getByTestId('isolate-AAPL')`
   * In `tests/dashboard-to-strategy-handoff.test.tsx`:

     * `getByLabelText('Strategy Description')` for the prompt.
     * If needed elsewhere: `getByLabelText('DSL Code')`.
   * Ensure queries are specific (no `getByRole('textbox')` unless there’s only one).

Run:

* `npm run test` (iterate until all green).

---

## B) APP SHELL (keep as-is)

* Keep the shared layout `app/(shell)/layout.tsx` with tabs:

  * `/dashboard` label “Dashboard”
  * `/strategy` label “Strategy Lab”
  * `/explore` label “Data Warehouse”
* No “Quick Links”. Tabs are the only navigation.

---

## C) DASHBOARD (minor confirmations)

* Keep full-row multi-select with row highlight (no checkboxes).
* Search filters the list; max-height + scroll; show “No tickers found” when empty.
* Right side controls per row:

  * Eye icon → `Link` to `/explore?symbol=<SYMBOL>` (does not toggle selection).
  * Three-dot menu with “Isolate this ticker” (sets selected = [SYMBOL] only).
* Indicators:

  * SMA/EMA toggles with double-click numeric input (defaults: SMA 50, EMA 20).
  * RSI(14), MACD(12/26/9) fixed.
* Dates:

  * Auto-fill Start/End = min/max across selected tickers.
  * Manual edits respected; “Reset range” restores full span.
* Handoff:

  * On “Create a strategy with this”: write `{tickers, indicators, start, end}` to Zustand store, `router.push('/strategy')` (no intermediate pages).

---

## D) STRATEGY LAB — reintroduce Strategy Builder UX (DSL + ML)

Goal: Bring the `/backtester` “Strategy Builder” UI into the **Strategy Lab** tab and keep it feature-complete.

1. Structure:

   * Keep server→client split:

     * `app/(shell)/strategy/page.tsx` (Server): `dynamic='force-dynamic'`, `revalidate=0`, parse `searchParams`, pass to client inside `<Suspense>`.
     * `app/(shell)/strategy/StrategyClient.tsx` (Client): renders everything below.
   * Prefill order:

     * If `searchParams` present → use them.
     * Else if Zustand store has a payload from Dashboard → use it.
     * Else → empty defaults.

2. Strategy Builder UI inside StrategyClient:

   * “Strategy Type” toggle with two modes:

     * Rule-Based (DSL)
     * Machine Learning
   * Keep the original **example prompts** (short list) and the **“How it works”** panel at the bottom. Do not remove any content that tests reference. If you still have `/backtester` code for examples and descriptions, **move** it into StrategyClient (or a child component) and **delete** `/backtester` page after migration.
   * Inputs row: tickers (comma-separated or multi-select chips), Start Date, End Date.
   * Buttons:

     * “Generate DSL” (for Rule-Based)
     * “Generate & Test Strategy” (for ML mode) — see ML flow below.
   * Textareas:

     * Strategy Description (aria-label as above) — hint/autofill from Dashboard indicators: e.g., “Use SMA(50), EMA(20), RSI…”
     * DSL Code (aria-label as above)

3. Sector selection (Strategy Lab only):

   * If a sector mapping exists (field `sector` on manifest, `public/sectors.json`, or `lib/metadata/sectors.ts`), show a collapsible “Filter by sector” with multi-select; selecting sectors unions their tickers into selection; deselecting removes them (unless manually re-added).
   * If mapping not found, hide the control.

4. Keep the existing backtest flow:

   * Rule-Based:

     * “Generate DSL” → call `/api/strategy/generate?mode=dsl` with the description; render DSL into the DSL textarea.
     * “Run backtest” → call existing `/api/strategy/run` with `{dsl, tickers, start, end}`.
   * ML Mode: see next section.

---

## E) ML INTEGRATION — UI + server proxy (config gated)

Objective: ML mode that (1) generates a baseline model config and editable hyperparameters from the user’s natural language strategy, then (2) trains/predicts with the selected data.

1. UI flow (ML mode in StrategyClient):

   * Step 1: user writes an ML description (or it’s prefilled from Dashboard context).
   * Step 2: on “Generate & Test Strategy”:

     * POST to `/api/strategy/generate?mode=ml` with `{description, tickers, start, end}`.
     * Expect response: `{ code: string, hyperparams: object, uiSchema: object, modelType: string }`.

       * `code`: python function or pipeline template (read-only display).
       * `hyperparams`: editable key/values (e.g., n_estimators, window, test_size).
       * `uiSchema`: simple schema telling the UI how to render fields (number, select, min/max, help).
     * Render an editable **Hyperparams** panel from `uiSchema`.
   * Step 3: on “Run ML”:

     * POST `/api/strategy/run` with `{mode: 'ml', tickers, start, end, code, hyperparams}`.
     * Display metrics and prediction plots on return.

2. Next.js API behavior:

   * Create/extend `lib/ml-client.ts` to call an external service at `process.env.ML_API_URL`.

     * `generate({description, tickers, start, end})` → `POST /ml/generate` on Python service.
     * `trainPredict({tickers, start, end, code, hyperparams})` → `POST /ml/run`.
   * In `/api/strategy/generate`:

     * If `mode === 'ml'`:

       * If `ML_API_URL` set → call `mlClient.generate`.
       * Else if `ALLOW_LOCAL_PY=1` AND `process.env.NODE_ENV !== 'production'` → fallback local exec via `child_process` (python) in dev only.
       * Else → return 501 with message “ML disabled; set ML_API_URL”.
   * In `/api/strategy/run`:

     * If `mode === 'ml'` → proxy to `mlClient.trainPredict` (or local dev fallback as above).

3. UI gating:

   * Show the **ML option** only if either:

     * `process.env.ML_API_URL` is defined, OR
     * `ALLOW_LOCAL_PY=1` in dev.
   * Otherwise show a small note: “ML unavailable: set ML_API_URL”.

---

## F) PYTHON SERVICE (external) — scaffold + endpoints

Create a sibling folder in this repo: `services/ml` (may push to its own repo later).

Files:

* `services/ml/app/main.py` (FastAPI)
* `services/ml/requirements.txt` (fastapi uvicorn scikit-learn pandas numpy ta prophet orstatsmodels joblib pydantic)
* `services/ml/Dockerfile`
* `services/ml/README.md`

FastAPI endpoints (minimal viable):

* `GET /health` → `{status:'ok'}`
* `POST /ml/generate` (accept `{description, tickers, start, end}`):

  * Return baseline:

    ```
    {
      "modelType": "RandomForestRegressor",
      "code": "# python template that trains RF on features",
      "hyperparams": { "n_estimators": 200, "max_depth": 8, "window": 60, "test_size": 0.2, "random_state": 42 },
      "uiSchema": {
        "n_estimators": { "type":"number", "min":50, "max":1000, "step":50, "help":"Number of trees" },
        "max_depth": { "type":"number", "min":2, "max":30, "step":1 },
        "window": { "type":"number", "min":5, "max":250, "step":5, "help":"Feature lookback window (days)" },
        "test_size": { "type":"number", "min":0.1, "max":0.5, "step":0.05 },
        "random_state": { "type":"number", "min":0, "max":9999, "step":1 }
      }
    }
    ```
* `POST /ml/run` (accept `{tickers, start, end, code, hyperparams}`):

  * Build features from OHLC (close/returns, rolling means, RSI/MACD via `ta`), split train/test via `test_size`, train the model from `code` (or template switch on `modelType`), return:

    ```
    {
      "metrics": { "rmse": ..., "mape": ... },
      "predictions": [{ "date":"YYYY-MM-DD", "y":..., "yhat":... }, ...]
    }
    ```
  * Keep runtime < 20–30s. Use downsampling and small defaults.

CORS: enable `origins=['*']` (or Vercel domain) for now.

Dockerfile (slim):

* `python:3.11-slim`, install requirements, `uvicorn app.main:app --host 0.0.0.0 --port 8000`.

---

## G) AWS DEPLOY OPTIONS FOR THE PYTHON SERVICE (pick one)

Option 1 — **AWS App Runner** (simplest managed containers):

1. Create ECR repo; build/push image:

   * `docker build -t ml-service:latest services/ml`
   * `aws ecr get-login-password ... | docker login ...`
   * `docker tag ml-service:latest <account>.dkr.ecr.<region>.amazonaws.com/ml-service:latest`
   * `docker push <account>.dkr.ecr.<region>.amazonaws.com/ml-service:latest`
2. App Runner: “Create service” → from ECR → set port 8000 → envs if needed → auto HTTPS.
3. Copy service URL → set `ML_API_URL` in Vercel.

Option 2 — **AWS Lambda + API Gateway** (cold starts; OK if light):

* Swap uvicorn for `Mangum` in FastAPI (`handler = Mangum(app)`), package as container image to ECR, create Lambda from image, add HTTP API via API Gateway, map to `/`, set timeout/memory (e.g., 2–3GB, 20–29s), enable CORS, set `ML_API_URL` to the API Gateway URL.

Option 3 — **ECS Fargate + ALB** (more control, more setup):

* Task definition from ECR image, service behind an ALB, target group port 8000, security group open 80/443, set desired count 1–2. Use ALB DNS as `ML_API_URL`.

Non-AWS easy alternatives (if you prefer): Render, Railway, Fly.io — deploy Docker, grab public URL, set `ML_API_URL`.

---

## H) FRONTEND: show ML mode hints and “How it works”

* In Strategy Lab, beneath the Builder, render:

  * Example prompts (DSL-oriented + ML-oriented) — revive from the `/backtester` version.
  * “How it works” box with short explanations for both modes (DSL and ML).
* Keep texts short; ensure tests don’t depend on exact wording (unless they already do).

---

## I) CHART READABILITY (confirm it stays)

* Legend click: toggle series visibility.
* Legend hover: emphasize series (opacity others to ~0.3).
* Modes: Price (default), Indexed %, Small multiples (first 6 by default, “Show all” toggle).
* RSI/MACD in subpanels with reference lines.
* Basic downsampling when points > threshold.

---

## J) CLEANUP

* Delete `/backtester` page after you’ve migrated its Builder UI into Strategy Lab (but keep any shared components you reused).
* Remove any invalid named exports from `page.tsx` files; move helpers to `utils.ts`.
* Remove unused components/assets/scripts.
* Keep only: `(shell)/dashboard`, `(shell)/strategy`, `(shell)/explore`, APIs, libs, components, tests, and the new `lib/ml-client.ts`.
* If you added `public/sectors.json` for mapping, keep it; hide sector UI if not present.

---

## K) ENV & CONFIG

* Add to `.env.local.example`:

  ```
  ML_API_URL=
  ALLOW_LOCAL_PY=0
  ```
* In dev you can set `ALLOW_LOCAL_PY=1` to enable local python fallback (child_process) if you implement it. For production on Vercel, rely on `ML_API_URL`.

---

## L) DOCS

Update README.md (concise):

* 3 tabs (Dashboard, Strategy Lab, Data Warehouse).
* Dashboard: multi-select rows, eye→Explore, isolate action, indicators with editable SMA/EMA, auto min/max dates, “Create a strategy with this”.
* Strategy Lab: Builder (DSL + ML), example prompts, “How it works”, sector multi-select (if available), prefill from URL/store, generate DSL or ML, run backtest.
* Data Warehouse: `/explore?symbol=XYZ`.
* ML: set `ML_API_URL` to enable ML mode; optional local dev fallback with `ALLOW_LOCAL_PY`.
* Next.js notes: page export limits; server→client boundary; Suspense rules.
* Quick start commands and env setup.

Update DOCUMENTATION.md (more detail):

* Strategy Builder schema (DSL and ML).
* `ml-client` API contract (generate/run payloads).
* Sector mapping fallback order.
* Chart modes and performance notes.
* Deployment notes for Python service (App Runner/Lambda/ECS).
* Test conventions (symbol-specific aria/testids, textarea labels).

Add `agents.md` (new file) — living doc for ML agents:

* Sections:

  1. Purpose & scope of ML agent.
  2. Data sources available (OHLC + indicators; where fetched; shapes).
  3. Current ML endpoints (generate/run payloads, expected responses).
  4. Current model templates supported (e.g., RandomForestRegressor; planned: XGBoost, Prophet).
  5. Feature engineering currently applied (returns, rolling means, RSI/MACD).
  6. Hyperparameter schema and defaults; UI schema rules.
  7. Evaluation metrics we compute and return (RMSE, MAPE; add others later).
  8. Known limits (runtime ceilings, downsampling).
  9. Deployment pointers (where ML_API_URL points; region; scaling).
  10. Next iteration TODOs.
* Ensure `agents.md` is updated whenever the ML flow changes.

---

## M) COMMANDS TO RUN (Claude)

1. Install, test, typecheck, build:

   ```
   npm ci
   npm run test
   npm run typecheck
   npm run build
   ```

   Fix any failures and re-run until green.

2. Commit and push:

   ```
   git add -A
   git commit -m "feat(strategy): integrate Strategy Builder (DSL+ML) in Strategy Lab; ML client + gating; tests fixed; charts; sectors; cleanup; docs; agents.md"
   git push -u origin FeatureComponent
   ```

---

AFTER CLAUDE PUSHES, DO THIS LOCALLY:

```
git fetch origin
git switch FeatureComponent
git pull --ff-only origin FeatureComponent
npm ci
npm run dev
```

Smoke test tabs, Strategy Builder (both modes), sector filter, charts, and eye/isolate actions. When satisfied, open a PR `FeatureComponent → main`.

---

INTEGRATING THE ML SERVICE (AWS quick picks):

Option A (easiest AWS): App Runner

* Build/push Docker from `services/ml`.
* Create App Runner service from ECR image (port 8000).
* Set `ML_API_URL` on Vercel to the App Runner URL.

Option B: Lambda + API Gateway

* Use FastAPI + Mangum; container to ECR; Lambda from image; HTTP API; set CORS; increase memory and timeout; set `ML_API_URL`.

Either way: confirm `GET /health` returns ok, then test from your app (Strategy Lab → ML mode).

ADD-ON: ML “Generate → Review/Edit → Run” with visual model card and live params

Two-step flow (mirrors DSL):

Step 1: Generate ML → POST /api/strategy/generate?mode=ml with {description, tickers, start, end}.
Response MUST include:

{
  modelType: string,               // e.g., "RandomForestRegressor"
  summary: { purpose, notes? },    // short description for the card
  codeTemplate: string,            // python template with tokens like {{n_estimators}}
  hyperparams: { key: value, ...}, // defaults
  uiSchema: { key: {type,min,max,step,options?,help?}, ...}
}


Step 2: Review/Edit (before running):

Show a Model Card with modelType + summary.

Render Hyperparameter Form from uiSchema.

Show Python Code pane generated from codeTemplate with current hyperparams (see templating below).

Changes in the form live-update the code pane.

Step 3: Run ML → POST /api/strategy/run with:

{
  mode: "ml",
  tickers, start, end,
  modelType,
  hyperparams,               // final edited values
  code: renderedCode         // result of templating with current hyperparams
}


Templating (live code update):

Implement a tiny, safe templater (no eval): replace {{key}} with stringified hyperparams[key].

Keep codeTemplate read-only; render to renderedCode on each param change.

Validation: clamp to min/max/step from uiSchema; show inline errors; disable “Run ML” if invalid.

UI components (Strategy Lab → ML mode):

ModelCard (props: modelType, summary)

HyperparamForm (props: hyperparams, uiSchema, onChange)

CodePane (read-only textarea, aria-label="ML Code")

Buttons: “Generate ML”, “Run ML”

Gate by ML_API_URL (or ALLOW_LOCAL_PY in dev).

Persistence & export:

Allow Download of current ML spec: {modelType, hyperparams, renderedCode} as JSON + .py.

Store the last generated spec in Zustand so navigating tabs preserves it.

Tests (brief):

Generate → renders ModelCard, Form, CodePane.

Editing a param updates code (assert string replacement).

“Run ML” posts {renderedCode, hyperparams} (mock API).

Accessibility: aria-label="ML Code"; hyperparam inputs have labels.

Files touched:

app/(shell)/strategy/StrategyClient.tsx (add ML mode panel).

components/strategy/ModelCard.tsx, HyperparamForm.tsx, CodePane.tsx.

lib/template.ts (pure replacer).

API: /api/strategy/generate and /api/strategy/run (ml branches use ml-client).

Don’t remove:

Keep “Example prompts” and “How it works” at bottom of Strategy Lab (both DSL + ML sections).
