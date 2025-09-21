import { NextRequest, NextResponse } from 'next/server';
import { loadManifest } from '@/lib/safeParquet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const manifest = await loadManifest(req);

    const tickers = manifest.tickers.map(ticker => ({
      ticker: ticker.ticker,
      firstDate: ticker.firstDate,
      lastDate: ticker.lastDate,
      records: ticker.records
    }));

    return NextResponse.json({
      ok: true,
      source: manifest.source,
      tickers,
      count: manifest.tickers.length,
      asOf: manifest.asOf,
      version: manifest.version
    });
  } catch (error) {
    console.error('Error in /api/index:', error);

    return NextResponse.json({
      ok: true, // Always respond ok:true even if empty
      source: 'public',
      tickers: [],
      count: 0,
      asOf: new Date().toISOString(),
      version: 1,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}