import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { tickers, startDate, endDate } = await req.json() as { tickers:string[]; startDate:string; endDate:string }
    if (!tickers?.length || !startDate || !endDate) {
      return NextResponse.json({ ok:false, error:'tickers[], startDate, endDate required' }, { status:400 })
    }

    const out: { ticker:string; bars:{ date:string; close:number }[] }[] = []

    for (const tkRaw of tickers) {
      const ticker = tkRaw.toUpperCase()
      const filePath = path.join(process.cwd(), 'data', 'parquet-final', `${ticker}.parquet`)
      const exists = await fs.stat(filePath).then(()=>true).catch(()=>false)
      if (!exists) { out.push({ ticker, bars: [] }); continue }

      const buf = await fs.readFile(filePath)
      const { ParquetReader } = await import('parquetjs-lite')
      const reader = await ParquetReader.openBuffer(buf)
      const cursor = reader.getCursor()
      const rows:any[] = []
      for (let r = await cursor.next(); r; r = await cursor.next()) rows.push(r)
      await reader.close()

      const toNum = (v: unknown): number => typeof v === 'bigint' ? Number(v) : Number(v)
      const slim = rows.map((r:any) => ({
        date: typeof r.date === 'string' ? r.date : new Date(Number(r.timestamp ?? r.date)).toISOString().slice(0,10),
        close: toNum(r.close)
      })).filter(d => d.date >= startDate && d.date <= endDate)

      out.push({ ticker, bars: slim })
    }

    return NextResponse.json({ ok:true, data: out })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e) }, { status:500 })
  }
}