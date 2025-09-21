# Claude Instructions

## Project Overview
AI Backtester - A trading strategy backtesting application built with Next.js

## Commands
- Build: `npm run build`
- Dev: `npm run dev`
- Lint: `npm run lint`
- Test: `npm test`

## Code Style
- TypeScript preferred
- Follow existing patterns in the codebase
- Use meaningful variable names
- Keep functions focused and small

## Project Structure
- `/app` - Next.js app router pages and API routes
- `/lib` - Shared utilities and business logic
- `/types` - TypeScript type definitions
- `/scripts` - Build and utility scripts

## Dependencies
- Next.js
- React
- TypeScript
- Parquet data processing

## Notes
- Uses parquet files for historical data storage
- Local data integration for backtesting
- Strategy engine for trading logic

## Testing
- Run tests before committing changes
- Ensure all type checks pass

## Additional Instructions
Prompt to Claude — “Ship AI_BACKTESTER on Vercel from main”

You are my deployment/dev copilot. Act as a senior full-stack engineer. Make precise changes and give exact commands (Windows PowerShell). Keep steps incremental (1–2 commands at a time), then wait for my output.

Context (project facts)

Name: AI_BACKTESTER

Local path: C:\Users\Roshl\AIBACKTESTER\AI_BACKTESTER

Stack: Next.js 14 (App Router), TypeScript, Tailwind, Node 24 (locally), parquetjs-lite

Data model: Parquet is source of truth; Polygon API for incremental refresh later.

Key pages: /dashboard, /backtester, /strategy, /data

APIs: /api/local-data, /api/local-batch, /api/strategy/{ping,run,test}

Working demo file: public/AAPL.parquet

Current goal: Consolidate to main, deploy with Vercel from GitHub (auto-deploy), keep secrets server-side, initially serve demo parquet from /public, then switch to Vercel Blob (PARQUET_URL).

Guardrails

Never commit secrets. Use Vercel Project → Settings → Environment Variables only.

Ensure server-side OpenAI usage only (no client exposure).

Enforce Node runtime on API routes that use parquetjs-lite.

Keep responses minimal and sequential (1–2 commands/edits per step).

Task 1 — Merge feature branch → main and push

Goal: Make main the single source of truth with the latest feature work.

Ask me to run:

git status
git add -A
git commit -m "chore: finalize demo before merge"  # only if needed
git checkout main
git pull
git merge feature/dashboard-strategy-lab


If conflicts arise, instruct:

Open in VS Code, resolve, then:

git add -A
git commit


Verify presence of demo + API patch:

git ls-files public/AAPL.parquet
git grep -n "PARQUET_URL" app/api/local-data/route.ts


Push:

git push origin main


Stop and wait for my confirmation.

Task 2 — Minimal API hardening for parquet on Vercel

Goal: Use PARQUET_URL if provided, else fetch /AAPL.parquet from /public (no fs).

Ask me to open app/api/local-data/route.ts and replace handler with:

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ParquetReader } from "parquetjs-lite";

async function openParquet(req: Request) {
  const blobUrl = process.env.PARQUET_URL;
  if (blobUrl && /^https?:\/\//i.test(blobUrl)) {
    const res = await fetch(blobUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch PARQUET_URL: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return await ParquetReader.openBuffer(buf);
  }
  const host = new URL(req.url).host;
  const scheme = "https";
  const res = await fetch(`${scheme}://${host}/AAPL.parquet`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch /AAPL.parquet: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return await ParquetReader.openBuffer(buf);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") ?? "";
    const ticker = searchParams.get("ticker") ?? "AAPL";

    const reader = await openParquet(req);
    const cursor = await reader.getCursor();
    const rows: any[] = [];
    for (let rec = await cursor.next(); rec; rec = await cursor.next()) {
      if (!ticker || rec.ticker === ticker) rows.push(rec);
    }
    await reader.close();

    if (mode === "metadata") {
      const firstDate = rows[0]?.date ?? null;
      const lastDate = rows.at(-1)?.date ?? null;
      return NextResponse.json({
        ok: true,
        ticker,
        records: rows.length,
        firstDate,
        lastDate,
        source: process.env.PARQUET_URL ? "blob" : "public",
      });
    }

    return NextResponse.json({ ok: true, ticker, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}


Then ask me to commit:

git add -A
git commit -m "feat(api): blob-url parquet support + public fallback"
git push


Stop and wait.