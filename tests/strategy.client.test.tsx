import { describe, expect, it } from "vitest";

import { buildPromptFromIndicators, parseIndicators } from "@/lib/strategy-selection";

describe("strategy selection helpers", () => {
  it("formats prompt text with periods", () => {
    const prompt = buildPromptFromIndicators(["SMA50", "RSI"]);
    expect(prompt).toBe("Strategy idea: Use SMA(50) and RSI on the selected stocks.");
  });

  it("parses indicator descriptors", () => {
    const indicators = parseIndicators(["sma50", "ema20", "RSI", "MACD"]);
    expect(indicators).toEqual([
      { type: "SMA", period: 50 },
      { type: "EMA", period: 20 },
      { type: "RSI" },
      { type: "MACD" },
    ]);
  });
});
