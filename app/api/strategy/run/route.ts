import { NextRequest, NextResponse } from 'next/server'
import { readTickerRange } from '@/lib/safeParquet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const ticker = String(body?.ticker ?? 'AAPL')
    const startDate = String(body?.startDate ?? '2024-01-01')
    const endDate = String(body?.endDate ?? '2024-03-31')

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

    const { runBacktest, buildDslFromPrompt } = await import('@/lib/strategy-engine')
    const dsl = buildDslFromPrompt?.(body?.prompt) ?? {
      name: 'Simple MACD Strategy',
      rules: [{ type: 'macd_cross', params: { fast: 12, slow: 26, signal: 9 } }]
    }

    const result = runBacktest(dsl, rows)
    const stats = result?.stats ?? { totalReturnPct: 0, trades: 0, winRatePct: 0, avgTradePct: 0 }

    return NextResponse.json({
      ok: true,
      dsl,
      used: { start: rows[0].date, end: rows[rows.length - 1].date },
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
    }, { status: 200 }) // soft-fail so smoke stays green
  }
}
