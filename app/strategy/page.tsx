'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceDot
} from 'recharts'
import { Download, Wand2, Beaker, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type Mkt = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: number
}
type Trade = { entryIdx: number; exitIdx: number; entryPrice: number; exitPrice: number; pnl: number }
type Stats = { totalReturnPct: number; trades: number; winRatePct: number; avgTradePct: number }

type StrategyDsl = Record<string, any> | null

type MetaUsed = { start: string; end: string } | null

export default function StrategyLabPage() {
  const [prompt, setPrompt] = useState('MACD crossover enter; exit when RSI > 70; fast 12 slow 26 signal 9')
  const [ticker, setTicker] = useState('AAPL')
  const [startDate, setStartDate] = useState('2024-01-02')
  const [endDate, setEndDate] = useState('2024-03-28')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [bars, setBars] = useState<Mkt[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [equity, setEquity] = useState<number[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [dsl, setDsl] = useState<StrategyDsl>(null)
  const [metaUsed, setMetaUsed] = useState<MetaUsed>(null)

  const onRun = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/strategy/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, ticker, startDate, endDate })
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Strategy run failed')

      setDsl(json.dsl || null)
      setTrades(json.result?.trades ?? [])
      setEquity(json.result?.equity ?? [])
      setStats(json.result?.stats ?? null)
      setMetaUsed(json.meta?.used ?? null)

      const q = new URLSearchParams({ ticker, startDate, endDate })
      const lr = await fetch(`/api/local-data?${q.toString()}`, { cache: 'no-store' })
      const lj = await lr.json()
      setBars(Array.isArray(lj.data) ? lj.data : [])
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  const markers = useMemo(() => {
    const dates = bars.map(b => b.date)
    return trades.flatMap((t) => {
      const entryDate = dates[t.entryIdx] ?? null
      const exitDate = dates[t.exitIdx] ?? null
      return [
        entryDate ? { type: 'buy' as const, date: entryDate } : null,
        exitDate ? { type: 'sell' as const, date: exitDate } : null,
      ].filter(Boolean) as { type: 'buy' | 'sell'; date: string }[]
    })
  }, [bars, trades])

  const exportTradesCsv = () => {
    if (!trades.length) return
    const header = 'entryIdx,exitIdx,entryPrice,exitPrice,pnlPct\n'
    const rows = trades.map(t => [t.entryIdx, t.exitIdx, t.entryPrice, t.exitPrice, (t.pnl * 100).toFixed(4)].join(',')).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ticker}_${startDate}_${endDate}_trades.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-300 hover:text-white">
              <ArrowLeft className="w-5 h-5 mr-2 inline" /> Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-white">Strategy Lab</h1>
            <span className="inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
              Local Parquet
            </span>
          </div>
          <div className="flex gap-3">
            <Link href="/backtester" className="text-gray-300 hover:text-white">Backtester</Link>
            <Link href="/data" className="text-gray-300 hover:text-white">Data Warehouse</Link>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">Strategy prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="Describe your strategy (MACD/RSI/SMA/EMA rules)…"
              />
              <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                <Wand2 className="w-4 h-4" /> LLM → JSON DSL → local parquet backtest
              </div>
            </div>
            <div className="grid gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Ticker</label>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  placeholder="AAPL"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Start</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">End</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white" />
                </div>
              </div>
              <button
                onClick={onRun}
                disabled={loading}
                className="w-full flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : <Beaker className="w-4 h-4 mr-2" />}
                {loading ? 'Running…' : 'Run Strategy'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className="text-center bg-white/10 border border-white/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-green-400">{stats ? `${stats.totalReturnPct.toFixed(2)}%` : '--'}</div>
            <div className="text-sm text-gray-300">Total Return</div>
          </div>
          <div className="text-center bg-white/10 border border-white/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-400">{stats ? stats.trades : '--'}</div>
            <div className="text-sm text-gray-300">Trades</div>
          </div>
          <div className="text-center bg-white/10 border border-white/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-yellow-400">{stats ? `${stats.winRatePct.toFixed(1)}%` : '--'}</div>
            <div className="text-sm text-gray-300">Win Rate</div>
          </div>
          <div className="text-center bg-white/10 border border-white/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-400">{stats ? `${stats.avgTradePct.toFixed(2)}%` : '--'}</div>
            <div className="text-sm text-gray-300">Avg Trade</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Price with trade markers</h2>
              <div className="text-xs text-gray-300">{metaUsed ? `${metaUsed.start} → ${metaUsed.end}` : ''}</div>
            </div>
            <div className="h-80">
              {bars.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bars} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="price" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="price" type="monotone" dataKey="close" name="Close" dot={false} strokeWidth={2} />
                    {markers.map((m, i) => (
                      <ReferenceDot key={i} x={m.date} y={(() => {
                        const b = bars.find(bb => bb.date === m.date)
                        return b?.close ?? 0
                      })()}
                      r={4}
                      label={m.type === 'buy' ? '▲' : '▼'}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">No data</div>
              )}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Equity Curve</h2>
            </div>
            <div className="h-80">
              {equity.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equity.map((v, i) => ({ i, equity: v }))} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="i" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="equity" name="Equity (index)" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">No equity</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Trade Log</h2>
              <button
                onClick={exportTradesCsv}
                disabled={!trades.length}
                className="flex items-center px-3 py-2 border border-gray-400 text-gray-300 hover:text-white hover:border-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </button>
            </div>
            <div className="overflow-auto max-h-96 text-sm">
              {trades.length ? (
                <table className="w-full text-left">
                  <thead className="text-gray-300">
                    <tr>
                      <th className="py-1 pr-3">#</th>
                      <th className="py-1 pr-3">Entry</th>
                      <th className="py-1 pr-3">Exit</th>
                      <th className="py-1 pr-3">Entry Px</th>
                      <th className="py-1 pr-3">Exit Px</th>
                      <th className="py-1 pr-3">PnL %</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-100">
                    {trades.map((t, idx) => {
                      const eDate = bars[t.entryIdx]?.date ?? '-'
                      const xDate = bars[t.exitIdx]?.date ?? '-'
                      return (
                        <tr key={idx} className="border-t border-white/10">
                          <td className="py-1 pr-3">{idx + 1}</td>
                          <td className="py-1 pr-3">{eDate}</td>
                          <td className="py-1 pr-3">{xDate}</td>
                          <td className="py-1 pr-3">{t.entryPrice.toFixed(2)}</td>
                          <td className="py-1 pr-3">{t.exitPrice.toFixed(2)}</td>
                          <td className="py-1 pr-3">{(t.pnl * 100).toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-gray-400">No trades.</div>
              )}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-2">Strategy (DSL)</h2>
            <pre className="text-xs text-emerald-200/90 bg-black/30 rounded-lg p-3 overflow-auto max-h-96">
{dsl ? JSON.stringify(dsl, null, 2) : 'Run a strategy to see the generated JSON DSL…'}
            </pre>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-500/20 border border-red-500/50 rounded-xl p-4">
            <div className="text-red-200">Error: {error}</div>
          </div>
        )}
      </div>
    </div>
  )
}
