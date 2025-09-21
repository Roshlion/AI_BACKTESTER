import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read parquet from Blob (PARQUET_URL) or fallback to /public/AAPL.parquet
async function openParquetBuffer(req: NextRequest) {
  const blobUrl = process.env.PARQUET_URL;
  const origin =
    (req as any).nextUrl?.origin ?? new URL(req.url).origin;
  const src =
    blobUrl && /^https?:\/\//i.test(blobUrl)
      ? blobUrl
      : `${origin}/AAPL.parquet`;

  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch parquet: ${res.status} from ${src}`);
  return Buffer.from(await res.arrayBuffer());
}

function toISODate(rec: any): string {
  if (typeof rec?.date === "string") return rec.date.slice(0, 10);
  const ts = typeof rec?.timestamp === "bigint" ? Number(rec.timestamp) : Number(rec?.timestamp ?? rec?.date);
  return new Date(ts).toISOString().slice(0, 10);
}

function toNum(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : Number(v);
}

export async function POST(req: NextRequest) {
  try {
    const { tickers, startDate, endDate } = (await req.json()) as {
      tickers: string[];
      startDate: string;
      endDate: string;
    };

    if (!tickers?.length || !startDate || !endDate) {
      return NextResponse.json(
        { ok: false, error: "tickers[], startDate, endDate required" },
        { status: 400 }
      );
    }

    const buf = await openParquetBuffer(req);
    // @ts-ignore // parquetjs-lite has no types
    const { ParquetReader } = await import("parquetjs-lite");
    const reader = await ParquetReader.openBuffer(buf);
    const cursor = reader.getCursor();

    // Read all rows once; filter per ticker below
    const allRows: any[] = [];
    for (let r = await cursor.next(); r; r = await cursor.next()) allRows.push(r);
    await reader.close();

    // Some parquet files may not have a 'ticker' column (single-ticker files).
    // If missing, assume it's AAPL (our demo file).
    const hasTickerCol = allRows.length > 0 && "ticker" in allRows[0];

    const out = tickers.map((tkRaw) => {
      const ticker = tkRaw.toUpperCase();
      const subset = hasTickerCol
        ? allRows.filter((r) => (r.ticker?.toUpperCase?.() ?? r.ticker) === ticker)
        : ticker === "AAPL"
          ? allRows
          : [];

      const bars = subset
        .map((r) => ({ date: toISODate(r), close: toNum(r.close) }))
        .filter((d) => d.date >= startDate && d.date <= endDate);

      return { ticker, bars };
    });

    return NextResponse.json({
      ok: true,
      source: process.env.PARQUET_URL ? "blob" : "public",
      data: out,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
