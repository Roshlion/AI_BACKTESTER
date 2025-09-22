import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const lib: any = await import("@/lib/strategy-engine"); // typed as any to avoid TS export errors

    const defaultDsl = {
      name: "Simple MACD Strategy",
      rules: [{ type: "macd_cross", params: { fast: 12, slow: 26, signal: 9 } }],
    };

    const dsl =
      (typeof lib.buildDslFromPrompt === "function" && body?.prompt
        ? lib.buildDslFromPrompt(body.prompt)
        : body?.dsl) || defaultDsl;

    const tickers = body?.tickers ?? ["AAPL"];
    const bars    = body?.bars ?? [];
    const result  = await lib.runBacktest({ dsl, tickers, bars });

    return NextResponse.json({ ok: true, dsl, result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
