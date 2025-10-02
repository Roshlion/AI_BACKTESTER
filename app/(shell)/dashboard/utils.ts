// Dashboard utility functions

export function formatIndicators(indicators: {
  sma: { enabled: boolean; period: number };
  ema: { enabled: boolean; period: number };
  rsi: { enabled: boolean };
  macd: { enabled: boolean };
}): string[] {
  const result: string[] = [];

  if (indicators.sma.enabled) {
    result.push(`SMA${indicators.sma.period}`);
  }

  if (indicators.ema.enabled) {
    result.push(`EMA${indicators.ema.period}`);
  }

  if (indicators.rsi.enabled) {
    result.push('RSI');
  }

  if (indicators.macd.enabled) {
    result.push('MACD');
  }

  return result;
}

export function computeMinMaxDates(tickerDataList: Array<{ firstDate?: string; lastDate?: string }>): { start?: string; end?: string } {
  const validTickers = tickerDataList.filter(t => t.firstDate && t.lastDate);

  if (validTickers.length === 0) {
    return { start: undefined, end: undefined };
  }

  const start = Math.min(...validTickers.map(t => new Date(t.firstDate!).getTime()));
  const end = Math.max(...validTickers.map(t => new Date(t.lastDate!).getTime()));

  return {
    start: new Date(start).toISOString().split('T')[0],
    end: new Date(end).toISOString().split('T')[0],
  };
}