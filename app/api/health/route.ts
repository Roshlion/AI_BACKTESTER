import { NextRequest, NextResponse } from 'next/server';
import { loadManifest, resolveTickerPath } from '@/lib/safeParquet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const checks = {
    manifest: false,
    sample: false
  };

  try {
    // Check 1: Manifest reachable
    const manifest = await loadManifest(req);
    checks.manifest = manifest.tickers.length > 0;

    // Check 2: Sample ticker fetch (just check if URL is reachable, don't parse)
    if (manifest.tickers.length > 0) {
      const sampleTicker = manifest.tickers[0];
      const tickerUrl = resolveTickerPath(manifest, sampleTicker.ticker, req);

      if (tickerUrl) {
        try {
          const response = await fetch(tickerUrl, {
            method: 'HEAD', // Just check if reachable
            cache: "no-store"
          });
          checks.sample = response.ok;
        } catch {
          checks.sample = false;
        }
      }
    }

    return NextResponse.json({
      ok: checks.manifest && checks.sample,
      checks,
      timestamp: new Date().toISOString(),
      manifest: {
        source: manifest.source,
        tickerCount: manifest.tickers.length,
        asOf: manifest.asOf
      }
    });
  } catch (error) {
    console.error('Health check error:', error);

    return NextResponse.json({
      ok: false,
      checks,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}