export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readTickerRange, loadManifest, getDataSource } from "@/lib/safeParquet";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") ?? "";
    const ticker = searchParams.get("ticker") ?? "AAPL";

    if (mode === "metadata" && ticker) {
      // Get metadata for specific ticker from manifest
      try {
        const manifest = await loadManifest(req);
        const tickerInfo = manifest.tickers.find(t => t.ticker.toUpperCase() === ticker.toUpperCase());

        if (tickerInfo) {
          return NextResponse.json({
            ok: true,
            ticker: tickerInfo.ticker,
            records: tickerInfo.records,
            firstDate: tickerInfo.firstDate,
            lastDate: tickerInfo.lastDate,
            source: manifest.source
          });
        } else {
          // Ticker not in manifest, return empty metadata
          return NextResponse.json({
            ok: true,
            ticker: ticker.toUpperCase(),
            records: 0,
            firstDate: null,
            lastDate: null,
            source: manifest.source,
            note: "Ticker not found in manifest"
          });
        }
      } catch (error) {
        console.error('Error getting metadata:', error);
        return NextResponse.json({
          ok: true,
          ticker: ticker.toUpperCase(),
          records: 0,
          firstDate: null,
          lastDate: null,
          source: 'public',
          note: "Error loading manifest"
        });
      }
    }

    // Load ticker data (fallback to AAPL if none specified)
    const rows = await readTickerRange(req, ticker, '1900-01-01', '2099-12-31');

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        ticker: ticker.toUpperCase(),
        rows: [],
        note: "No data"
      });
    }

    return NextResponse.json({
      ok: true,
      ticker: ticker.toUpperCase(),
      rows
    });
  } catch (e: any) {
    console.error('Error in /api/local-data:', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
