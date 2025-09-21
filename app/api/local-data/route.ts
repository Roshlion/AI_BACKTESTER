export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ParquetReader } from "parquetjs-lite";

async function openParquet(req: Request) {
  const blobUrl = process.env.PARQUET_URL;
  if (blobUrl && /^https?:\/\//i.test(blobUrl)) {
    const res = await fetch(blobUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch PARQUET_URL: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return await ParquetReader.openBuffer(buf);
  }

  // Fallback: read the demo file served from /public on Vercel
  const host = new URL(req.url).host;
  const scheme = "https";
  const res = await fetch(`${scheme}://${host}/AAPL.parquet`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch /AAPL.parquet: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return await ParquetReader.openBuffer(buf);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") ?? "";
    const ticker = searchParams.get("ticker") ?? "AAPL";

    const reader = await openParquet(req);
    const cursor = await reader.getCursor();
    const rows: any[] = [];
    for (let rec = await cursor.next(); rec; rec = await cursor.next()) {
      if (!ticker || rec.ticker === ticker) rows.push(rec);
    }
    await reader.close();

    if (mode === "metadata") {
      const firstDate = rows[0]?.date ?? null;
      const lastDate = rows.at(-1)?.date ?? null;
      return NextResponse.json({
        ok: true,
        ticker,
        records: rows.length,
        firstDate,
        lastDate,
        source: process.env.PARQUET_URL ? "blob" : "public",
      });
    }

    return NextResponse.json({ ok: true, ticker, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
