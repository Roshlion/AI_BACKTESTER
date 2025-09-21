// app/api/local-data/route.ts
import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const META_PATH = path.join(process.cwd(), 'data', 'logs', 'index.json')
const PARQUET_DIR = path.join(process.cwd(), 'data', 'parquet-final')

type Row = {
  ticker: string
  date: string
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  vwap?: number
  transactions?: number
}

function toIsoDate(x: unknown): string {
  if (typeof x === 'string') return x
  const n = typeof x === 'bigint' ? Number(x) : Number(x)
  return new Date(n).toISOString().slice(0, 10)
}
function toNum(x: unknown): number {
  return typeof x === 'bigint' ? Number(x) : Number(x)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') || ''

  // ---- 1) METADATA: always allowed, best-effort, 200-always
  if (mode === 'metadata') {
    try {
      const meta = await fs.readFile(META_PATH).then(b => JSON.parse(b.toString())).catch(() => ({} as Record<string, any>))
      let files: Array<{ ticker:string; records:number; startDate:string|null; endDate:string|null; parquetSizeBytes?:number; reductionPercent?:number }> = []

      if (Object.keys(meta).length > 0) {
        files = Object.entries(meta).map(([ticker, cov]: any) => ({
          ticker,
          records: cov.records ?? 0,
          startDate: cov.startDate ?? null,
          endDate: cov.endDate ?? null,
          parquetSizeBytes: cov.parquetSizeBytes,
          reductionPercent: cov.reductionPercent,
        }))
      } else {
        const names = await fs.readdir(PARQUET_DIR).catch(() => [])
        const tickers = names.filter(n => n.toLowerCase().endsWith('.parquet')).map(n => n.replace(/\.parquet$/i, ''))
        for (const t of tickers) {
          const p = path.join(PARQUET_DIR, `${t}.parquet`)
          const size = await fs.stat(p).then(s => s.size).catch(() => undefined)
          const buf = await fs.readFile(p)
          const { ParquetReader } = await import('parquetjs-lite')
          const reader = await ParquetReader.openBuffer(buf)
          const cursor = reader.getCursor()
          const rows:any[] = []
          for (let r = await cursor.next(); r; r = await cursor.next()) rows.push(r)
          await reader.close()
          const norm = rows.map(r => ({
            date: toIsoDate(r.date ?? r.timestamp),
            ts: toNum(r.timestamp ?? r.date),
          })).sort((a,b)=>a.ts-b.ts)
          files.push({
            ticker: t,
            records: norm.length,
            startDate: norm[0]?.date ?? null,
            endDate: norm.at(-1)?.date ?? null,
            parquetSizeBytes: size,
          })
        }
      }

      const summary = {
        tickers: files.length,
        records: files.reduce((a, f) => a + (f.records || 0), 0),
        jsonSizeHuman: '-',
        parquetSizeHuman: '-',
        reductionPercent: 0,
      }
      return NextResponse.json({ success: true, source: 'local', metadata: { generatedAt: new Date().toISOString(), summary, files } })
    } catch (e:any) {
      // still return 200 with a clear error shape
      return NextResponse.json({ success:false, source:'local', error:String(e) })
    }
  }

  // ---- 2) DATA: read a single ticker window, clamp to coverage, never 4xx
  const ticker = (url.searchParams.get('ticker') || '').toUpperCase()
  const startDateReq = url.searchParams.get('startDate') || url.searchParams.get('start') || ''
  const endDateReq = url.searchParams.get('endDate') || url.searchParams.get('end') || ''

  if (!ticker) {
    return NextResponse.json({ success:false, source:'local-parquet', error:'ticker required', data:[], meta:{ requested:{start:startDateReq,end:endDateReq} } })
  }

  const filePath = path.join(PARQUET_DIR, `${ticker}.parquet`)
  const exists = await fs.stat(filePath).then(()=>true).catch(()=>false)
  if (!exists) {
    return NextResponse.json({
      success: true,
      source: 'local-parquet',
      data: [],
      meta: {
        requested: { start: startDateReq, end: endDateReq },
        used: null,
        coverage: null,
        note: 'ticker parquet not found'
      }
    })
  }

  try {
    const buf = await fs.readFile(filePath)
    const { ParquetReader } = await import('parquetjs-lite')
    const reader = await ParquetReader.openBuffer(buf)
    const cursor = reader.getCursor()
    const raw:any[] = []
    for (let r = await cursor.next(); r; r = await cursor.next()) raw.push(r)
    await reader.close()

    // normalize & sort
    const rows: Row[] = raw.map((r:any) => ({
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

    const covStart = rows[0]?.date
    const covEnd   = rows.at(-1)?.date
    const coverage = { start: covStart, end: covEnd }

    // clamp requested range to coverage
    const reqStart = startDateReq || covStart
    const reqEnd   = endDateReq   || covEnd
    const usedStart = covStart ? (reqStart! < covStart ? covStart : reqStart) : reqStart!
    const usedEnd   = covEnd   ? (reqEnd!   > covEnd   ? covEnd   : reqEnd)   : reqEnd!

    const used = (usedStart && usedEnd && usedStart <= usedEnd)
      ? { start: usedStart, end: usedEnd }
      : null

    const data = used
      ? rows.filter(r => r.date >= used.start && r.date <= used.end)
      : []

    const note = (!used || used.start !== reqStart || used.end !== reqEnd)
      ? 'requested range was clamped to coverage'
      : undefined

    return NextResponse.json({
      success: true,
      source: 'local-parquet',
      data,
      meta: {
        requested: { start: reqStart, end: reqEnd },
        used,
        coverage,
        count: data.length,
        ...(note ? { note } : {})
      }
    })
  } catch (e:any) {
    // still 200 to keep smoke stable
    return NextResponse.json({
      success:false,
      source:'local-parquet',
      error:String(e),
      data:[],
      meta:{ requested:{ start:startDateReq, end:endDateReq } }
    })
  }
}
