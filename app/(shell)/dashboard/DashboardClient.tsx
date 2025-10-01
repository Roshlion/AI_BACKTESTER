'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Loader2, RefreshCw, Target } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import type { Row } from '@/types/row'
import type { CombinedPoint, IndicatorPoint } from '@/components/Chart/types'
import { ChartLegend } from '@/components/Chart/ChartLegend'
import { MultiSeriesChart } from '@/components/Chart/MultiSeriesChart'
import { RsiPanel } from '@/components/Chart/RsiPanel'
import { MacdPanel } from '@/components/Chart/MacdPanel'
import { SmallMultiples, type SmallMultipleSeries } from '@/components/Chart/SmallMultiples'
import { getSeriesColor } from '@/lib/colors'
import { downsample } from '@/lib/downsample'
import { ema, macd, rsi, sma } from '@/lib/indicators'
import { useStrategyStore } from '@/app/store/strategyStore'
import {
  IndicatorToggleState,
  buildIndicatorTokens,
  buildExploreHref,
  clampPeriod,
  computeMinMaxDates,
  formatIndicatorPrompt,
  filterTickers,
  isolateTickerSelection,
  toggleTickerSelection,
} from './utils'

const SCALE_OPTIONS = [
  { value: 'price', label: 'Price' },
  { value: 'indexed', label: 'Indexed %' },
  { value: 'small', label: 'Small multiples' },
] as const

type ScaleMode = (typeof SCALE_OPTIONS)[number]['value']

interface ManifestResponse {
  tickers: string[]
  asOf?: string | null
}

const INITIAL_INDICATORS: IndicatorToggleState = {
  sma: { enabled: true, period: 50 },
  ema: { enabled: false, period: 20 },
  rsi: false,
  macd: false,
}

export default function DashboardClient() {
  const router = useRouter()
  const { setStrategy } = useStrategyStore()

  const [allTickers, setAllTickers] = useState<string[]>([])
  const [manifestAsOf, setManifestAsOf] = useState<string | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTickers, setSelectedTickers] = useState<string[]>([])
  const [seriesMap, setSeriesMap] = useState<Record<string, Row[]>>({})
  const [seriesErrors, setSeriesErrors] = useState<Record<string, string>>({})
  const [loadingTickers, setLoadingTickers] = useState<string[]>([])
  const [indicators, setIndicators] = useState<IndicatorToggleState>(INITIAL_INDICATORS)
  const [editingIndicator, setEditingIndicator] = useState<'sma' | 'ema' | null>(null)
  const skipToggleRef = useRef(false)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('price')
  const [showAllMultiples, setShowAllMultiples] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dateDirty, setDateDirty] = useState(false)
  const [hiddenTickers, setHiddenTickers] = useState<Set<string>>(new Set())
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null)

  useEffect(() => {
    async function loadManifest() {
      try {
        const res = await fetch('/api/index', { cache: 'no-store' })
        if (!res.ok) {
          throw new Error(`Manifest request failed (${res.status})`)
        }
        const body = (await res.json()) as ManifestResponse
        const tickers = Array.isArray(body.tickers)
          ? body.tickers.map((ticker) => String(ticker).toUpperCase())
          : []
        setAllTickers(tickers.sort())
        setManifestAsOf(body.asOf ?? null)
      } catch (error) {
        setManifestError(error instanceof Error ? error.message : 'Unable to load manifest')
      }
    }

    loadManifest()
  }, [])

  const fetchTickerData = useCallback(async (ticker: string): Promise<Row[]> => {
    const response = await fetch(`/api/local-data?ticker=${encodeURIComponent(ticker)}`)
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload?.error ?? `Failed to fetch ${ticker}`)
    }
    const rows: Row[] = Array.isArray(payload.rows) ? payload.rows : []
    return rows
      .map((row) => ({
        ...row,
        date: row.date.slice(0, 10),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [])

  useEffect(() => {
    if (!selectedTickers.length) {
      return
    }

    const missing = selectedTickers.filter(
      (ticker) => !seriesMap[ticker] && !loadingTickers.includes(ticker),
    )
    if (!missing.length) {
      return
    }

    let cancelled = false
    setLoadingTickers((prev) => Array.from(new Set([...prev, ...missing])))

    Promise.all(
      missing.map((ticker) =>
        fetchTickerData(ticker)
          .then((rows) => ({ ticker, rows }))
          .catch((error: unknown) => ({ ticker, error })),
      ),
    ).then((results) => {
      if (cancelled) return

      setSeriesMap((prev) => {
        const next = { ...prev }
        for (const result of results) {
          if ('rows' in result) {
            next[result.ticker] = result.rows
          }
        }
        return next
      })

      setSeriesErrors((prev) => {
        const next = { ...prev }
        for (const result of results) {
          if ('error' in result) {
            next[result.ticker] =
              result.error instanceof Error ? result.error.message : String(result.error)
          } else {
            delete next[result.ticker]
          }
        }
        return next
      })

      setLoadingTickers((prev) => prev.filter((ticker) => !missing.includes(ticker)))
    })

    return () => {
      cancelled = true
    }
  }, [selectedTickers, seriesMap, loadingTickers, fetchTickerData])

  useEffect(() => {
    if (!selectedTickers.length) {
      setStartDate('')
      setEndDate('')
      setDateDirty(false)
      return
    }
    if (dateDirty) return

    const { start, end } = computeMinMaxDates(seriesMap, selectedTickers)
    setStartDate(start ?? '')
    setEndDate(end ?? '')
  }, [selectedTickers, seriesMap, dateDirty])

  useEffect(() => {
    setHiddenTickers((prev) => {
      const next = new Set(prev)
      for (const ticker of Array.from(next)) {
        if (!selectedTickers.includes(ticker)) {
          next.delete(ticker)
        }
      }
      return next
    })
  }, [selectedTickers])

  const filteredTickers = useMemo(
    () => filterTickers(allTickers, searchTerm),
    [allTickers, searchTerm],
  )

  const colors = useMemo(() => {
    const map: Record<string, string> = {}
    selectedTickers.forEach((ticker, index) => {
      map[ticker] = getSeriesColor(ticker, index)
    })
    return map
  }, [selectedTickers])

  const chartState = useMemo(() => {
    const mainMap = new Map<string, CombinedPoint>()
    const rsiMap = new Map<string, IndicatorPoint>()
    const macdMap = new Map<string, IndicatorPoint>()
    const multiples: SmallMultipleSeries[] = []
    const missing: string[] = []
    const snapshots: Array<{ ticker: string; close: number; date: string }> = []

    for (const ticker of selectedTickers) {
      const rows = seriesMap[ticker]
      if (!rows?.length) {
        missing.push(ticker)
        continue
      }

      const filtered = rows.filter((row) => {
        if (startDate && row.date < startDate) return false
        if (endDate && row.date > endDate) return false
        return true
      })

      if (!filtered.length) {
        missing.push(ticker)
        continue
      }

      const closes = filtered.map((row) => row.close)
      const baseClose = closes.find((value) => Number.isFinite(value)) ?? closes[0]
      const scaleValue = (value: number | null | undefined) => {
        if (value == null) return null
        if (scaleMode === 'indexed') {
          return (value / baseClose) * 100
        }
        return value
      }

      const smaSeries = indicators.sma.enabled ? sma(closes, indicators.sma.period) : []
      const emaSeries = indicators.ema.enabled ? ema(closes, indicators.ema.period) : []
      const rsiSeries = indicators.rsi ? rsi(closes, 14) : []
      const macdSeries = indicators.macd ? macd(closes) : undefined

      filtered.forEach((row, index) => {
        const point = (mainMap.get(row.date) ?? { date: row.date }) as CombinedPoint
        point[ticker] = scaleValue(row.close)
        if (indicators.sma.enabled) {
          point[`${ticker}_SMA`] = scaleValue(smaSeries[index] ?? null)
        }
        if (indicators.ema.enabled) {
          point[`${ticker}_EMA`] = scaleValue(emaSeries[index] ?? null)
        }
        mainMap.set(row.date, point)

        if (indicators.rsi) {
          const rsiPoint = (rsiMap.get(row.date) ?? { date: row.date }) as IndicatorPoint
          rsiPoint[`${ticker}_RSI`] = rsiSeries[index] ?? null
          rsiMap.set(row.date, rsiPoint)
        }

        if (indicators.macd && macdSeries) {
          const macdPoint = (macdMap.get(row.date) ?? { date: row.date }) as IndicatorPoint
          macdPoint[`${ticker}_MACD`] = macdSeries.macd[index] ?? null
          macdPoint[`${ticker}_MACD_SIGNAL`] = macdSeries.signal[index] ?? null
          macdMap.set(row.date, macdPoint)
        }
      })

      snapshots.push({ ticker, close: filtered.at(-1)!.close, date: filtered.at(-1)!.date })

      const miniSeries = filtered.map((row) => ({ date: row.date, value: row.close }))
      multiples.push({ ticker, data: downsample(miniSeries, 1200) })
    }

    const sortedMain = downsample(
      Array.from(mainMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      scaleMode === 'small' ? 2000 : 5000,
    )
    const sortedRsi = indicators.rsi
      ? downsample(Array.from(rsiMap.values()).sort((a, b) => a.date.localeCompare(b.date)), 2000)
      : []
    const sortedMacd = indicators.macd
      ? downsample(Array.from(macdMap.values()).sort((a, b) => a.date.localeCompare(b.date)), 2000)
      : []

    return {
      mainData: sortedMain,
      rsiData: sortedRsi,
      macdData: sortedMacd,
      smallMultiples: multiples,
      emptyTickers: missing,
      snapshots,
    }
  }, [selectedTickers, seriesMap, startDate, endDate, indicators, scaleMode])

  const handleToggleTicker = (ticker: string) => {
    setSelectedTickers((prev) => toggleTickerSelection(prev, ticker))
  }

  const handleIsolateTicker = (ticker: string) => {
    setSelectedTickers(isolateTickerSelection(ticker))
    setHiddenTickers(new Set())
    setShowAllMultiples(false)
  }

  const handleCreateStrategy = () => {
    if (!selectedTickers.length) return
    const tokens = buildIndicatorTokens(indicators)
    setStrategy({
      tickers: selectedTickers,
      indicators: tokens,
      start: startDate || undefined,
      end: endDate || undefined,
    })
    router.push('/strategy')
  }

  const handleDateChange = (key: 'start' | 'end', value: string) => {
    setDateDirty(true)
    if (key === 'start') {
      setStartDate(value)
    } else {
      setEndDate(value)
    }
  }

  const handleResetRange = () => {
    const { start, end } = computeMinMaxDates(seriesMap, selectedTickers)
    setStartDate(start ?? '')
    setEndDate(end ?? '')
    setDateDirty(false)
  }

  const indicatorPrompt = useMemo(() => {
    const tokens = buildIndicatorTokens(indicators)
    return formatIndicatorPrompt(tokens)
  }, [indicators])

  const filteredList = filteredTickers.length ? filteredTickers : []

  const legendTickers = selectedTickers.filter((ticker) => !chartState.emptyTickers.includes(ticker))

  const isLoadingAny = loadingTickers.length > 0

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-400">
          Compare tickers, inspect indicators, and send selections directly to the Strategy Lab.
        </p>
        {manifestAsOf && (
          <p className="mt-1 text-xs text-gray-500">Manifest as of {manifestAsOf}</p>
        )}
        {manifestError && (
          <p className="mt-2 text-sm text-rose-400">{manifestError}</p>
        )}
      </header>

      <section className="grid gap-6 lg:grid-cols-[280px,1fr]">
        <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200">Tickers</h2>
            <span className="text-xs text-gray-500">{selectedTickers.length} selected</span>
          </div>
          <div className="mt-3">
            <label className="sr-only" htmlFor="ticker-search">
              Search tickers
            </label>
            <input
              id="ticker-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search tickers…"
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
              type="text"
            />
          </div>
          <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-gray-800 bg-gray-950">
            {filteredList.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">No tickers found</div>
            ) : (
              <ul className="divide-y divide-gray-800">
                {filteredList.map((ticker) => {
                  const selected = selectedTickers.includes(ticker)
                  return (
                    <li key={ticker}>
                      <button
                        type="button"
                        onClick={() => handleToggleTicker(ticker)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            handleToggleTicker(ticker)
                          }
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          selected
                            ? 'bg-blue-600/20 text-white'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        <span className="font-medium">{ticker}</span>
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleIsolateTicker(ticker)
                            }}
                            className="rounded p-1 text-xs text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label={`Isolate ${ticker}`}
                          >
                            <Target className="h-4 w-4" />
                          </button>
                          <Link
                            href={buildExploreHref(ticker)}
                            onClick={(event) => event.stopPropagation()}
                            className="rounded p-1 text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label={`Open ${ticker} in Data Warehouse`}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {selectedTickers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedTickers.map((ticker) => (
                <button
                  key={ticker}
                  type="button"
                  onClick={() => handleToggleTicker(ticker)}
                  className="rounded-full border border-blue-500/60 px-3 py-1 text-xs font-medium text-blue-200 hover:border-blue-400 hover:text-white"
                >
                  {ticker}
                </button>
              ))}
            </div>
          )}

          {isLoadingAny && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading {loadingTickers.join(', ')}
            </div>
          )}

          {Object.keys(seriesErrors).length > 0 && (
            <div className="mt-3 space-y-1 text-xs text-rose-400">
              {Object.entries(seriesErrors).map(([ticker, message]) => (
                <div key={ticker}>
                  {ticker}: {message}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-200">Indicators</h2>
                {indicatorPrompt && (
                  <p className="mt-1 text-xs text-gray-500">{indicatorPrompt}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {SCALE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScaleMode(option.value)}
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      scaleMode === option.value
                        ? 'border-blue-500 bg-blue-500/10 text-blue-100'
                        : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(['sma', 'ema'] as const).map((key) => {
                const enabled = indicators[key].enabled
                return (
                  <div key={key} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (skipToggleRef.current) {
                          skipToggleRef.current = false
                          return
                        }
                        setIndicators((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], enabled: !prev[key].enabled },
                        }))
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        skipToggleRef.current = true
                        setEditingIndicator(key)
                      }}
                      className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        enabled
                          ? 'border-blue-500 bg-blue-500/10 text-blue-100'
                          : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {key.toUpperCase()} ({indicators[key].period})
                    </button>
                    {editingIndicator === key && (
                      <input
                        type="number"
                        min={1}
                        defaultValue={indicators[key].period}
                        onBlur={(event) => {
                          const value = clampPeriod(Number(event.target.value), indicators[key].period)
                          setIndicators((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], period: value, enabled: true },
                          }))
                          setEditingIndicator(null)
                          skipToggleRef.current = false
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            const value = clampPeriod(Number((event.target as HTMLInputElement).value), indicators[key].period)
                            setIndicators((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], period: value, enabled: true },
                            }))
                            setEditingIndicator(null)
                            skipToggleRef.current = false
                          } else if (event.key === 'Escape') {
                            setEditingIndicator(null)
                            skipToggleRef.current = false
                          }
                        }}
                        autoFocus
                        className="absolute left-0 right-0 top-full mt-1 w-24 rounded-md border border-blue-500 bg-gray-950 px-2 py-1 text-xs text-gray-100 focus:outline-none"
                      />
                    )}
                  </div>
                )
              })}

              <button
                type="button"
                onClick={() =>
                  setIndicators((prev) => ({
                    ...prev,
                    rsi: !prev.rsi,
                  }))
                }
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  indicators.rsi
                    ? 'border-blue-500 bg-blue-500/10 text-blue-100'
                    : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                }`}
              >
                RSI
              </button>

              <button
                type="button"
                onClick={() =>
                  setIndicators((prev) => ({
                    ...prev,
                    macd: !prev.macd,
                  }))
                }
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  indicators.macd
                    ? 'border-blue-500 bg-blue-500/10 text-blue-100'
                    : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                }`}
              >
                MACD
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs text-gray-400" htmlFor="start-date">
                  Start
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => handleDateChange('start', event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400" htmlFor="end-date">
                  End
                </label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(event) => handleDateChange('end', event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  onClick={handleResetRange}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <RefreshCw className="h-3 w-3" /> Reset range
                </button>
              </div>
            </div>
          </div>

          {scaleMode !== 'small' ? (
            <MultiSeriesChart
              data={chartState.mainData}
              tickers={legendTickers}
              colors={colors}
              indicatorState={indicators}
              hiddenTickers={hiddenTickers}
              hoveredTicker={hoveredTicker}
              scaleMode={scaleMode}
            />
          ) : (
            <SmallMultiples
              series={chartState.smallMultiples}
              colors={colors}
              showAll={showAllMultiples}
              onToggleShowAll={() => setShowAllMultiples((prev) => !prev)}
            />
          )}

          {legendTickers.length > 0 && scaleMode !== 'small' && (
            <ChartLegend
              tickers={legendTickers}
              colors={colors}
              hiddenTickers={hiddenTickers}
              hoveredTicker={hoveredTicker}
              onToggle={(ticker) =>
                setHiddenTickers((prev) => {
                  const next = new Set(prev)
                  if (next.has(ticker)) {
                    next.delete(ticker)
                  } else {
                    next.add(ticker)
                  }
                  return next
                })
              }
              onHover={setHoveredTicker}
            />
          )}

          {indicators.rsi && (
            <RsiPanel
              data={chartState.rsiData}
              tickers={legendTickers}
              colors={colors}
              hiddenTickers={hiddenTickers}
              hoveredTicker={hoveredTicker}
            />
          )}

          {indicators.macd && (
            <MacdPanel
              data={chartState.macdData}
              tickers={legendTickers}
              colors={colors}
              hiddenTickers={hiddenTickers}
              hoveredTicker={hoveredTicker}
            />
          )}

          {chartState.emptyTickers.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              No data in range for: {chartState.emptyTickers.join(', ')}
            </div>
          )}

          {chartState.snapshots.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {chartState.snapshots.map((snapshot) => (
                <div
                  key={snapshot.ticker}
                  className="rounded-lg border border-gray-800 bg-gray-950/70 p-3"
                >
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{snapshot.date}</span>
                    <span className="font-medium text-gray-200">{snapshot.ticker}</span>
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    ${snapshot.close.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/70 p-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Strategy Lab hand-off</h3>
              <p className="text-xs text-gray-500">
                Prefills tickers, indicators, and date range in the Strategy Lab.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreateStrategy}
              disabled={!selectedTickers.length}
              className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-gray-600"
              aria-label="Create a strategy with selected tickers"
            >
              Create a strategy with this
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
