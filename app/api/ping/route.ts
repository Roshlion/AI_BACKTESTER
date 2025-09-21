import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const polygonApiKey = process.env.POLYGON_API_KEY;

    return NextResponse.json({
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: {
        hasPolygonKey: !!polygonApiKey,
        runtime: 'nodejs'
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}