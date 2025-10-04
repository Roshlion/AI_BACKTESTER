TITLE: Rebuild AI_BACKTESTER from main into a three-tab shell (Dashboard / Strategy Lab / Data Warehouse), fix selection & navigation, add sector selection (Strategy Lab only), de-clutter multi-ticker charts, replace “only” with eye link, and clean code/docs/tests

SOURCE OF TRUTH:

Start from the current main branch. Create a new feature branch and apply ALL instructions below.

Remove any changes that created intermediate/standalone “strategy” pages outside the main shell.

Keep the visual style as it is today (dark theme, typography, paddings), but integrate the chart readability improvements.

GOALS (must all be met):

Single application shell with three tabs at the top: “Dashboard” (default), “Strategy Lab”, “Data Warehouse”.

Dashboard keeps full-row multi-select, but the right-side “only” text is replaced with a subtle eye icon that links to the symbol’s page in the Data Warehouse tab (deep link).

“Create a strategy with this” switches to Strategy Lab in-place (same shell), prefilled with tickers/indicators/dates. No intermediate standalone page.

Charts remain readable with many tickers (see “Chart readability & performance”).

Sector selection is implemented in Strategy Lab only (multi-select sectors → expands to tickers). If sector metadata is unavailable, hide the control automatically.

Fix any Next.js App Router issues: server/client boundaries, allowed page exports, Suspense usage, dynamic rendering flags.

Remove “Quick Links” on Dashboard; the three top tabs are the only nav.

Clean codebase (remove obsolete exports/components), update README and DOCUMENTATION, add regression tests.

APP SHELL & ROUTING (Next.js App Router)

Create a shared tabbed layout under app/(shell)/layout.tsx. It renders a top nav with three tabs:

/dashboard (label: Dashboard)

/strategy (label: Strategy Lab)

/explore (label: Data Warehouse)
The active tab is visually highlighted. Keep styling consistent with current theme.

Move pages under this layout:

Dashboard: app/(shell)/dashboard/page.tsx

Strategy: app/(shell)/strategy/page.tsx (server component that passes props to a client child)

Explore: app/(shell)/explore/page.tsx

Allowed page exports only. For every app/**/page.tsx, allow only: default, generateMetadata, generateStaticParams, revalidate, dynamic, dynamicParams, fetchCache, runtime, preferredRegion, maxDuration, metadata. No other named exports from page files. Move helpers to sibling utils.ts.

Strategy page boundary pattern (must use this):

app/(shell)/strategy/page.tsx is a Server Component:

export const dynamic = 'force-dynamic'

export const revalidate = 0

Receives searchParams and passes parsed values to a client component StrategyClient wrapped in <Suspense>.

StrategyClient.tsx is a Client Component that renders the Strategy Lab UI.

If URL search params are missing, StrategyClient initializes from a global store (see “Global state” below).

GLOBAL STATE (handoff without page reloads)

Use Zustand (or React Context if preferred). Create app/store/strategyStore.ts:

shape:

tickers: string[]

indicators: string[] // e.g., ["SMA50","EMA20","RSI","MACD"]

start?: string // YYYY-MM-DD

end?: string // YYYY-MM-DD

setStrategy(data)

clearStrategy()

Dashboard:

On “Create a strategy with this”, call setStrategy({ tickers, indicators, start, end }), then router.push('/strategy').

Do not navigate to any other route.

Strategy Lab:

On mount, read from URL (if present) else from store.

Prefill ticker multi-select, indicator toggles/periods, and optional date range.

Prefill prompt with a friendly hint from indicators (e.g., “Strategy idea: Use SMA(50) and RSI…”). Singularize if one indicator.

Explore/Data Warehouse:

If ?symbol=XYZ is present, focus the symbol’s page.

DASHBOARD (selection, eye link, search, dates, indicators)

Ticker list:

Keep full-row multi-select highlight. No visible checkboxes.

Each row shows the ticker symbol (left). On the far right, replace the “only” text with a small eye icon button (e.g., 👁). On hover: tooltip “Open in Data Warehouse”. Clicking the eye navigates to /explore?symbol=<TICKER>. This must NOT toggle selection.

Keep an isolate action, but move it to row context menu (three-dot menu) or a subtle icon separate from the eye (e.g., ⬤). Tooltip: “Isolate this ticker”. Clicking isolate sets selectedTickers=[symbol].

Search:

Text input filters the list as the user types (case-insensitive, starts-with or contains). If no matches, show “No tickers found”.

Do NOT expand to a giant dropdown that reveals all 100+ tickers; the list stays scrollable with a fixed max height (e.g., 22rem).

Indicators:

Toggles: SMA, EMA, RSI, MACD. Double-click SMA/EMA toggles to open a small inline numeric input for period (defaults: SMA 50, EMA 20). RSI 14 and MACD 12/26/9 are constants (not user-editable for now).

Persist chosen periods in Dashboard state so the handoff includes SMA50/EMA20 format in indicators.

Dates:

When the first ticker is selected, auto compute start/end from the union of available data (min date across selected, max date across selected). Fill Start/End inputs with YYYY-MM-DD.

If the user edits dates, honor them; provide a “Reset range” button to revert to full span.

“Create a strategy with this”:

Button on the Dashboard panel. On click:

Build the indicators list like ["SMA50","EMA20","RSI","MACD"] based on toggles and periods.

Call strategyStore.setStrategy({ tickers, indicators, start, end }).

router.push('/strategy'). No other pages. No standalone DSL route.

STRATEGY LAB (prefill, sectors, workflow)

Prefill logic:

Strategy page server component parses searchParams (tickers, indicators, start, end) and passes them to StrategyClient. If params are absent, StrategyClient pulls from strategyStore. If both absent, show empty/default.

StrategyClient:

Prefill tickers multi-select (list from manifest).

Prefill prompt using indicators (convert “SMA50” to “SMA(50)” for readability).

Optional: prefill date inputs if provided.

Sector selection (Strategy Lab only):

Add a collapsible “Filter by sector” panel above the tickers list:

Multi-select control listing sectors (Technology, Healthcare, Financials, etc.).

When sectors are selected, the tickers list auto-selects all symbols belonging to those sectors (in addition to any manual selections). Deselecting a sector removes its symbols from selection (unless user explicitly re-added them).

Data source for sector mapping (choose the first that exists; fall back gracefully):
a) If manifest already includes sector on each ticker, use it directly.
b) Else, add public/sectors.json with shape { "AAPL": "Technology", "ABBV": "Healthcare", ... }.
c) Else, check lib/metadata/sectors.ts (optional static map).

If no sector mapping is found at runtime, hide the sector UI completely.

Workflow in Strategy Lab:

Sections:

Selected tickers (chips, removable).

Sector filter (if available).

Backtest window (start/end inputs).

Strategy prompt textarea (pre-filled hint if indicators set).

Generate DSL button (calls existing API).

DSL editor (shows generated JSON; allow user edits).

Run backtest button (existing API).

Results (existing charts/tables).

Strategy Lab must continue to work when opened directly without prior Dashboard interaction.

DATA WAREHOUSE (Explore)

/explore displays symbol-level pages.

If ?symbol=XYZ, show the symbol’s summary: recent price chart (single ticker), basic stats, link back to Dashboard pre-selecting that symbol (optional).

If no symbol provided, show an index of available datasets with a search.

CHART READABILITY & PERFORMANCE (multi-ticker)

Implement ALL of the following (they are complementary):

A) Series management

Allow toggling visibility per ticker via legend click (hide/show series).

On hover over legend item, temporarily emphasize that series (increase stroke width to 3 and reduce others’ opacity to ~0.3).

Limit line strokeWidth to 2 for prices, 1 for indicators. Use dashed/dotted for indicators.

Use a distinct color palette with sufficient contrast; recycle colors predictably if >10 tickers.

B) Normalization options

Add a “Scale” control with three modes:

Price (absolute) — default.

Indexed % (normalize all series to 100 at start date, plot as % change).

Small multiples (render each ticker in its own mini-panel with shared X axis; limit to first N=6 by default; show a notice if more are selected and provide a “Show all” toggle).

Persist chosen scale in Dashboard handoff; Strategy Lab doesn’t need this value, but keep internally if you reuse its chart.

C) Indicator panels

Keep RSI and MACD in separate sub-panels below the main price chart (prevents mixed scales). Draw RSI reference lines at 30/70; draw MACD zero line.

D) Downsampling and windowing

For performance, downsample points when > 5k total points on the canvas (e.g., largest triangle three buckets or simple thinning). Only for rendering; keep raw data for tooltips if feasible.

When date range narrows, re-use full-resolution data.

E) Error boundaries

Guard against empty series: if a selected symbol has no data in the chosen date window, show a non-blocking inline message and skip plotting it.

UI/UX CONSISTENCY & ACCESSIBILITY

Keep current font sizes, paddings, and card styles.

On mobile (< md), stack columns; ensure the top tabs remain visible. No overlapping floating widgets; if any floating tool exists, lower z-index on mobile or hide it.

Provide keyboard support for ticker list (Enter/Space toggle), isolate icon (Enter activates), eye icon (Enter opens Data Warehouse).

Add aria-label for the eye icon (“Open in Data Warehouse”), isolate icon (“Isolate this ticker”), and strategy button (“Create a strategy with selected tickers”).

FILE ORGANIZATION & CLEANUP

New/Updated:
app/(shell)/layout.tsx
app/(shell)/dashboard/page.tsx
app/(shell)/dashboard/DashboardClient.tsx
app/(shell)/dashboard/utils.ts // helpers like formatIndicators, computeMinMaxDates
app/(shell)/strategy/page.tsx // server
app/(shell)/strategy/StrategyClient.tsx
app/(shell)/explore/page.tsx
app/store/strategyStore.ts
public/sectors.json // only if needed
lib/indicators.ts // SMA/EMA/RSI/MACD computations
lib/colors.ts // color palette + recycling
lib/downsample.ts // optional downsampling util
components/Chart/* // shared chart components (main + RSI + MACD + small multiples)

Delete or refactor:

Any standalone “strategy” pages created outside (shell) or that bypass the tabs.

Any page.tsx named exports not in the allowed list (move to utils.ts).

“Quick Links” card from Dashboard; navigation is via the top tabs.

Duplicated CSS/JS from earlier iterations.

TYPING & SERVER/CLIENT BOUNDARY

All page.tsx files: only allowed exports; no helper exports.

Strategy page: dynamic='force-dynamic', revalidate=0, server parses searchParams, passes props to client within <Suspense>.

If any component uses useSearchParams, it must be a client component and rendered under a Suspense boundary; prefer passing values from the server page instead.

INDICATOR CALCULATIONS (client-side)

SMA(N): simple moving average over close.

EMA(N): alpha = 2/(N+1), seed with first value or SMA of first N.

RSI(14): Wilder’s smoothing; bounds [0,100]; render reference lines at 30/70.

MACD: fast=12 EMA, slow=26 EMA, macd=fast−slow; signal=EMA9(macd). Plot macd and signal lines; skip histogram to reduce clutter with many tickers.

SECTOR MAPPING (Strategy Lab only)

Lookup order:

If manifest items have sector field: use it.

Else, if public/sectors.json exists, load it and map symbols to sectors.

Else, hide sector UI completely (no console errors).

Sector multi-select behavior:

Selecting sectors adds their tickers to the selected list (union).

Deselecting a sector removes those tickers unless the user manually toggled them back on.

Show a compact count (e.g., “Tech (12)”).

Handoff:

When the user runs backtests, the final “selected tickers” list is what drives the request; sectors are just a convenience for selection.

TESTS (Vitest + React Testing Library; add minimal but effective coverage)

pages-exports.test.ts

Scan app/**/page.tsx for export const|function|class and fail if any export is not in the allowed Next.js list.

dashboard-select.test.tsx

Renders ticker list; typing in search filters the list; “No tickers found” appears when appropriate.

Clicking a row toggles highlight; clicking isolate sets exactly one ticker selected.

Eye icon opens /explore?symbol=XYZ (mock router or check href on a Link component).

dashboard-to-strategy-handoff.test.tsx

With selectedTickers + indicators + dates, clicking “Create a strategy with this” updates strategyStore and calls router.push('/strategy').

StrategyClient reads from store when searchParams absent and renders prefilled chips and prompt.

chart-readability.test.tsx

Given many tickers, legend click hides/shows a series (DOM or state assertions).

Hovering a legend item reduces opacity of non-focused series (class/style check).

Switching Scale from Price to Indexed % recomputes y-values (smoke check on transformed data).

Small multiples mode renders a grid of mini-charts and shows a “Show all” toggle when more than 6 tickers are selected.

DOCS UPDATES

README.md (add/adjust):

New three-tab navigation: Dashboard (default), Strategy Lab, Data Warehouse.

Dashboard: multi-ticker selection, eye icon to Data Warehouse, isolate action, indicator toggles with editable SMA/EMA periods, auto date range, “Create a strategy with this” switches to Strategy Lab and pre-fills context.

Strategy Lab: accepts prefill from URL or store; sector selection (if data available); prompt → generate DSL → run backtest.

Data Warehouse: symbol pages; deep link from eye icon.

Developer notes: App Router page exports restrictions; Strategy page server→client pattern; global store handoff.

DOCUMENTATION.md:

Frontend Pages section describing each tab and interactions.

Implementation notes: sector mapping fallback logic; chart readability controls (legend toggle, hover emphasis, normalization, small multiples); downsampling threshold; mobile responsiveness choices.

Conventions: no helper exports from page files; use utils.ts; Suspense boundary for client hooks.

ACCEPTANCE CRITERIA (must all pass)

Top navigation shows three tabs; Dashboard is default; navigating between tabs does not leave the shell.

Ticker list: full-row highlight; search filters; isolate action works; eye icon opens /explore?symbol=....

“Create a strategy with this” switches to Strategy Lab in place, with tickers/indicators/dates prefilled (from store or URL).

Strategy Lab works standalone (no prefill) and with prefill (store or URL).

Sector multi-select appears only if mapping is available; selecting sectors updates ticker selection.

Charts remain readable with many series: legend toggling, hover emphasis, normalization options, RSI/MACD in subpanels, optional small multiples.

No invalid named exports from page files; build passes; typecheck passes; tests pass.

Quick Links card removed from Dashboard; navigation only via tabs.

Documentation updated as described.

CODING NOTES

Preserve current aesthetics and theme; integrate new controls subtly (no jarring style changes).

Use Tailwind utility classes already present for consistency.

Keep all new strings short and clear. Tooltips where needed.

Make no network calls for sector mapping unless the file exists; treat missing mapping as a feature toggle.

Prefer passing values from server page to client via props over reading useSearchParams in clients; if you must read URL client-side, ensure it is under a <Suspense> boundary.

END OF PROMPT