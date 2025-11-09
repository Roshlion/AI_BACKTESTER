// Color palette for chart readability with many tickers

export const CHART_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // purple
  '#06B6D4', // cyan
  '#F97316', // orange
  '#84CC16', // lime
  '#EC4899', // pink
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#EAB308', // yellow
  '#DC2626', // red-600
  '#059669', // green-600
  '#7C3AED', // purple-600
  '#0891B2', // cyan-600
];

export function getTickerColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export function recycleColors(tickerCount: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < tickerCount; i++) {
    colors.push(getTickerColor(i));
  }
  return colors;
}