import type { Row } from '@/types/row'

export type IndicatorToggleState = {
  sma: { enabled: boolean; period: number }
  ema: { enabled: boolean; period: number }
  rsi: boolean
  macd: boolean
}

export function filterTickers(allTickers: string[], searchTerm: string): string[] {
  if (!searchTerm.trim()) {
    return [...allTickers]
  }
  const term = searchTerm.trim().toUpperCase()
  return allTickers.filter((ticker) => ticker.toUpperCase().includes(term))
}

export function buildIndicatorTokens(state: IndicatorToggleState): string[] {
  const tokens: string[] = []
  if (state.sma.enabled) {
    const period = clampPeriod(state.sma.period, 50)
    tokens.push(`SMA${period}`)
  }
  if (state.ema.enabled) {
    const period = clampPeriod(state.ema.period, 20)
    tokens.push(`EMA${period}`)
  }
  if (state.rsi) {
    tokens.push('RSI')
  }
  if (state.macd) {
    tokens.push('MACD')
  }
  return tokens
}

export function computeMinMaxDates(
  series: Record<string, Row[]>,
  tickers: string[],
): { start: string | null; end: string | null } {
  let min: string | null = null
  let max: string | null = null

  for (const ticker of tickers) {
    const rows = series[ticker]
    if (!rows?.length) continue
    const first = rows[0]?.date
    const last = rows[rows.length - 1]?.date
    if (first) {
      if (!min || first < min) {
        min = first
      }
    }
    if (last) {
      if (!max || last > max) {
        max = last
      }
    }
  }

  return { start: min, end: max }
}

export function formatIndicatorPrompt(tokens: string[]): string {
  if (!tokens.length) {
    return ''
  }

  const formatted = tokens.map((token) => {
    const match = token.match(/([A-Z]+)(\d+)?/)
    if (!match) return token
    const [, name, period] = match
    return period ? `${name}(${period})` : name
  })

  if (formatted.length === 1) {
    return `Strategy idea: Use ${formatted[0]} on the selected stocks.`
  }

  const last = formatted.pop()
  const intro = formatted.join(', ')
  const needsComma = formatted.length > 1
  const separator = intro ? (needsComma ? ', ' : ' ') : ''
  return `Strategy idea: Use ${intro}${separator}and ${last} on the selected stocks.`
}

export function clampPeriod(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.max(1, Math.round(value))
}

export function toggleTickerSelection(selection: string[], ticker: string): string[] {
  if (selection.includes(ticker)) {
    return selection.filter((item) => item !== ticker)
  }
  return [...selection, ticker]
}

export function isolateTickerSelection(ticker: string): string[] {
  return [ticker]
}

export function buildExploreHref(ticker: string): string {
  return `/explore?symbol=${encodeURIComponent(ticker)}`
}
