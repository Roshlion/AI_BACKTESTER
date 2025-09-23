import { NextRequest, NextResponse } from "next/server";
import { normaliseDsl, type StrategyDSL } from "@/lib/strategy-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const DSL_PROMPT_TEMPLATE = `You are an AI trading strategy generator. Convert the user's strategy description into a Strategy DSL JSON.

The DSL format supports these rule types:

1. "sma_cross" or "ema_cross" - Moving average crossovers
   - params: { fast: number, slow: number, enter?: "fast_above"|"fast_below", exit?: "fast_above"|"fast_below" }
   - Example: { "type": "sma_cross", "params": { "fast": 10, "slow": 30, "enter": "fast_above", "exit": "fast_below" } }

2. "macd_cross" - MACD signal line crossovers
   - params: { fast?: number, slow?: number, signal?: number, enter?: "bull"|"bear", exit?: "bull"|"bear" }
   - Example: { "type": "macd_cross", "params": { "fast": 12, "slow": 26, "signal": 9, "enter": "bull", "exit": "bear" } }

3. "rsi_threshold" - RSI overbought/oversold levels
   - params: { period?: number, low?: number, high?: number, enter?: "long"|"short", exit?: "long"|"short" }
   - Example: { "type": "rsi_threshold", "params": { "period": 14, "low": 30, "high": 70, "enter": "long", "exit": "long" } }

Respond ONLY with a valid JSON object in this format:
{
  "name": "Strategy Name",
  "rules": [
    { "type": "rule_type", "params": { ... } }
  ]
}

User's strategy description: `;

const ML_PROMPT_TEMPLATE = `You are an AI trading strategy generator. Convert the user's strategy description into executable Python code.

Requirements:
1. Read historical OHLCV data from sys.stdin as CSV
2. Implement the ML strategy as described
3. Output results as JSON to stdout using print(json.dumps(result))

The CSV input will have columns: date,open,high,low,close,volume

Your Python code should:
- Import required libraries (pandas, numpy, sklearn, etc.)
- Read data: df = pd.read_csv(sys.stdin)
- Implement the ML strategy
- Simulate trading based on predictions
- Output JSON with keys: totalReturnPct, trades, winRatePct, accuracy (if applicable)

Example output format:
{
  "totalReturnPct": 12.5,
  "trades": 15,
  "winRatePct": 60.0,
  "accuracy": 55.2
}

User's strategy description: `;

async function callOpenAI(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { prompt, mode = "dsl" } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({
        ok: false,
        error: "prompt (string) required"
      }, { status: 400 });
    }

    if (mode === "ml") {
      // Generate Python code for ML strategy
      const fullPrompt = ML_PROMPT_TEMPLATE + prompt;
      const code = await callOpenAI(fullPrompt);

      return NextResponse.json({
        ok: true,
        mode: "ml",
        code: code.trim(),
        prompt
      });
    } else {
      // Generate DSL for rule-based strategy
      const fullPrompt = DSL_PROMPT_TEMPLATE + prompt;
      const response = await callOpenAI(fullPrompt);

      // Try to parse the JSON response
      let dsl: StrategyDSL;
      try {
        const parsed = JSON.parse(response.trim());
        dsl = normaliseDsl(parsed);
      } catch (parseError) {
        return NextResponse.json({
          ok: false,
          error: "Failed to parse strategy DSL from AI response",
          raw_response: response,
          parse_error: parseError instanceof Error ? parseError.message : String(parseError)
        }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        mode: "dsl",
        dsl,
        prompt
      });
    }
  } catch (error) {
    console.error("/api/strategy/generate", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}