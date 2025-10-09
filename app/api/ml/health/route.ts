import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = process.env.ML_API_URL?.replace(/\/+$/, '');
  if (!base) {
    return NextResponse.json({ status: 'down', error: 'ML_API_URL not set' }, { status: 200 });
  }
  try {
    const r = await fetch(`${base}/health`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json().catch(() => ({}));
    return NextResponse.json({ status: 'ok', upstream: j }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ status: 'down', error: String(e?.message || e) }, { status: 200 });
  }
}
