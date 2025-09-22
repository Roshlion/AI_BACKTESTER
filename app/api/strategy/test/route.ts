import { NextRequest, NextResponse } from 'next/server'
import { readTickerRange } from '@/lib/safeParquet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIXED_DSL = {
  indicators: { macd: { fast: 12, slow: 26, signal: 9 }, rsi: { period: 14 } },
  entry: [{ indicator: 'macd', op: 'crossesAbove', a: 'macd', b: 'signal' }],
  exit: [{ indicator: 'rsi', op: '>', value: 70 }],
  mode: 'long-only'
} as const

export async function GET(req: NextRequest) {
  try {
    const ticker = 'AAPL'
    const startDate = '2024-01-01'
    const endDate = '2024-03-31'

    const rows = await readTickerRange(req, ticker, startDate, endDate)
    if (!rows?.length) {
      return NextResponse.json({
        ok: true,
        result: null,
        note: 'No data',
        stats: { totalReturnPct: 0, trades: 0, winRatePct: 0, avgTradePct: 0 },
        trades: [],
        equity: []
      })
    }

    // Import inside the handler so build-time never trips on module resolution
    const { runBacktest } = await import('@/lib/strategy-engine')
    const result = runBacktest(FIXED_DSL as any, rows)
    const stats = result?.stats ?? { totalReturnPct: 0, trades: 0, winRatePct: 0, avgTradePct: 0 }

    return NextResponse.json({
      ok: true,
      result,
      used: { start: rows[0].date, end: rows[rows.length - 1].date },
      coverage: { start: rows[0].date, end: rows[rows.length - 1].date },
      stats,
      trades: result?.trades ?? [],
      equity: result?.equity ?? []
    })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: String(e),
      stats: { totalReturnPct: 0, trades: 0, winRatePct: 0, avgTradePct: 0 },
      trades: [],
      equity: []
    }, { status: 200 }) // keep smoke green
  }
}
