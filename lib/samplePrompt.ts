export interface IndicatorSelection {
  rsi?: boolean;
  macd?: boolean;
  sma?: boolean;
  ema?: boolean;
}

function formatWindow(start?: string, end?: string): string {
  if (start && end) return `${start} to ${end}`;
  if (start) return `starting ${start}`;
  if (end) return `through ${end}`;
  return "across the available history";
}

export function buildSamplePrompt(
  indicators: IndicatorSelection,
  tickers: string[],
  start?: string,
  end?: string,
): string {
  const entryConditions: string[] = [];
  const exitConditions: string[] = [];

  if (indicators.sma && indicators.ema) {
    entryConditions.push("SMA(20) crosses above EMA(50)");
    exitConditions.push("SMA(20) crosses below EMA(50)");
  } else if (indicators.sma) {
    entryConditions.push("price closes above SMA(20)");
    exitConditions.push("price falls back below SMA(20)");
  } else if (indicators.ema) {
    entryConditions.push("price closes above EMA(50)");
    exitConditions.push("price falls back below EMA(50)");
  }

  if (indicators.rsi) {
    entryConditions.push("RSI(14) < 30");
    exitConditions.push("RSI(14) > 70");
  }

  if (indicators.macd) {
    entryConditions.push("MACD crosses above its signal line");
    exitConditions.push("MACD crosses back below the signal line");
  }

  if (!entryConditions.length) {
    entryConditions.push("price breaks above recent resistance");
  }
  if (!exitConditions.length) {
    exitConditions.push("price breaks below recent support");
  }

  const universe = tickers.length ? tickers.join(", ") : "the selected equities";
  const window = formatWindow(start, end);

  return [
    `Focus on ${universe}.`,
    `Enter long when ${entryConditions.join(" and ")}.`,
    `Exit when ${exitConditions.join(" or ")} while managing risk with stops and position sizing.`,
    `Evaluate performance ${window}.`,
  ].join(" ");
}

export function buildSamplePromptFromKeys(
  keys: string[],
  tickers: string[],
  start?: string,
  end?: string,
): string {
  const selection: IndicatorSelection = {};
  keys
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .forEach((key) => {
      if (key === "sma" || key === "ema" || key === "rsi" || key === "macd") {
        selection[key] = true;
      }
    });
  return buildSamplePrompt(selection, tickers, start, end);
}
