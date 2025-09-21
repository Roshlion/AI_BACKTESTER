// app/api/strategy/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { readTickerRange } from '@/lib/safeParquet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM = `You output a JSON DSL describing a LONG-ONLY strategy. No code.
Schema:
{
 "name": string,
 "rules": [
   { "type":"macd_cross", "params":{"fast":12,"slow":26,"signal":9}, "enter":"long", "exit":"long" },
   { "type":"rsi_threshold", "params":{"period":14,"low":30,"high":70}, "enter":"long","exit":"long" },
   { "type":"sma_cross", "params":{"fast":10,"slow":20}, "enter":"long","exit":"long" },
   { "type":"ema_cross", "params":{"fast":10,"slow":20}, "enter":"long","exit":"long" }
 ]
}
Rules: Only these types, numeric params only. No text. Reply with JSON ONLY.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, dsl, ticker, startDate, endDate } = body as {
      prompt?: string;
      dsl?: any;
      ticker: string;
      startDate: string;
      endDate: string;
    };

    // Validate: prompt or dsl present
    if ((!prompt && !dsl) || !ticker || !startDate || !endDate) {
      return NextResponse.json({
        ok: false,
        error: 'Either prompt or dsl required, plus ticker, startDate, endDate'
      }, { status: 400 });
    }

    let finalDsl = dsl;

    // If prompt present → generate DSL from OpenAI; else use dsl directly
    if (prompt && !dsl) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const chat = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Build a strategy for: ${prompt}` }
        ],
        temperature: 0.2,
        max_tokens: 400,
      });

      finalDsl = JSON.parse(chat.choices[0].message.content || '{}');

      // Require a valid DSL before calling engine
      if (!finalDsl || !finalDsl.rules || !Array.isArray(finalDsl.rules)) {
        return NextResponse.json({
          ok: false,
          error: 'Invalid DSL from model',
          raw: chat.choices[0].message.content
        }, { status: 500 });
      }
    }

    // Load data via readTickerRange
    const rows = await readTickerRange(req, ticker, startDate, endDate);

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        dsl: finalDsl,
        result: null,
        note: 'No data'
      });
    }

    const { runBacktest } = await import('../../../../lib/strategy-engine');
    const result = runBacktest(finalDsl, rows);

    return NextResponse.json({
      ok: true,
      dsl: finalDsl,
      result,
      meta: {
        count: rows.length,
        used: {
          start: rows[0].date,
          end: rows.at(-1)!.date
        }
      }
    });
  } catch (e: any) {
    console.error('Error in /api/strategy/run:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
