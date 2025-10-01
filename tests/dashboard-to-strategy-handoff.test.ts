import { describe, expect, it } from 'vitest'

import {
  buildIndicatorTokens,
  clampPeriod,
  formatIndicatorPrompt,
  type IndicatorToggleState,
} from '@/app/(shell)/dashboard/utils'
import { createStrategyState } from '@/app/store/strategyStore'

describe('dashboard to strategy hand-off', () => {
  it('captures selections in the strategy store and formats prompt hints', () => {
    const toggles: IndicatorToggleState = {
      sma: { enabled: true, period: 55 },
      ema: { enabled: true, period: 18 },
      rsi: true,
      macd: false,
    }

    const tokens = buildIndicatorTokens(toggles)
    expect(tokens).toEqual(['SMA55', 'EMA18', 'RSI'])

    const store = createStrategyState()
    store.setStrategy({
      tickers: ['AAPL', 'MSFT'],
      indicators: tokens,
      start: '2024-01-01',
      end: '2024-12-31',
    })

    const snapshot = store.getState()
    expect(snapshot).toEqual({
      tickers: ['AAPL', 'MSFT'],
      indicators: ['SMA55', 'EMA18', 'RSI'],
      start: '2024-01-01',
      end: '2024-12-31',
    })

    const prompt = formatIndicatorPrompt(snapshot.indicators)
    expect(prompt).toBe('Strategy idea: Use SMA(55), EMA(18), and RSI on the selected stocks.')

    store.clearStrategy()
    expect(store.getState()).toEqual({ tickers: [], indicators: [], start: undefined, end: undefined })
  })

  it('clamps indicator periods when invalid values are provided', () => {
    const toggles: IndicatorToggleState = {
      sma: { enabled: true, period: clampPeriod(-5, 50) },
      ema: { enabled: true, period: clampPeriod(Number.NaN, 20) },
      rsi: false,
      macd: false,
    }

    const tokens = buildIndicatorTokens(toggles)
    expect(tokens).toEqual(['SMA50', 'EMA20'])
  })
})
