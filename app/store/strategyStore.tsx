'use client'

import { ReactNode, createContext, useContext, useMemo, useState } from 'react'

type StrategyPayload = {
  tickers: string[]
  indicators: string[]
  start?: string
  end?: string
}

type StrategyContextValue = StrategyPayload & {
  setStrategy: (payload: StrategyPayload) => void
  clearStrategy: () => void
}

const StrategyContext = createContext<StrategyContextValue | undefined>(undefined)

export function StrategyStoreProvider({ children }: { children: ReactNode }) {
  const [tickers, setTickers] = useState<string[]>([])
  const [indicators, setIndicators] = useState<string[]>([])
  const [start, setStart] = useState<string | undefined>(undefined)
  const [end, setEnd] = useState<string | undefined>(undefined)

  const value = useMemo<StrategyContextValue>(() => ({
    tickers,
    indicators,
    start,
    end,
    setStrategy: ({ tickers: nextTickers, indicators: nextIndicators, start: nextStart, end: nextEnd }) => {
      setTickers([...nextTickers])
      setIndicators([...nextIndicators])
      setStart(nextStart)
      setEnd(nextEnd)
    },
    clearStrategy: () => {
      setTickers([])
      setIndicators([])
      setStart(undefined)
      setEnd(undefined)
    },
  }), [tickers, indicators, start, end])

  return <StrategyContext.Provider value={value}>{children}</StrategyContext.Provider>
}

export function useStrategyStore() {
  const ctx = useContext(StrategyContext)
  if (!ctx) {
    throw new Error('StrategyStoreProvider is missing')
  }
  return ctx
}

export function createStrategyState(initial?: StrategyPayload) {
  let state: StrategyPayload = {
    tickers: [...(initial?.tickers ?? [])],
    indicators: [...(initial?.indicators ?? [])],
    start: initial?.start,
    end: initial?.end,
  }

  return {
    getState: () => ({
      tickers: [...state.tickers],
      indicators: [...state.indicators],
      start: state.start,
      end: state.end,
    }),
    setStrategy: (payload: StrategyPayload) => {
      state = {
        tickers: [...payload.tickers],
        indicators: [...payload.indicators],
        start: payload.start,
        end: payload.end,
      }
    },
    clearStrategy: () => {
      state = { tickers: [], indicators: [], start: undefined, end: undefined }
    },
  }
}
