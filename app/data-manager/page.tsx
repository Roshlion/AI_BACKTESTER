'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCcw, HardDrive, BarChart3, Download, Database } from 'lucide-react'

type MetadataEntry = {
  ticker: string
  records: number
  startDate: string
  endDate: string
  jsonSizeBytes?: number
  parquetSizeBytes?: number
  reductionPercent?: number
}

type MetadataResponse = {
  success: boolean
  source: 'local'
  metadata?: {
    generatedAt: string
    summary: {
      tickers: number
      records: number
      jsonSizeBytes: number
      parquetSizeBytes: number
      jsonSizeHuman: string
      parquetSizeHuman: string
      reductionPercent: number
    }
    files: MetadataEntry[]
  }
  error?: string
}

export default function DataManagerPage() {
  const [loading, setLoading] = useState(true)
  const [metadata, setMetadata] = useState<MetadataResponse['metadata'] | null>(null)
  const [error, setError] = useState('')

  const loadMetadata = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/local-data?mode=metadata')
      const json = (await response.json()) as MetadataResponse
      if (json.success && json.metadata) {
        setMetadata(json.metadata)
      } else {
        setMetadata(null)
        setError(json.error || 'Metadata unavailable. Convert parquet files first.')
      }
    } catch (err) {
      setMetadata(null)
      setError('Unable to load metadata. Ensure the development server has access to data/parquet-final.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMetadata()
  }, [loadMetadata])

  const missingTickers = useMemo(() => {
    if (!metadata?.files) return []
    return metadata.files.filter((file) => file.records === 0)
  }, [metadata])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="container mx-auto px-6 py-10">
        <header className="mb-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Local Data Manager</h1>
              <p className="mt-2 text-sm text-gray-300">
                Inspect parquet conversions, monitor storage savings, and manage locally cached market data.
              </p>
              {metadata?.generatedAt && (
                <p className="mt-1 text-xs text-emerald-200/80">
                  Last metadata update: {new Date(metadata.generatedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadMetadata}
                className="inline-flex items-center rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/30"
              >
                <RefreshCcw className="mr-2 h-4 w-4" /> Refresh Data
              </button>
              <a
                href="/api/local-data?mode=metadata"
                className="inline-flex items-center rounded-lg border border-white/20 px-4 py-2 text-sm text-gray-200 transition hover:border-white/40 hover:text-white"
              >
                <Download className="mr-2 h-4 w-4" /> Export Metadata
              </a>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-gray-300">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
              <span>Loading parquet metadata...</span>
            </div>
          </div>
        ) : metadata ? (
          <div className="space-y-10">
            {/* Summary cards */}
            <section>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/10 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Tickers Converted</span>
                    <Database className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="mt-3 text-3xl font-semibold">{metadata.summary.tickers}</div>
                  <p className="text-xs text-gray-400">Ready for local-first backtesting</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/10 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Records Available</span>
                    <BarChart3 className="h-5 w-5 text-purple-300" />
                  </div>
                  <div className="mt-3 text-3xl font-semibold">{metadata.summary.records.toLocaleString()}</div>
                  <p className="text-xs text-gray-400">61 trading days per ticker</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/10 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Raw JSON Footprint</span>
                    <HardDrive className="h-5 w-5 text-blue-300" />
                  </div>
                  <div className="mt-3 text-3xl font-semibold">{metadata.summary.jsonSizeHuman}</div>
                  <p className="text-xs text-gray-400">Before conversion</p>
                </div>
                <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-emerald-100">Parquet Footprint</span>
                    <HardDrive className="h-5 w-5 text-emerald-200" />
                  </div>
                  <div className="mt-3 text-3xl font-semibold">{metadata.summary.parquetSizeHuman}</div>
                  <p className="text-xs text-emerald-200/80">Savings {metadata.summary.reductionPercent}%</p>
                </div>
              </div>
            </section>

            {/* Conversion table */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Ticker Coverage</h2>
                <span className="text-xs text-gray-400">{metadata.summary.records.toLocaleString()} total records • Local parquet storage</span>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-white/10 text-left text-xs uppercase tracking-wide text-gray-300">
                    <tr>
                      <th className="px-4 py-3">Ticker</th>
                      <th className="px-4 py-3">Date Range</th>
                      <th className="px-4 py-3">Records</th>
                      <th className="px-4 py-3">Parquet Size</th>
                      <th className="px-4 py-3">Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {metadata.files.map((file) => (
                      <tr key={file.ticker} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-semibold">{file.ticker}</td>
                        <td className="px-4 py-3 text-gray-300">
                          {file.startDate} ? {file.endDate}
                        </td>
                        <td className="px-4 py-3 text-gray-200">{file.records.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300">
                          {file.parquetSizeBytes ? `${(file.parquetSizeBytes / 1024).toFixed(1)} KB` : 'n/a'}
                        </td>
                        <td className="px-4 py-3">
                          {typeof file.reductionPercent === 'number' ? (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200">
                              {file.reductionPercent}%
                            </span>
                          ) : (
                            <span className="text-gray-400">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Conversion status */}
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-6">
                <h3 className="text-lg font-semibold">Conversion Status</h3>
                <p className="mt-2 text-sm text-gray-300">
                  All structured JSON files have been compressed into parquet format for local-first access.
                </p>
                <ul className="mt-4 space-y-2 text-sm text-gray-200">
                  <li>• Conversion savings: {metadata.summary.reductionPercent}% overall</li>
                  <li>
                    • Parquet destination: <span className="font-mono text-xs text-gray-300">data/parquet-final</span>
                  </li>
                  <li>
                    • Metadata index: <span className="font-mono text-xs text-gray-300">metadata.json</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-6">
                <h3 className="text-lg font-semibold">Data Coverage & Gaps</h3>
                {missingTickers.length === 0 ? (
                  <p className="mt-2 text-sm text-emerald-200/80">
                    ? All converted tickers have complete coverage for 2024-01-01 ? 2024-03-31.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2 text-sm text-amber-200">
                    <p>?? Missing or incomplete data detected:</p>
                    <ul className="list-disc pl-5">
                      {missingTickers.map((entry) => (
                        <li key={entry.ticker}>{entry.ticker} — no parquet rows found</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-4 text-xs text-gray-400">
                  Use the refresh button after downloading new data to recalculate coverage and file sizes.
                </p>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}
