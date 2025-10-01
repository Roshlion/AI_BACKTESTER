import { describe, expect, it } from 'vitest'

import { formatIndicatorPrompt } from '@/app/(shell)/dashboard/utils'
import { createStrategyState } from '@/app/store/strategyStore'

describe('strategy client prefills', () => {
  it('returns initial selections when provided and clears when requested', () => {
    const store = createStrategyState({
      tickers: ['AAPL', 'AMZN'],
      indicators: ['SMA50', 'EMA20'],
      start: '2023-01-01',
      end: '2023-12-31',
    })

    expect(store.getState()).toEqual({
      tickers: ['AAPL', 'AMZN'],
      indicators: ['SMA50', 'EMA20'],
      start: '2023-01-01',
      end: '2023-12-31',
    })

    const prompt = formatIndicatorPrompt(store.getState().indicators)
    expect(prompt).toBe('Strategy idea: Use SMA(50) and EMA(20) on the selected stocks.')

    store.clearStrategy()
    expect(store.getState()).toEqual({ tickers: [], indicators: [], start: undefined, end: undefined })
  })
})
