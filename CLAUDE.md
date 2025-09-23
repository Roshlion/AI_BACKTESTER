# Claude Instructions

## Project Overview
AI Backtester - S3-first, AI-powered trading strategy backtesting application built with Next.js 14. Web-based interface for generating and running trading strategies on historical market data stored as Parquet files in AWS S3.

## Key Features
- S3-first data access: reads Parquet/CSV over HTTPS from S3 (no local filesystem)
- Manifest-driven: `index.json` in S3 lists tickers & metadata for Dashboard/Data Explorer
- AI backtester: converts natural language prompts to DSL strategies using OpenAI
- Charts & UI: Recharts + Tailwind for price and equity curve visualization
- Strategy engine: SMA/EMA/RSI/MACD indicators with crossover and threshold rules

## Commands
- Build: `npm run build`
- Dev: `npm run dev`
- Lint: `npm run lint`
- Test: `npm test`
- Type check: `npm run typecheck`
- Build manifest: `npm run build:manifest`

## Architecture
- Frontend: Next.js 14 (App Router, RSC), TailwindCSS, Recharts
- APIs: Node runtime with endpoints for health, index, data loading, strategy generation/execution
- Data: AWS S3 with Parquet files and manifest-based catalog
- AI: OpenAI integration for natural language to DSL conversion

## API Endpoints
- `GET /api/health` - Health check for S3 manifest accessibility
- `GET /api/index` - Returns S3 manifest with tickers and metadata
- `GET /api/local-data` - Loads and normalizes OHLCV data for specified ticker/date range
- `POST /api/strategy/generate` - Converts natural language prompt to DSL strategy
- `POST /api/strategy/run` - Executes DSL or ML strategies with backtesting

## Project Structure
- `/app` - Next.js app router pages and API routes
  - `/dashboard` - Dashboard UI with ticker list and charts
  - `/strategy` - AI backtester interface (prompt → DSL → run)
  - `/api` - Next.js API routes (Node runtime)
- `/lib` - Shared utilities and business logic
  - `env.ts` - Environment variable validation
  - `safeParquet.ts`, `ingest-bars.ts` - Parquet/CSV loaders with normalization
  - `strategy-engine.ts` - DSL execution and technical indicators
- `/types` - TypeScript type definitions
- `/scripts` - Build and utility scripts
  - `build-manifest.ts` - Generates S3 manifest

## Environment Variables (Required)
- `AWS_BUCKET` - S3 bucket name
- `AWS_REGION` - AWS region
- `AWS_PREFIX` - S3 prefix path
- `S3_BASE` - HTTPS base URL for S3 access
- `OPENAI_API_KEY` - OpenAI API key for strategy generation
- `OPENAI_MODEL` - OpenAI model (e.g., gpt-4o-mini)
- `NEXT_PUBLIC_APP_URL` - Application URL

## Data Model
- Source: Parquet files in S3 with flexible schema support
- Normalized format: `{date, open, high, low, close, volume}` as JS numbers
- Schema flexibility: supports various field aliases and DECIMAL/BigInt handling
- Manifest: `index.json` with `{asOf, source, tickers}` structure

## Code Style & Standards
- TypeScript preferred with strict type checking
- Follow existing patterns in the codebase
- Use meaningful variable names
- Keep functions focused and small
- Handle schema variations robustly (aliases, DECIMAL scales, BigInt conversions)
- Skip invalid rows rather than defaulting to 0 to avoid flat-line charts

## Testing & Quality
- Run `npm run typecheck` and `npm run test` before committing
- Unit tests with Vitest for normalizers and engine helpers
- Ensure all type checks pass
- Test with representative schema variations

## Known Issues & Troubleshooting
- Flat-line charts at 0: caused by normalization gaps in schema handling
- Vercel UTF-8 build errors: save files as UTF-8 LF, add `.gitattributes`
- Missing env variables: sync between `.env.local` and Vercel settings

## Deployment
- Vercel deployment with environment variables configured
- S3 bucket with public read access for data files
- Manifest regeneration via `npm run build:manifest` when adding datasets
