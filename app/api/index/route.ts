import { NextResponse } from "next/server";
import { S3_BASE } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = `${S3_BASE}/index.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `manifest fetch failed: ${res.status}`, tickers: [], source: url, asOf: null },
        { status: 502 },
      );
    }
    const j = await res.json();
    const tickers = Array.isArray(j?.tickers) ? j.tickers : [];
    return NextResponse.json({
      tickers,
      asOf: j?.asOf ?? null,
      source: j?.source ?? url,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e), tickers: [] }, { status: 500 });
  }
}
