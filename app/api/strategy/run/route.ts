// app/api/strategy/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Mkt = { date: string; open: number; high: number; low: number; close: number; volume: number; timestamp: number; ticker: string };

async function loadLocalParquet(req: NextRequest, ticker: string, start: string, end: string): Promise<Mkt[]> {
  const blobUrl = process.env.PARQUET_URL;
  let src: string;

  if (blobUrl && /^https?:\/\//i.test(blobUrl)) {
    src = blobUrl;
  } else {
    const origin = (req as any).nextUrl?.origin ?? new URL(req.url).origin;
    src = `${origin}/AAPL.parquet`;
  }

  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch parquet: ${res.status} from ${src}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const { ParquetReader } = await import('parquetjs-lite');
  const reader = await ParquetReader.openBuffer(buf);
  const cursor = reader.getCursor();
  const raw: any[] = [];
  for (let r = await cursor.next(); r; r = await cursor.next()) raw.push(r);
  await reader.close();

  const toNum = (v: unknown): number => typeof v === 'bigint' ? Number(v) : Number(v);
  const rows: Mkt[] = raw.map((r: any) => ({
    ticker: String(r.ticker ?? ''),
    date: typeof r.date === 'string' ? r.date : new Date(Number(r.timestamp ?? r.date)).toISOString().slice(0, 10),
    timestamp: toNum(r.timestamp ?? r.date ?? 0),
    open: toNum(r.open),
    high: toNum(r.high),
    low: toNum(r.low),
    close: toNum(r.close),
    volume: toNum(r.volume),
  }));

  return rows.filter(d => d.date >= start && d.date <= end && d.ticker === ticker);
}

const SYSTEM = `You output a JSON DSL describing a LONG-ONLY strategy. No code.
Schema:
{
 "name": string,
 "rules": [
   { "type":"macd_cross", "params":{"fast":12,"slow":26,"signal":9}, "enter":"long", "exit":"long" },
   { "type":"rsi_threshold", "params":{"period":14,"low":30,"high":70}, "enter":"long","exit":"long" },
   { "type":"sma_cross", "params":{"fast":10,"slow":20}, "enter":"long","exit":"long" },
   { "type":"ema_cross", "params":{"fast":10,"slow":20}, "enter":"long","exit":"long" }
 ]
}
Rules: Only these types, numeric params only. No text. Reply with JSON ONLY.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, ticker, startDate, endDate } = body as { prompt: string; ticker: string; startDate: string; endDate: string };
    if (!prompt || !ticker || !startDate || !endDate) {
      return NextResponse.json({ ok: false, error: 'prompt, ticker, startDate, endDate required' }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chat = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Build a strategy for: ${prompt}` }
      ],
      temperature: 0.2,
      max_tokens: 400,
    });

    const dsl = JSON.parse(chat.choices[0].message.content || '{}');

    if (!dsl || !dsl.rules || !Array.isArray(dsl.rules)) {
      return NextResponse.json({ ok: false, error: 'Invalid DSL from model', raw: chat.choices[0].message.content }, { status: 500 });
    }

    const rows = await loadLocalParquet(req, ticker.toUpperCase(), startDate, endDate);
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, dsl, result: null, note: 'No data in range' });
    }

    const { runBacktest } = await import('../../../../lib/strategy-engine');
    const result = runBacktest(dsl, rows);

    return NextResponse.json({ ok: true, dsl, result, meta: { count: rows.length, used: { start: rows[0].date, end: rows.at(-1)!.date } } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
