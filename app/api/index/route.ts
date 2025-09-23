import path from "path";
import fs from "fs-extra";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readManifestFile() {
  const manifestPath = path.join(process.cwd(), "public", "manifest.json");
  return fs.readJson(manifestPath);
}

export async function GET(req: NextRequest) {
  try {
    const manifest = await readManifestFile();
    const params = req.nextUrl.searchParams;
    const sectorFilter = params.get("sector")?.toLowerCase();
    const industryFilter = params.get("industry")?.toLowerCase();
    const query = params.get("q")?.toLowerCase();
    const limitParam = Number(params.get("limit") ?? "100");
    const offsetParam = Number(params.get("offset") ?? "0");

    let entries = Array.isArray(manifest?.tickers) ? manifest.tickers : [];

    if (sectorFilter) {
      entries = entries.filter((item: any) => (item.sector ?? "").toLowerCase() === sectorFilter);
    }

    if (industryFilter) {
      entries = entries.filter((item: any) => (item.industry ?? "").toLowerCase() === industryFilter);
    }

    if (query) {
      entries = entries.filter((item: any) => {
        const ticker = String(item.ticker ?? "").toLowerCase();
        const name = String(item.name ?? "").toLowerCase();
        return ticker.includes(query) || name.includes(query);
      });
    }

    const total = entries.length;
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, limitParam)) : 100;
    const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;
    const results = entries.slice(offset, offset + limit);

    return NextResponse.json({
      ok: true,
      asOf: manifest?.asOf,
      total,
      limit,
      offset,
      results,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}