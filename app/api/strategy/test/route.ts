import { NextRequest, NextResponse } from 'next/server'
import { readTickerRange } from '@/lib/safeParquet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Reuse your engine + row type
import { runBacktest } from '@/lib/strategy-engine'
import type { MarketRow } from '@/types/row'

// Fixed DSL smoke: MACD cross enter, RSI>70 exit
const FIXED_DSL = {
  indicators: {
    macd: { fast: 12, slow: 26, signal: 9 },
    rsi: { period: 14 },
  },
  entry: [
    { indicator: 'macd', op: 'crossesAbove', a: 'macd', b: 'signal' }
  ],
  exit: [
    { indicator: 'rsi', op: '>', value: 70 }
  ],
  mode: 'long-only'
} as const

function toIsoDate(x: unknown): string {
  if (typeof x === 'string') return x
  const n = typeof x === 'bigint' ? Number(x) : Number(x)
  return new Date(n).toISOString().slice(0, 10)
}
function toNum(x: unknown): number {
  return typeof x === 'bigint' ? Number(x) : Number(x)
}

async function readLocalBars(req: NextRequest, ticker: string, startDate: string, endDate: string): Promise<{ rows: MarketRow[], used:{start:string; end:string}, coverage:{start:string|null; end:string|null} }> {
  try {
    const allRows = await readTickerRange(req, ticker, '1900-01-01', '2099-12-31');

    if (allRows.length === 0) {
      return { rows: [], used: { start: startDate, end: endDate }, coverage: { start: null, end: null } };
    }

    // Sort by timestamp
    const sortedRows = allRows.sort((a, b) => a.timestamp - b.timestamp);

    const covStart = sortedRows[0]?.date ?? null;
    const covEnd = sortedRows.at(-1)?.date ?? null;

    const reqStart = startDate || covStart || '';
    const reqEnd = endDate || covEnd || '';
    const usedStart = covStart ? (reqStart < covStart ? covStart : reqStart) : reqStart;
    const usedEnd = covEnd ? (reqEnd > covEnd ? covEnd : reqEnd) : reqEnd;

    const rows = (usedStart && usedEnd) ? sortedRows.filter(r => r.date >= usedStart && r.date <= usedEnd) : [];

    return { rows, used: { start: usedStart, end: usedEnd }, coverage: { start: covStart, end: covEnd } };
  } catch (e) {
    return { rows: [], used: { start: startDate, end: endDate }, coverage: { start: null, end: null } };
  }
}

export async function GET(req: NextRequest) {
  try {
    const ticker = 'AAPL'
    const startDate = '2024-01-01'
    const endDate = '2024-03-31'

    // Use readTickerRange directly
    const rows = await readTickerRange(req, ticker, startDate, endDate);

    // If empty, return { ok:true, result:null, note:"No data" }
    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        result: null,
        note: "No data",
        stats: { totalReturnPct: 0, trades: 0, winRatePct: 0, avgTradePct: 0 },
        trades: [],
        equity: []
      })
    }

    // Ensure runBacktest(dsl, rows) gets DSL first
    const result = runBacktest(FIXED_DSL as any, rows)

    // Ensure stats object is always present
    const safeStats = result?.stats ?? { totalReturnPct: 0, trades: 0, winRatePct: 0, avgTradePct: 0 }

    return NextResponse.json({
      ok: true,
      result,
      used: {
        start: rows[0]?.date ?? startDate,
        end: rows.at(-1)?.date ?? endDate
      },
      coverage: {
        start: rows[0]?.date ?? null,
        end: rows.at(-1)?.date ?? null
      },
      stats: safeStats,
      trades: result?.trades ?? [],
      equity: result?.equity ?? []
    })
  } catch (e:any) {
    console.error('Error in /api/strategy/test:', e);
    // Keep GET stable: return ok:false but still provide stats placeholder so smoke can optionally check shape
    return NextResponse.json({
      ok: false,
      error: String(e),
      stats: { totalReturnPct: 0, trades: 0, winRatePct: 0, avgTradePct: 0 },
      trades: [],
      equity: []
    })
  }
}
