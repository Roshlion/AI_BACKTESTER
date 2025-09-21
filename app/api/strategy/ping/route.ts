// app/api/strategy/ping/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'pong-only' }],
      max_tokens: 4,
    });
    return NextResponse.json({ ok: true, model: r.model });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
