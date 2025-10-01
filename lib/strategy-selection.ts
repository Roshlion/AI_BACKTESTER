export type IndicatorDescriptor = {
  type: "SMA" | "EMA" | "RSI" | "MACD";
  period?: number;
};

export function parseIndicators(rawIndicators: string[]): IndicatorDescriptor[] {
  const descriptors: IndicatorDescriptor[] = [];

  for (const token of rawIndicators) {
    const trimmed = token.trim().toUpperCase();
    if (!trimmed) continue;

    const match = trimmed.match(/^(SMA|EMA)(\d+)$/i);
    if (match) {
      descriptors.push({
        type: match[1].toUpperCase() as "SMA" | "EMA",
        period: Number(match[2]),
      });
      continue;
    }

    if (trimmed === "RSI" || trimmed === "MACD") {
      descriptors.push({ type: trimmed as "RSI" | "MACD" });
    }
  }

  return descriptors;
}

export function buildPromptFromIndicators(indicators: string[]): string {
  if (!indicators.length) {
    return "";
  }

  const formatted = indicators
    .map((indicator) => indicator.toUpperCase().replace(/(\d+)/g, "($1)"))
    .join(" and ");

  if (indicators.length === 1) {
    return `Strategy idea: Use ${formatted} on the selected stocks.`;
  }

  return `Strategy idea: Use ${formatted} on the selected stocks.`;
}
