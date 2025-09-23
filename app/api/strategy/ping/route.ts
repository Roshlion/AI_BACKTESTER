// app/api/strategy/ping/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: false, error: "OpenAI integration disabled" }, { status: 501 });
}