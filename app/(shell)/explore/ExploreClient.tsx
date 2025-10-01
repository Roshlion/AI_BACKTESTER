'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'

import type { Row } from '@/types/row'
import { PriceLineChart } from '@/components/ui/chart'

interface ExploreClientProps {
  initialSymbol: string
}

export default function ExploreClient({ initialSymbol }: ExploreClientProps) {
  const router = useRouter()
  const [allTickers, setAllTickers] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [symbol, setSymbol] = useState(initialSymbol)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadManifest() {
      try {
        const res = await fetch('/api/index', { cache: 'no-store' })
        if (!res.ok) return
        const body = await res.json()
        const tickers = Array.isArray(body?.tickers)
          ? body.tickers.map((ticker: any) => String(ticker).toUpperCase())
          : []
        setAllTickers(tickers.sort())
      } catch (error) {
        console.warn('Manifest load failed', error)
      }
    }

    loadManifest()
  }, [])

  useEffect(() => {
    setSymbol(initialSymbol)
  }, [initialSymbol])

  useEffect(() => {
    if (!symbol) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/local-data?ticker=${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok || !body?.ok) {
          throw new Error(body?.error ?? 'Failed to load data')
        }
        const list: Row[] = Array.isArray(body.rows)
          ? body.rows.map((row: Row) => ({ ...row, date: row.date.slice(0, 10) }))
          : []
        if (!cancelled) {
          setRows(list.sort((a, b) => a.date.localeCompare(b.date)))
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : 'Failed to load ticker data')
          setRows([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [symbol])

  const filteredTickers = useMemo(() => {
    if (!searchTerm.trim()) return allTickers
    const term = searchTerm.trim().toUpperCase()
    return allTickers.filter((ticker) => ticker.includes(term))
  }, [allTickers, searchTerm])

  const latest = rows.at(-1)
  const high = rows.reduce((acc, row) => Math.max(acc, row.high), Number.NEGATIVE_INFINITY)
  const low = rows.reduce((acc, row) => Math.min(acc, row.low), Number.POSITIVE_INFINITY)

  const handleSelectTicker = (ticker: string) => {
    setSymbol(ticker)
    router.push(`/explore?symbol=${ticker}`, { scroll: false })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
      <aside className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
        <h2 className="text-sm font-semibold text-gray-200">Tickers</h2>
        <div className="mt-3 flex items-center gap-2 rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-300">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none"
          />
        </div>
        <div className="mt-3 max-h-[32rem] overflow-y-auto rounded-md border border-gray-800">
          {filteredTickers.length === 0 ? (
            <div className="p-3 text-center text-xs text-gray-500">No tickers found</div>
          ) : (
            <ul className="divide-y divide-gray-800 text-sm">
              {filteredTickers.map((ticker) => {
                const active = ticker === symbol
                return (
                  <li key={ticker}>
                    <button
                      type="button"
                      onClick={() => handleSelectTicker(ticker)}
                      className={`flex w-full items-center justify-between px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        active
                          ? 'bg-blue-500/15 text-blue-100'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <span className="font-medium">{ticker}</span>
                      <span className="text-[10px] uppercase text-gray-500">
                        {active ? 'viewing' : 'open'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
        {!symbol && (
          <div className="flex h-full min-h-[20rem] items-center justify-center text-sm text-gray-400">
            Select a ticker to load its dataset.
          </div>
        )}

        {symbol && (
          <div className="space-y-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">{symbol}</h2>
                <p className="text-xs text-gray-500">Historical daily OHLC data from local warehouse</p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/dashboard', { scroll: false })}
                className="rounded-md border border-gray-700 px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:border-blue-500 hover:text-white"
              >
                Open Dashboard
              </button>
            </header>

            {loading && (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-800">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
            )}

            {!loading && !error && rows.length > 0 && (
              <div className="space-y-4">
                <PriceLineChart data={rows} title={`${symbol} price history`} />
                {latest && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                      <div className="text-xs text-gray-500">Last close</div>
                      <div className="text-lg font-semibold text-white">${latest.close.toFixed(2)}</div>
                      <div className="text-xs text-gray-500">{latest.date}</div>
                    </div>
                    <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                      <div className="text-xs text-gray-500">Range</div>
                      <div className="text-lg font-semibold text-white">
                        ${Number.isFinite(low) ? low.toFixed(2) : '—'} – ${Number.isFinite(high) ? high.toFixed(2) : '—'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                      <div className="text-xs text-gray-500">Records</div>
                      <div className="text-lg font-semibold text-white">{rows.length.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                      <div className="text-xs text-gray-500">Volume (latest)</div>
                      <div className="text-lg font-semibold text-white">
                        {latest.volume?.toLocaleString() ?? '—'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!loading && !error && symbol && rows.length === 0 && (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-800 text-sm text-gray-400">
                No records available for {symbol}.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
