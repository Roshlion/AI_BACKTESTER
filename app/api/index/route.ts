import { NextRequest, NextResponse } from 'next/server';
import { loadManifest } from '@/lib/safeParquet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const manifest = await loadManifest(req);
    return NextResponse.json({ ok: true, manifest });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}