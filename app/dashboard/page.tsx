'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Beaker, LineChart as LineChartIcon, Database } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type Spark = { ticker: string; bars: { date: string; close: number }[]; last?: { o:number; h:number; l:number; c:number } }
type Meta = { generatedAt:string; summary:{ tickers:number; records:number; jsonSizeHuman:string; parquetSizeHuman:string; reductionPercent:number } }

export default function DashboardPage() {
  const [tickers, setTickers] = useState('AAPL,MSFT,GOOGL,AMZN')
  const [start, setStart] = useState('2024-01-02')
  const [end, setEnd] = useState('2024-03-28')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Spark[]>([])
  const [meta, setMeta] = useState<Meta|null>(null)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/local-data?mode=metadata', { cache: 'no-store' })
        const j = await r.json()
        if (j?.success && j?.metadata) setMeta(j.metadata)
      } catch {}
    })()
  }, [])

  const fetchBatch = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/local-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tickers: tickers.split(',').map(t=>t.trim().toUpperCase()).filter(Boolean), startDate: start, endDate: end })
      })
      const j = await r.json()
      setRows(Array.isArray(j?.data) ? j.data : [])
    } finally {
      setLoading(false)
    }
  }

  const cards = useMemo(() =>
    rows.map(row => {
      const last = row.bars.at(-1)
      return {
        ticker: row.ticker,
        lastClose: last?.close ?? null,
        ohlc: last ? { o: last.close, h: last.close, l: last.close, c: last.close } : row.last
      }
    }), [rows])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">AI Backtester — Dashboard</h1>
          <div className="flex gap-3">
            <Link href="/backtester" className="px-3 py-2 border border-white/20 rounded-lg text-white/90 hover:text-white hover:border-white">Backtester</Link>
            <Link href="/strategy" className="px-3 py-2 border border-emerald-400/40 rounded-lg text-emerald-200 hover:text-emerald-100">Strategy Lab</Link>
            <Link href="/data" className="px-3 py-2 border border-white/20 rounded-lg text-white/90 hover:text-white hover:border-white">Data Warehouse</Link>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 mb-6">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Tickers (comma)</label>
              <input value={tickers} onChange={e=>setTickers(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Start</label>
              <input type="date" value={start} onChange={e=>setStart(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">End</label>
              <input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white" />
            </div>
          </div>
          <div className="mt-3">
            <button onClick={fetchBatch} disabled={loading} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">
              {loading ? 'Loading…' : 'Load Watchlist'}
            </button>
          </div>
          {meta && (
            <div className="mt-3 text-xs text-emerald-200/80">
              {meta.summary.tickers} tickers • {meta.summary.records} records • Storage savings {meta.summary.reductionPercent}%
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {rows.map(({ ticker, bars }) => (
            <div key={ticker} className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <LineChartIcon className="w-4 h-4 text-white/80" />
                  <div className="text-white font-semibold">{ticker}</div>
                </div>
                <div className="text-gray-300 text-xs">{bars[0]?.date ?? ''} → {bars.at(-1)?.date ?? ''}</div>
              </div>
              <div className="h-40">
                {bars.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bars} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <Tooltip />
                      <Line type="monotone" dataKey="close" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">No data</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Shortcuts */}
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <Link href="/backtester" className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-xl p-4 text-white hover:border-white/40">
            <LineChartIcon className="w-5 h-5" /> Backtester
          </Link>
          <Link href="/strategy" className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-xl p-4 text-emerald-200 hover:border-emerald-300/40">
            <Beaker className="w-5 h-5" /> Strategy Lab
          </Link>
          <Link href="/data" className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-xl p-4 text-white hover:border-white/40">
            <Database className="w-5 h-5" /> Data Warehouse
          </Link>
        </div>
      </div>
    </div>
  )
}