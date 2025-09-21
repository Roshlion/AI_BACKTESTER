import { NextRequest, NextResponse } from "next/server";
import { readTickerRange, getDataSource } from "@/lib/safeParquet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { tickers, startDate, endDate } = (await req.json()) as {
      tickers: string[];
      startDate: string;
      endDate: string;
    };

    // Validate inputs
    if (!tickers?.length || !startDate || !endDate) {
      return NextResponse.json(
        { ok: false, error: "tickers[], startDate, endDate required" },
        { status: 400 }
      );
    }

    // Process each ticker using manifest-aware reader
    const data = await Promise.all(
      tickers.map(async (tickerRaw) => {
        const ticker = tickerRaw.toUpperCase();

        try {
          const rows = await readTickerRange(req, ticker, startDate, endDate);

          // Extract required fields for bars
          const bars = rows.map((r) => ({
            date: r.date,
            close: r.close,
            open: r.open,
            high: r.high,
            low: r.low,
            volume: r.volume
          }));

          return { ticker, bars };
        } catch (error) {
          console.error(`Error loading data for ${ticker}:`, error);
          // If a ticker is absent in manifest, return its entry with bars:[]
          return { ticker, bars: [] };
        }
      })
    );

    const sourceInfo = await getDataSource(req);

    return NextResponse.json({
      ok: true,
      source: sourceInfo.source,
      data,
    });
  } catch (e: any) {
    console.error('Error in /api/local-batch:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
