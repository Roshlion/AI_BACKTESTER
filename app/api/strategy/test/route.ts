import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

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

async function readLocalBars(ticker: string, startDate: string, endDate: string): Promise<{ rows: MarketRow[], used:{start:string; end:string}, coverage:{start:string|null; end:string|null} }> {
  const filePath = path.join(process.cwd(), 'data', 'parquet-final', `${ticker}.parquet`)
  const exists = await fs.stat(filePath).then(()=>true).catch(()=>false)
  if (!exists) return { rows: [], used: { start: startDate, end: endDate }, coverage: { start: null, end: null } }

  const buf = await fs.readFile(filePath)
  const { ParquetReader } = await import('parquetjs-lite')
  const reader = await ParquetReader.openBuffer(buf)
  const cursor = reader.getCursor()
  const raw:any[] = []
  for (let r = await cursor.next(); r; r = await cursor.next()) raw.push(r)
  await reader.close()

  const all: MarketRow[] = raw.map((r:any) => ({
    ticker,
    date: toIsoDate(r.date ?? r.timestamp),
    timestamp: toNum(r.timestamp ?? r.date),
    open: toNum(r.open),
    high: toNum(r.high),
    low: toNum(r.low),
    close: toNum(r.close),
    volume: toNum(r.volume),
    vwap: r.vwap != null ? Number(r.vwap) : undefined,
    transactions: r.transactions != null ? Number(r.transactions) : undefined,
  })).sort((a,b)=>a.timestamp-b.timestamp)

  const covStart = all[0]?.date ?? null
  const covEnd   = all.at(-1)?.date ?? null

  const reqStart = startDate || covStart || ''
  const reqEnd   = endDate   || covEnd   || ''
  const usedStart = covStart ? (reqStart < covStart ? covStart : reqStart) : reqStart
  const usedEnd   = covEnd   ? (reqEnd   > covEnd   ? covEnd   : reqEnd)   : reqEnd

  const rows = (usedStart && usedEnd) ? all.filter(r => r.date >= usedStart && r.date <= usedEnd) : []

  return { rows, used: { start: usedStart, end: usedEnd }, coverage: { start: covStart, end: covEnd } }
}

export async function GET() {
  try {
    const ticker = 'AAPL'
    const startDate = '2024-01-02'
    const endDate = '2024-03-28'

    const { rows, used, coverage } = await readLocalBars(ticker, startDate, endDate)

    // If no rows, still return stable stats object
    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        used,
        coverage,
        stats: { totalReturnPct: 0, trades: 0, winRatePct: 0, avgTradePct: 0 },
        trades: [],
        equity: []
      })
    }

    const result = runBacktest(FIXED_DSL as any, rows)

    // Ensure stats object is always present
    const safeStats = result?.stats ?? { totalReturnPct: 0, trades: 0, winRatePct: 0, avgTradePct: 0 }

    return NextResponse.json({
      ok: true,
      used,
      coverage,
      stats: safeStats,       // <- always provided
      trades: result?.trades ?? [],
      equity: result?.equity ?? []
    })
  } catch (e:any) {
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
