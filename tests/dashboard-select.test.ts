import { describe, expect, it } from 'vitest'

import {
  buildExploreHref,
  buildIndicatorTokens,
  filterTickers,
  isolateTickerSelection,
  toggleTickerSelection,
  type IndicatorToggleState,
} from '@/app/(shell)/dashboard/utils'

const INDICATOR_DEFAULTS: IndicatorToggleState = {
  sma: { enabled: true, period: 50 },
  ema: { enabled: false, period: 20 },
  rsi: false,
  macd: false,
}

describe('dashboard selection helpers', () => {
  it('filters tickers by search term and exposes empty states', () => {
    const all = ['AAPL', 'AMD', 'MSFT', 'AMZN']
    expect(filterTickers(all, 'a')).toEqual(['AAPL', 'AMD', 'AMZN'])
    expect(filterTickers(all, 'ms')).toEqual(['MSFT'])
    expect(filterTickers(all, 'zzz')).toEqual([])
  })

  it('toggles and isolates tickers deterministically', () => {
    let selection: string[] = []
    selection = toggleTickerSelection(selection, 'AAPL')
    selection = toggleTickerSelection(selection, 'AMD')
    expect(selection).toEqual(['AAPL', 'AMD'])

    selection = toggleTickerSelection(selection, 'AAPL')
    expect(selection).toEqual(['AMD'])

    selection = isolateTickerSelection('MSFT')
    expect(selection).toEqual(['MSFT'])
  })

  it('builds indicator tokens and deep links for Data Warehouse', () => {
    const tokens = buildIndicatorTokens({ ...INDICATOR_DEFAULTS, rsi: true })
    expect(tokens).toEqual(['SMA50', 'RSI'])
    expect(buildExploreHref('AMD')).toBe('/explore?symbol=AMD')
    expect(buildExploreHref('BRK.B')).toBe('/explore?symbol=BRK.B')
  })
})
