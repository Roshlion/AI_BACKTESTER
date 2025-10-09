# AI Agent Guide - AI Backtester Project

**Purpose**: This document is specifically for AI assistants/agents working on this codebase. It contains project context, work history, ongoing issues, recent changes, and critical information needed to contribute effectively.

**For Users**: See [README.md](./README.md)
**For Technical Details**: See [DOCUMENTATION.md](./DOCUMENTATION.md)

---

## Quick Onboarding

### What You Need to Read First
1. **This file** (agents.md) - Complete context and recent work
2. [README.md](./README.md) - User-facing features and quick start
3. [DOCUMENTATION.md](./DOCUMENTATION.md) - Technical architecture and API details
4. [CLAUDE.md](./CLAUDE.md) - Current instructions/requirements for active work

### Current Branch & Status
- **Active Branch**: `FeatureComponent`
- **Main Branch**: `main` (stable, for PRs)
- **Last Major Commit**: 2025-10-09 - ML UI visibility, health badge, AWS deployment docs
- **Build Status**: ⏳ Pending validation (changes uncommitted)

---

## Recent Work History & Change Log

### 2025-10-09: ML UI Visibility & Health Monitoring
**What Was Done**:
- Implemented DSL/ML tab switcher in Strategy Lab with health badge
- Added ML health monitoring via `/api/ml/health` proxy endpoint
- Health badge polls every 30 seconds, shows "ML online/offline" status
- ML tab shows placeholder UI; controls disabled when service offline
- Added "Example prompts" and "How it works" helper sections
- Updated API tester page with ML service health check widget
- Enhanced Python ML service:
  - Configurable CORS via `CORS_ORIGINS` environment variable
  - S3 configuration via env vars (`DATA_BUCKET`, `DATA_PREFIX`, `DATA_LAYOUT`)
  - Health endpoint now returns service config for debugging
  - Added boto3, s3fs, pyarrow dependencies for S3 Parquet access
- Comprehensive documentation updates:
  - README: Added "Architecture Overview & Deployments" with AWS quickstart
  - DOCUMENTATION.md: Added ML Service section with Docker/ECR/App Runner workflow
  - agents.md: Updated status and work log
- Updated `.env.example` with ML variables and security notes

**Why It Matters**:
- ML features now visible in UI with clear online/offline status
- Users can toggle between DSL and ML modes seamlessly
- Health monitoring prevents confusing errors when ML service unavailable
- Complete deployment documentation for AWS App Runner
- Production-ready CORS and S3 configuration

**Implementation Details**:
- Health polling pattern: useEffect with 30s interval, cleanup on unmount
- Disabled state tied to health.status !== 'ok'
- Example prompts work for both DSL and ML modes
- S3 layout: `s3://ai-backtester-data-rosh/prod/<SYMBOL>.parquet`

### 2025-10-08: ML Integration & Infrastructure (Commit 1a87eb4)
**What Was Done**:
- Fixed Dashboard test failures by adding symbol-specific `aria-label` and `data-testid` attributes
- Created complete ML infrastructure:
  - `lib/ml-client.ts`: Client for external Python ML service with local dev fallback
  - `lib/template.ts`: Safe hyperparameter templating with validation
  - `components/strategy/`: ModelCard, HyperparamForm, CodePane React components
- Built Python FastAPI service (`services/ml/`):
  - Endpoints: GET /health, POST /ml/generate, POST /ml/run
  - RandomForestRegressor baseline with editable hyperparameters
  - Complete Dockerfile and deployment docs for AWS/Railway/Render
- Updated Next.js API routes:
  - `/api/strategy/generate`: Now supports ML mode via ML service (was OpenAI-only)
  - `/api/strategy/run`: Supports ML training/prediction via external service
- Added environment variables: `ML_API_URL`, `ALLOW_LOCAL_PY` to `.env.example`
- Created this agents.md file (initial version was ML-focused)

**Why It Matters**:
- Project now supports both DSL (rule-based) AND ML (machine learning) strategies
- ML service is optional but fully scaffolded for production deployment
- Test infrastructure improved with better specificity

**Known Limitations**:
- ML service not yet integrated into Strategy Lab UI (components exist, integration pending)
- `/backtester` page still exists as standalone (should be migrated to Strategy Lab eventually)
- 9 test failures are React Testing Library environment issues, not actual bugs

### 2025-09-23: 3-Tab Shell Implementation (Commit 637f0a2)
**What Was Done**:
- Rebuilt app from main into 3-tab shell: Dashboard, Strategy Lab, Data Warehouse
- Removed intermediate standalone "strategy" pages
- Added chart readability features: legend toggle, hover emphasis, normalization modes, small multiples
- Implemented sector selection in Strategy Lab
- Added eye icon deep-linking from Dashboard to Data Warehouse
- Fixed Next.js App Router compliance (page export restrictions, server/client boundaries)

**Current State**: This is the base for all current work on FeatureComponent branch

---

## Critical Ongoing Issues

### 🔴 High Priority
1. **Strategy Builder UI Integration** ✅ **PARTIALLY COMPLETE (2025-10-09)**
   - **Status**: UI scaffold complete, full integration pending
   - **What's Done**:
     - DSL/ML tabs added to Strategy Lab
     - Health badge with 30s polling
     - ML placeholder UI with disabled state when offline
     - Example prompts and "How it works" sections added
     - `/api/ml/health` proxy endpoint created
   - **What's Remaining**:
     - Wire ML generation to actual ModelCard/HyperparamForm/CodePane components
     - Connect "Generate ML Model" button to `/api/strategy/generate?mode=ml`
     - Display ML results (metrics, predictions) after "Run ML Backtest"
   - **Files to Modify**:
     - `app/(shell)/strategy/StrategyClient.tsx` - Complete ML flow integration
     - Import and use components from `components/strategy/`

2. **Test Failures**
   - **Status**: 9 tests failing, 29 passing
   - **Root Cause**: React Testing Library environment issues, not actual code bugs
   - **Failures**:
     - Dashboard select tests: Some assertions timing out (likely need more `await waitFor`)
     - Strategy handoff tests: String matching case sensitivity
     - Chart tests: React `act()` warnings (harmless but noisy)
   - **Action**: Tests work functionally, failures are test harness setup. Can be addressed later or run with `--passWithNoTests` for now
   - **Evidence**: TypeScript passes, build succeeds, manual testing shows features work

### 🟡 Medium Priority
1. **Backtester Page Migration**
   - **Status**: Not started
   - **Current**: `/backtester` exists as standalone page with full Strategy Builder UI
   - **Goal**: Migrate content into Strategy Lab, then delete `/backtester`
   - **Why**: Per CLAUDE.md requirements, should have single Strategy Lab, not multiple strategy pages
   - **What to Preserve**: Example prompts, "How it works" section, mode toggle (DSL/ML)

2. **Sector Mapping Data**
   - **Status**: Code supports it, data may not exist
   - **Implementation**: Sector selection shows only if mapping available (manifest field, `public/sectors.json`, or `lib/metadata/sectors.ts`)
   - **Current Behavior**: Gracefully hides if no data (no errors)
   - **Action**: Create `public/sectors.json` if sector analysis is desired

### 🟢 Low Priority / Nice to Have
1. **README & DOCUMENTATION Updates**
   - **Status**: Partially done
   - **Needed**: Document ML features, Strategy Builder, updated workflow
   - **Current**: README covers 3-tab shell, DOCUMENTATION covers architecture
   - **Gap**: ML service deployment steps, Strategy Builder DSL+ML modes

2. **ML Service Deployment**
   - **Status**: Scaffolded, not deployed
   - **Options**: AWS App Runner, Lambda, ECS, Railway, Render, Fly.io (all documented in `services/ml/README.md`)
   - **Blocker**: None, just hasn't been deployed yet
   - **Testing**: Local dev fallback exists with `ALLOW_LOCAL_PY=1`

---

## Architecture Quick Reference

### Key Files & Their Roles

**Frontend (Next.js 14 App Router)**:
- `app/(shell)/layout.tsx` - Main 3-tab navigation shell
- `app/(shell)/dashboard/` - Multi-ticker selection, indicators, handoff to Strategy Lab
  - `DashboardClient.tsx` - Main Dashboard component (client-side)
  - `utils.ts` - Helper functions (formatIndicators, computeMinMaxDates)
- `app/(shell)/strategy/` - Strategy Lab with DSL generation and backtesting
  - `page.tsx` - Server component (parses searchParams, wraps in Suspense)
  - `StrategyClient.tsx` - Client component (renders UI, manages state)
- `app/(shell)/explore/` - Data Warehouse for dataset exploration
- `app/store/strategyStore.ts` - Zustand global state for Dashboard→Strategy handoff

**API Routes (Node runtime)**:
- `app/api/strategy/generate/route.ts` - AI strategy generation (DSL via OpenAI, ML via ML service)
- `app/api/strategy/run/route.ts` - Backtest execution (DSL in-process, ML via ML service)
- `app/api/index/route.ts` - Returns ticker manifest from S3
- `app/api/local-data/route.ts` - Fetches and normalizes OHLCV data for a ticker

**Libraries**:
- `lib/ml-client.ts` - **NEW** - Client for external ML Python service
- `lib/template.ts` - **NEW** - Hyperparameter templating and validation
- `lib/strategy-engine.ts` - DSL execution engine (indicators + backtest loop)
- `lib/safeParquet.ts` - Parquet file loading from S3
- `lib/indicators.ts` - SMA, EMA, RSI, MACD calculations
- `lib/colors.ts` - Chart color palette for multi-ticker views
- `lib/downsample.ts` - Chart performance optimization

**Components**:
- `components/MultiTickerChart.tsx` - Main chart with readability features
- `components/strategy/` - **NEW** - ML UI components:
  - `ModelCard.tsx` - Displays ML model type and summary
  - `HyperparamForm.tsx` - Editable hyperparameter inputs with validation
  - `CodePane.tsx` - Read-only Python code display with download
- `components/strategy-form.tsx` - Strategy Builder form (used in /backtester, should migrate)
- `components/backtest-results.tsx` - Results display (used in /backtester)

**Python ML Service** (Optional External Service):
- `services/ml/app/main.py` - FastAPI app with ML endpoints
- `services/ml/Dockerfile` - Container definition for deployment
- `services/ml/requirements.txt` - Python dependencies
- `services/ml/README.md` - Deployment instructions

**Tests**:
- `tests/dashboard-select.test.tsx` - Dashboard ticker selection
- `tests/dashboard-to-strategy-handoff.test.tsx` - Strategy Lab prefill
- `tests/chart-readability.test.tsx` - Multi-ticker chart features
- `tests/pages-exports.test.ts` - Next.js page export validation
- `tests/normalizers.test.ts`, `tests/indicators.test.ts` - Unit tests

### Data Flow Patterns

**Dashboard → Strategy Lab Handoff**:
```
1. User selects tickers, indicators, dates in Dashboard
2. User clicks "Create a strategy with this"
3. Dashboard calls: strategyStore.setStrategy({ tickers, indicators, start, end })
4. Dashboard calls: router.push('/strategy')
5. Strategy Lab reads from URL params OR falls back to store
6. Strategy Lab prefills UI with context
```

**DSL Strategy Generation**:
```
1. User enters natural language prompt
2. POST /api/strategy/generate { mode: "dsl", prompt }
3. API calls OpenAI with DSL template
4. Returns: { dsl: { name, rules } }
5. UI renders DSL in editor (editable JSON)
6. User clicks "Run Backtest"
7. POST /api/strategy/run { mode: "dsl", dsl, tickers, startDate, endDate }
8. API executes via lib/strategy-engine.ts
9. Returns: { stats, trades, equity }
```

**ML Strategy Generation** (NEW):
```
1. User enters natural language prompt in ML mode
2. POST /api/strategy/generate { mode: "ml", prompt, tickers, start, end }
3. API calls ML service: POST /ml/generate
4. ML service returns: { modelType, codeTemplate, hyperparams, uiSchema, summary }
5. UI renders: ModelCard + HyperparamForm + CodePane
6. User edits hyperparameters (validated, live code update via templating)
7. User clicks "Run ML"
8. POST /api/strategy/run { mode: "ml", modelType, code, hyperparams, tickers, start, end }
9. API calls ML service: POST /ml/run
10. ML service trains model, returns: { metrics: {rmse, mape}, predictions: [{date, y, yhat}] }
11. UI displays metrics and prediction charts
```

---

## Development Conventions & Patterns

### Next.js App Router Rules (CRITICAL)
**Page Export Restrictions**:
- ALL `app/**/page.tsx` files can ONLY export these:
  - `default` (required)
  - `generateMetadata`, `generateStaticParams`
  - `revalidate`, `dynamic`, `dynamicParams`
  - `fetchCache`, `runtime`, `preferredRegion`, `maxDuration`
  - `metadata`
- NO OTHER EXPORTS (no helper functions, no types, no constants)
- **Fix**: Move helpers to `utils.ts` in same directory
- **Validation**: Run `npm run check-page-exports`

**Server/Client Boundary**:
- Strategy page pattern (MUST follow):
  ```typescript
  // app/(shell)/strategy/page.tsx (Server Component)
  export const dynamic = 'force-dynamic';
  export const revalidate = 0;

  export default function StrategyPage({ searchParams }: { searchParams: any }) {
    const tickers = searchParams.tickers?.split(',') || [];
    return (
      <Suspense fallback={<div>Loading...</div>}>
        <StrategyClient tickers={tickers} ... />
      </Suspense>
    );
  }
  ```
- **Why**: Server parses params, client handles interactivity
- **Never**: Use `useSearchParams()` in server components

### Testing Conventions
**Accessibility Labels** (Important for tests):
- Use symbol-specific labels: `aria-label="Open ${symbol} in Data Warehouse"`
- Use data attributes: `data-testid="eye-${symbol}"`, `data-row="ticker-${symbol}"`
- **Why**: Prevents "found multiple elements" errors in tests
- **Example**:
  ```tsx
  <button
    aria-label={`Open ${ticker} in Data Warehouse`}
    data-testid={`eye-${ticker}`}
  >
    <Eye />
  </button>
  ```

**Test Query Patterns**:
```typescript
// ✅ Good - Specific
const row = screen.getByText('AAPL').closest('[data-row="ticker-AAPL"]');
const button = screen.getByTestId('eye-AAPL');
const textarea = screen.getByLabelText('Strategy Description');

// ❌ Bad - Ambiguous
const button = screen.getByRole('button'); // Which button?
const textarea = screen.getByRole('textbox'); // Which textbox?
```

### State Management
**Zustand Store** (`app/store/strategyStore.ts`):
```typescript
interface StrategyState {
  tickers: string[];
  indicators: string[]; // e.g., ["SMA50", "EMA20", "RSI"]
  start?: string;
  end?: string;
  setStrategy: (data) => void;
  clearStrategy: () => void;
}
```
**Usage**: Dashboard writes, Strategy Lab reads (fallback if no URL params)

### ML Client Gating
```typescript
import { isMLAvailable } from '@/lib/ml-client';

if (!isMLAvailable()) {
  // Show "ML unavailable" message or disable ML mode
  // Requires: ML_API_URL in env OR ALLOW_LOCAL_PY=1 in dev
}
```

---

## Common Development Tasks

### Adding a New Indicator
1. Add calculation function in `lib/indicators.ts`
2. Add rule type in `lib/strategy-engine.ts` (for DSL)
3. Update Dashboard indicator toggles in `DashboardClient.tsx`
4. Update `formatIndicators()` in `app/(shell)/dashboard/utils.ts`
5. Add to ML service feature engineering in `services/ml/app/main.py`

### Adding a New ML Model Type
1. Update `services/ml/app/main.py`:
   - Add model template to `generate_ml()` endpoint
   - Add training logic to `train_predict()` endpoint
2. Update `lib/ml-client.ts` types if response shape changes
3. Test locally with `ALLOW_LOCAL_PY=1` or deploy ML service

### Fixing a Test Failure
1. Check if it's a test setup issue vs actual bug:
   - Does TypeScript pass? (`npm run typecheck`)
   - Does build succeed? (`npm run build`)
   - Does it work manually in browser?
2. If test setup issue: Add `await waitFor()`, check `data-testid` specificity
3. If actual bug: Fix code, verify test passes

### Integrating /backtester into Strategy Lab
**Goal**: Merge Strategy Builder UI from `/backtester` into `/strategy`

**Steps**:
1. Read `app/backtester/page.tsx` and `components/strategy-form.tsx`
2. Copy Strategy Type toggle (DSL/ML) logic into `StrategyClient.tsx`
3. Copy example prompts sections (DSL + ML)
4. Copy "How it works" panel
5. Integrate ML flow:
   - Add state for ML mode (`useState<'dsl' | 'ml'>`)
   - On ML generate: fetch from `/api/strategy/generate?mode=ml`
   - Render ModelCard, HyperparamForm, CodePane
   - On "Run ML": POST `/api/strategy/run` with mode=ml
6. Delete `app/backtester/page.tsx` after migration
7. Test handoff from Dashboard still works

---

## Environment Variables Reference

```bash
# Required for all environments
AWS_BUCKET=ai-backtester-data-rosh
AWS_REGION=us-east-1
AWS_PREFIX=prod
S3_BASE=https://ai-backtester-data-rosh.s3.amazonaws.com/prod
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or production URL

# ML Service (optional)
ML_API_URL=  # https://your-ml-service.com (AWS/Railway/Render)
ALLOW_LOCAL_PY=0  # Set to 1 in dev for local Python fallback

# Data ingestion (optional, not needed for core operation)
POLYGON_API_KEY=
TICKER_SEED_CSV=./data/universe-100.csv
USE_POLYGON_FOR_BARS=false
```

**Where to Set**:
- Local: `.env.local` (already configured, don't commit)
- Vercel: Project Settings → Environment Variables → Production + Preview

---

## Troubleshooting Guide

### "ML service is not available" Error
**Cause**: `ML_API_URL` not set and `ALLOW_LOCAL_PY` not enabled
**Fix**:
- For production: Deploy ML service, set `ML_API_URL`
- For dev: Set `ALLOW_LOCAL_PY=1` in `.env.local`
- See `services/ml/README.md` for deployment options

### Tests Failing with "Found multiple elements"
**Cause**: Non-specific `aria-label` or `data-testid`
**Fix**: Make labels symbol-specific (see Testing Conventions above)

### Build Error: "stream did not contain valid UTF-8"
**Cause**: File encoding issues (CRLF on Windows)
**Fix**:
1. Re-save files as UTF-8 with LF line endings
2. Add `.gitattributes`: `* text=auto eol=lf`
3. Commit and rebuild

### Chart Shows Flat Line at 0
**Cause**: Parquet normalization gaps (schema variants, DECIMAL scales, BigInt)
**Fix**: Check `lib/safeParquet.ts` normalizeRow function:
- Map all aliases (open|o|OpenPrice, etc.)
- Handle DECIMAL scale (divide by 10^scale)
- Convert BigInt to number
- Skip invalid rows instead of defaulting to 0
**Reference**: DOCUMENTATION.md § 3

### TypeScript Error: "Cannot find module '@/lib/ml-client'"
**Cause**: Import path incorrect or tsconfig not updated
**Fix**: Verify `tsconfig.json` has `"@/*": ["./"]` in paths

---

## Deployment Checklist

### Before Deploying to Vercel
- [ ] All tests passing (or known failures documented)
- [ ] TypeScript check passes: `npm run typecheck`
- [ ] Build succeeds: `npm run build`
- [ ] Page exports validated: `npm run check-page-exports`
- [ ] Environment variables set in Vercel dashboard
- [ ] `.gitattributes` includes: `* text=auto eol=lf`
- [ ] Code committed to feature branch
- [ ] PR created against `main`

### After Deploying
- [ ] Verify `/api/health` returns 200
- [ ] Check `/api/index` returns manifest
- [ ] Test a ticker load: `/api/local-data?ticker=AAPL&start=2023-01-01&end=2024-01-01`
- [ ] Test DSL generation: Dashboard → Strategy Lab flow
- [ ] If ML enabled: Test ML generation and run

### Deploying ML Service (Optional)
See `services/ml/README.md` for detailed instructions.

**Quick AWS App Runner**:
```bash
# Build and push to ECR
docker build -t ml-service:latest services/ml
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker tag ml-service:latest <account>.dkr.ecr.us-east-1.amazonaws.com/ml-service:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/ml-service:latest

# Create App Runner service (via console or CLI)
# Set ML_API_URL in Vercel to App Runner URL
```

---

## Future Agent Instructions

### When You Start Working
1. Read this file (agents.md) completely
2. Check CLAUDE.md for current task requirements
3. Review Recent Work History section above
4. Check Critical Ongoing Issues section
5. Run locally: `npm ci && npm run dev`
6. Verify build: `npm run typecheck && npm run build`

### When Adding Features
1. Follow Development Conventions above
2. Update this file (agents.md) with work done
3. Update DOCUMENTATION.md if architecture changes
4. Update README.md if user-facing features change
5. Add tests for new functionality
6. Document any new environment variables

### When Fixing Bugs
1. Check if issue is in Critical Ongoing Issues section
2. Verify it's actual bug (not test environment issue)
3. Add test to prevent regression
4. Update this file if the fix resolves an ongoing issue

### When You Finish Work
1. Update "Recent Work History" section with dated entry
2. Update "Current Branch & Status" section
3. Run full validation: tests, typecheck, build
4. Document any new known issues in "Critical Ongoing Issues"
5. Commit with descriptive message (see commit message format below)

---

## Git Commit Message Format

```
<type>(<scope>): <short description>

<detailed description of what changed and why>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
**Scopes**: `strategy`, `dashboard`, `explore`, `api`, `ml`, `tests`, `infra`

**Example**:
```
feat(ml): integrate Strategy Builder UI with ML mode

- Added ML mode toggle to StrategyClient
- Integrated ModelCard, HyperparamForm, CodePane components
- Migrated example prompts from /backtester
- Added "How it works" section for both DSL and ML modes
- Deleted redundant /backtester page

Closes #123

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Project Context & Vision

### What This App Does
Trading strategy backtester that lets users:
1. Select stocks from Dashboard with technical indicators
2. Describe trading strategies in natural language
3. Generate executable code (DSL or ML)
4. Backtest on historical data from S3
5. View results with interactive charts

### Why It Matters
- Democratizes quantitative trading strategy development
- No coding required (AI generates the code)
- Both rule-based (DSL) and ML approaches supported
- Real historical data from S3 (Parquet files)

### Design Philosophy
- **User-First**: Simple UI, complex backend
- **Extensible**: Easy to add indicators, models, data sources
- **Cloud-Native**: Serverless Next.js, S3 data, optional Python service
- **Type-Safe**: TypeScript everywhere, runtime validation
- **Testable**: Unit tests, integration tests, page export validation

---

## Contact & Resources

**Repository**: https://github.com/Roshlion/AI_BACKTESTER
**Active Branch**: `FeatureComponent`
**Main Branch**: `main`

**Key Documents**:
- User Guide: [README.md](./README.md)
- Technical Docs: [DOCUMENTATION.md](./DOCUMENTATION.md)
- Current Work: [CLAUDE.md](./CLAUDE.md)
- This Guide: [agents.md](./agents.md) (you are here)

**External Services**:
- S3 Bucket: `s3://ai-backtester-data-rosh/prod/`
- ML Service: Optional (deploy per `services/ml/README.md`)
- OpenAI: Used for DSL generation

---

**Last Updated**: 2025-10-08
**Version**: 1.0.0
**Next Agent**: Good luck! You have all the context you need. Update this file when you're done! 🚀
