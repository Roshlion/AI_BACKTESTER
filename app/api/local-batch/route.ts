import { NextRequest, NextResponse } from 'next/server';
import { readTickerRange } from '@/lib/safeParquet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { tickers, startDate, endDate } = (await req.json()) as {
      tickers: string[];
      startDate?: string;
      endDate?: string;
    };
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ ok: false, error: 'tickers[] required' }, { status: 400 });
    }
    const data = await Promise.all(
      tickers.map(async (t) => ({
        ticker: t.toUpperCase(),
        bars: await readTickerRange(req, t, startDate, endDate),
      }))
    );
    return NextResponse.json({ ok: true, source: 'manifest', data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}