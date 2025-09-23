import { NextResponse } from "next/server";
import { readTickerRange, loadManifest } from "@/lib/safeParquet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    const startDate = searchParams.get("start") ?? searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("end") ?? searchParams.get("endDate") ?? undefined;

    if (!ticker) {
      return NextResponse.json({ ok: false, error: "ticker required" }, { status: 400 });
    }

    const manifest = await loadManifest();
    const entry = manifest.tickers.find((item) => item.ticker === ticker);

    const rows = await readTickerRange(ticker, startDate, endDate);
    const count = rows.length;

    if (!count) {
      return NextResponse.json({
        ok: true,
        ticker,
        rows: [],
        count: 0,
        range: { start: startDate ?? null, end: endDate ?? null },
        note: "No data",
        source: entry?.url ?? null,
      });
    }

    return NextResponse.json({
      ok: true,
      ticker,
      count,
      range: { start: startDate ?? rows[0].date, end: endDate ?? rows.at(-1)?.date },
      rows,
      source: entry?.url ?? null,
    });
  } catch (error) {
    console.error("/api/local-data", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
