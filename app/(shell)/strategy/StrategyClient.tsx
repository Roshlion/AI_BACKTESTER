'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Filter, Layers, Loader2, Sparkles } from 'lucide-react'

import { useStrategyStore } from '@/app/store/strategyStore'
import { BacktestResults } from '@/components/backtest-results'
import { formatIndicatorPrompt } from '@/app/(shell)/dashboard/utils'

interface StrategyClientProps {
  initialTickers: string[]
  initialIndicators: string[]
  initialStart?: string
  initialEnd?: string
}

type GeneratedStrategy = {
  ok: boolean
  mode: 'dsl' | 'ml'
  dsl?: any
  code?: string
}

type BacktestResult = {
  ok: boolean
  summary: any
  perTicker: any[]
  logs: string[]
}

export default function StrategyClient({ initialTickers, initialIndicators, initialStart, initialEnd }: StrategyClientProps) {
  const { tickers: storeTickers, indicators: storeIndicators, start: storeStart, end: storeEnd, clearStrategy } =
    useStrategyStore()

  const hasUrlPrefill = Boolean(
    initialTickers.length || initialIndicators.length || initialStart || initialEnd,
  )

  const startingTickers = hasUrlPrefill ? initialTickers : storeTickers
  const startingIndicators = hasUrlPrefill ? initialIndicators : storeIndicators
  const startingStart = hasUrlPrefill ? initialStart : storeStart
  const startingEnd = hasUrlPrefill ? initialEnd : storeEnd

  useEffect(() => {
    if (!hasUrlPrefill && (storeTickers.length || storeIndicators.length || storeStart || storeEnd)) {
      clearStrategy()
    }
  }, [hasUrlPrefill, storeTickers.length, storeIndicators.length, storeStart, storeEnd, clearStrategy])

  const manualTickersRef = useRef<Set<string>>(new Set(startingTickers))

  const [availableTickers, setAvailableTickers] = useState<string[]>([])
  const [sectorMap, setSectorMap] = useState<Record<string, string>>({})
  const [sectorExpanded, setSectorExpanded] = useState(true)
  const [selectedSectors, setSelectedSectors] = useState<string[]>([])
  const [selectedTickers, setSelectedTickers] = useState<string[]>(startingTickers)
  const [startDate, setStartDate] = useState(startingStart ?? '')
  const [endDate, setEndDate] = useState(startingEnd ?? '')
  const [prompt, setPrompt] = useState(() => formatIndicatorPrompt(startingIndicators) || '')
  const [mode, setMode] = useState<'dsl' | 'ml'>('dsl')
  const [generatedStrategy, setGeneratedStrategy] = useState<GeneratedStrategy | null>(null)
  const [backtestResults, setBacktestResults] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    async function loadTickers() {
      try {
        const res = await fetch('/api/index', { cache: 'no-store' })
        if (!res.ok) return
        const body = await res.json()
        const tickers: string[] = Array.isArray(body?.tickers)
          ? body.tickers.map((ticker: any) => String(ticker).toUpperCase())
          : []
        setAvailableTickers((prev) => {
          const merged = new Set([...tickers, ...startingTickers])
          return Array.from(merged).sort()
        })
      } catch (error) {
        console.warn('Failed to load tickers', error)
      }
    }

    loadTickers()
  }, [startingTickers])

  useEffect(() => {
    async function loadSectors() {
      try {
        const res = await fetch('/sectors.json', { cache: 'force-cache' })
        if (!res.ok) return
        const payload = await res.json()
        if (!payload || typeof payload !== 'object') return
        const mapping: Record<string, string> = {}
        for (const [ticker, sector] of Object.entries(payload as Record<string, string>)) {
          if (!sector) continue
          mapping[ticker.toUpperCase()] = String(sector)
        }
        setSectorMap(mapping)
      } catch (error) {
        console.warn('No sector mapping available', error)
      }
    }

    loadSectors()
  }, [])

  const sectorGroups = useMemo(() => {
    const groups: Record<string, string[]> = {}
    for (const [ticker, sector] of Object.entries(sectorMap)) {
      if (!groups[sector]) {
        groups[sector] = []
      }
      groups[sector].push(ticker)
    }
    for (const sector of Object.keys(groups)) {
      groups[sector].sort()
    }
    return groups
  }, [sectorMap])

  const handleToggleTicker = (ticker: string) => {
    setSelectedTickers((prev) => {
      if (prev.includes(ticker)) {
        manualTickersRef.current.delete(ticker)
        return prev.filter((item) => item !== ticker)
      }
      manualTickersRef.current.add(ticker)
      return [...prev, ticker]
    })
  }

  const handleToggleSector = (sector: string) => {
    setSelectedSectors((prev) => {
      const exists = prev.includes(sector)
      const tickers = sectorGroups[sector] ?? []
      if (exists) {
        setSelectedTickers((current) =>
          current.filter((ticker) => {
            if (!tickers.includes(ticker)) return true
            return manualTickersRef.current.has(ticker)
          }),
        )
      } else {
        setSelectedTickers((current) => {
          const union = new Set(current)
          tickers.forEach((ticker) => union.add(ticker))
          return Array.from(union)
        })
      }
      return exists ? prev.filter((item) => item !== sector) : [...prev, sector]
    })
  }

  const indicatorChips = useMemo(() => {
    if (!startingIndicators.length) return []
    return startingIndicators.map((token) => {
      const match = token.match(/([A-Z]+)(\d+)?/)
      if (!match) return token
      const [, name, value] = match
      return value ? `${name}(${value})` : name
    })
  }, [startingIndicators])

  const examplePrompts = useMemo(
    () => ({
      dsl: [
        'Use SMA(50) and EMA(20) crossover to confirm trend direction.',
        'Look for RSI dips below 30 followed by a cross above 40 to signal entries.',
        'Combine MACD bullish crosses with price closing above the 20-day EMA.',
      ],
      ml: [
        'Train a classifier on the last 90 days of returns to predict next-day direction.',
        'Use gradient boosting on volatility and momentum features to identify breakouts.',
        'Build a random forest using SMA/EMA slopes to forecast short-term moves.',
      ],
    }),
    [],
  )

  const readyToGenerate = selectedTickers.length > 0 && startDate && endDate && prompt.trim().length > 10
  const readyToRun = generatedStrategy && readyToGenerate

  const handleGenerate = async () => {
    if (!readyToGenerate) {
      setError('Select tickers, dates, and provide a detailed prompt before generating a strategy.')
      return
    }
    setIsGenerating(true)
    setError(null)
    setGeneratedStrategy(null)
    setBacktestResults(null)

    try {
      const response = await fetch('/api/strategy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode }),
      })
      const body = await response.json()
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? 'Failed to generate strategy')
      }
      setGeneratedStrategy(body)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to generate strategy')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRunBacktest = async () => {
    if (!readyToRun || !generatedStrategy) {
      setError('Generate a strategy before running the backtest.')
      return
    }

    setIsRunning(true)
    setError(null)

    try {
      const payload: any = {
        tickers: selectedTickers,
        startDate,
        endDate,
        mode,
      }
      if (mode === 'dsl') {
        payload.dsl = generatedStrategy.dsl
      } else {
        payload.code = generatedStrategy.code
      }

      const response = await fetch('/api/strategy/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? 'Failed to run backtest')
      }
      setBacktestResults(body)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Backtest failed')
    } finally {
      setIsRunning(false)
    }
  }

  const sectorAvailable = Object.keys(sectorGroups).length > 0

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Strategy Lab</h1>
        <p className="mt-1 text-sm text-gray-400">
          Prefill selections from the Dashboard, describe your idea, and let AI build and backtest the rules.
        </p>
      </header>

      <section className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Layers className="h-4 w-4 text-blue-400" />
            {selectedTickers.length} tickers selected
          </div>
          <div className="flex gap-2 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-emerald-400" />
              Prefilled from dashboard when available
            </div>
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-sky-400" />
              Generate → Backtest flow
            </div>
          </div>
        </div>

        {indicatorChips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-blue-200">
            {indicatorChips.map((chip) => (
              <span key={chip} className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1">
                {chip}
              </span>
            ))}
          </div>
        )}

        {sectorAvailable && (
          <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950/70">
            <button
              type="button"
              onClick={() => setSectorExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-gray-300 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-purple-400" /> Filter by sector
              </span>
              <span>{sectorExpanded ? 'Hide' : 'Show'}</span>
            </button>
            {sectorExpanded && (
              <div className="border-t border-gray-800 p-3">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(sectorGroups).map(([sector, tickers]) => {
                    const active = selectedSectors.includes(sector)
                    return (
                      <button
                        key={sector}
                        type="button"
                        onClick={() => handleToggleSector(sector)}
                        className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                          active
                            ? 'border-purple-500 bg-purple-500/10 text-purple-100'
                            : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                        }`}
                      >
                        {sector} ({tickers.length})
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[280px,1fr]">
          <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Select tickers</h3>
            <div className="mt-2 max-h-72 overflow-y-auto rounded border border-gray-800">
              <ul className="divide-y divide-gray-800 text-sm">
                {availableTickers.map((ticker) => {
                  const active = selectedTickers.includes(ticker)
                  return (
                    <li key={ticker}>
                      <button
                        type="button"
                        onClick={() => handleToggleTicker(ticker)}
                        className={`flex w-full items-center justify-between px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                          active
                            ? 'bg-emerald-500/15 text-emerald-100'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        <span className="font-medium">{ticker}</span>
                        <span className="text-[10px] uppercase text-gray-500">
                          {active ? 'remove' : 'add'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            {selectedTickers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedTickers.map((ticker) => (
                  <button
                    key={ticker}
                    type="button"
                    onClick={() => handleToggleTicker(ticker)}
                    className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100"
                  >
                    {ticker}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-gray-400" htmlFor="lab-start">
                  Start date
                </label>
                <input
                  id="lab-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400" htmlFor="lab-end">
                  End date
                </label>
                <input
                  id="lab-end"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400" htmlFor="strategy-mode">
                Strategy type
              </label>
              <div className="mt-2 flex gap-2">
                {(['dsl', 'ml'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      mode === value
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-100'
                        : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {value.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400" htmlFor="strategy-prompt">
                Strategy prompt
              </label>
              <textarea
                id="strategy-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe your strategy idea…"
                rows={5}
                className="mt-2 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                {examplePrompts[mode].map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-emerald-500 hover:text-emerald-200"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-900/50"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate strategy
              </button>
              <button
                type="button"
                onClick={handleRunBacktest}
                disabled={!readyToRun || isRunning}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400 hover:text-white disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Run backtest
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-xs text-rose-200">
                {error}
              </div>
            )}
          </div>
        </div>
      </section>

      <BacktestResults results={backtestResults} generatedStrategy={generatedStrategy ?? undefined} />
    </div>
  )
}
