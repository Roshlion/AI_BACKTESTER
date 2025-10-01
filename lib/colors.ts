const palette = [
  '#60a5fa',
  '#f87171',
  '#34d399',
  '#fbbf24',
  '#a855f7',
  '#f97316',
  '#38bdf8',
  '#fb7185',
  '#22d3ee',
  '#c084fc',
  '#fde047',
  '#4ade80',
]

const cache = new Map<string, string>()

export function getSeriesColor(ticker: string, index: number): string {
  if (cache.has(ticker)) {
    return cache.get(ticker) as string
  }
  const color = palette[index % palette.length]
  cache.set(ticker, color)
  return color
}

export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '')
  const bigint = parseInt(hex, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`
}
