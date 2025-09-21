'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Bar } from 'recharts'
import { TrendingUp, Download, Settings, Play, Database, Radio, Cloud, Beaker } from 'lucide-react'
import Link from 'next/link'

type DataSource = 'local' | 'api'

type MarketData = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: number
}

type TestResult = {
  name: string
  status: 'PASS' | 'FAIL'
  data?: any
  message?: string
  error?: string
}

type MetadataEntry = {
  ticker: string
  records: number
  startDate: string
  endDate: string
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
      jsonSizeHuman: string
      parquetSizeHuman: string
      reductionPercent: number
    }
    files: MetadataEntry[]
  }
  error?: string
}

export default function BacktesterPage() {
  const [data, setData] = useState<MarketData[]>([])
  const [ticker, setTicker] = useState('AAPL')
  const [startDate, setStartDate] = useState('2024-01-01')
  const [endDate, setEndDate] = useState('2024-03-31')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [isRunningTests, setIsRunningTests] = useState(false)
  const [dataSource, setDataSource] = useState<DataSource>('local')
  const [metadata, setMetadata] = useState<MetadataResponse['metadata'] | null>(null)
  const [loadingMetadata, setLoadingMetadata] = useState(true)

  const availableTickers = useMemo(() => {
    if (!metadata?.files) return []
    return metadata.files.map((entry) => entry.ticker)
  }, [metadata])

  const coverageForTicker = useMemo(() => {
    if (!metadata?.files) return null
    return metadata.files.find((entry) => entry.ticker === ticker.toUpperCase()) ?? null
  }, [metadata, ticker])

  useEffect(() => {
    async function loadMetadata() {
      try {
        setLoadingMetadata(true)
        const response = await fetch('/api/local-data?mode=metadata')
        const json = (await response.json()) as MetadataResponse
        if (json.success && json.metadata) {
          setMetadata(json.metadata)
        } else {
          setMetadata(null)
        }
      } catch (err) {
        console.error('Failed to load local metadata', err)
        setMetadata(null)
      } finally {
        setLoadingMetadata(false)
      }
    }

    loadMetadata()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      let endpoint = ''
      if (dataSource === 'local') {
        const params = new URLSearchParams({
          ticker,
          startDate,
          endDate,
        })
        endpoint = `/api/local-data?${params.toString()}`
      } else {
        const params = new URLSearchParams({
          ticker,
          start: startDate,
          end: endDate,
          action: 'get',
        })
        endpoint = `/api/data?${params.toString()}`
      }

      const response = await fetch(endpoint)
      const result = await response.json()

      if (result.success && result.data) {
        if (Array.isArray(result.data)) {
          setData(result.data)
        } else if (Array.isArray(result.data?.data)) {
          setData(result.data.data)
        } else {
          setError('Received unexpected data format from API')
        }
        // If the server clamped the date window, reflect it in the UI
        if (result?.meta?.used) {
          const used = result.meta.used
          if (used.start && used.end) {
            if (used.start !== startDate) setStartDate(used.start)
            if (used.end !== endDate) setEndDate(used.end)
          }
        }
      } else {
        setError(result.error || 'Failed to fetch data')
      }
    } catch (err) {
      setError('Network error occurred')
    }

    setLoading(false)
  }

  const exportCsv = () => {
    if (!data?.length) return;
    const header = 'date,open,high,low,close,volume,timestamp\n';
    const body = data
      .map((d) => `${d.date},${d.open},${d.high},${d.low},${d.close},${d.volume},${d.timestamp}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const runTests = async () => {
    setIsRunningTests(true)
    setTestResults([])

    try {
      const response = await fetch('/api/test-pipeline')
      const result = await response.json()

      if (result.tests) {
        setTestResults(result.tests)
      }
    } catch (err) {
      setError('Failed to run tests')
    }

    setIsRunningTests(false)
  }

  useEffect(() => {
    if (dataSource === 'local' && availableTickers.length > 0) {
      const normalized = ticker.toUpperCase()
      if (!availableTickers.includes(normalized)) {
        setTicker(availableTickers[0])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTickers.length, dataSource])

  useEffect(() => {
    if (!coverageForTicker) return;
    const { startDate: covStart, endDate: covEnd } = coverageForTicker;
    if (startDate < covStart) setStartDate(covStart);
    if (endDate > covEnd) setEndDate(covEnd);
  }, [coverageForTicker]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource])

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dataSourceDetails = {
    local: {
      label: 'Local Parquet',
      description: 'Using converted parquet data stored on disk',
      icon: <Radio className="w-4 h-4 mr-2" />,
    },
    api: {
      label: 'Polygon API',
      description: 'Fetching fresh data from Polygon (network required)',
      icon: <Cloud className="w-4 h-4 mr-2" />,
    },
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-white">AI Backtester</h1>
              <span className="inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                {dataSource === 'local' ? 'Local Data' : 'Live API'}
              </span>
            </div>
            <p className="mt-2 text-gray-300">Test your trading strategies with comprehensive historical data</p>
            {dataSource === 'local' && metadata && (
              <p className="mt-1 text-sm text-emerald-200/80">
                {metadata.summary.tickers} tickers • {metadata.summary.records} records • Storage savings {metadata.summary.reductionPercent}%
              </p>
            )}
          </div>
          <div className="flex gap-4">
            <button
              onClick={runTests}
              disabled={isRunningTests}
              className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <Database className="w-4 h-4 mr-2" />
              {isRunningTests ? 'Running Tests...' : 'Test Pipeline'}
            </button>
            <button className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </button>
            <Link href="/strategy" className="flex items-center px-4 py-2 border border-white/20 text-white/90 hover:text-white hover:border-white rounded-lg transition-colors">
              <Beaker className="w-4 h-4 mr-2" /> Strategy Lab
            </Link>
            <Link href="/data" className="flex items-center px-4 py-2 border border-white/20 text-white/90 hover:text-white hover:border-white rounded-lg transition-colors">
              <Database className="w-4 h-4 mr-2" /> Data Warehouse
            </Link>
          </div>
        </div>

        {/* Data source toggle */}
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(dataSourceDetails) as DataSource[]).map((key) => {
            const detail = dataSourceDetails[key]
            const isActive = dataSource === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDataSource(key)}
                className={`flex items-center rounded-xl border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? 'border-emerald-400/70 bg-emerald-400/10 text-white'
                    : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/30 hover:text-white'
                }`}
              >
                {detail.icon}
                <div>
                  <div className="font-semibold">{detail.label}</div>
                  <div className="text-xs text-gray-400">{detail.description}</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">Pipeline Test Results</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {testResults.map((test, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    test.status === 'PASS'
                      ? 'bg-green-500/20 border-green-500/50'
                      : 'bg-red-500/20 border-red-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-white">{test.name}</h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        test.status === 'PASS' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                      }`}
                    >
                      {test.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{test.message || test.error || 'No additional info'}</p>
                  {test.data !== undefined && (
                    <p className="text-xs text-gray-400 mt-1">
                      Data: {typeof test.data === 'object' ? JSON.stringify(test.data) : test.data}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-8">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Ticker Symbol</label>
              <input
                type="text"
                list="ticker-options"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="AAPL"
              />
              <datalist id="ticker-options">
                {availableTickers.map((option) => (
                  <option value={option} key={option} />
                ))}
              </datalist>
              {dataSource === 'local' && !loadingMetadata && availableTickers.length === 0 && (
                <p className="mt-2 text-xs text-amber-300">
                  No local tickers detected. Run the parquet conversion to enable offline mode.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                min={coverageForTicker?.startDate}
                max={coverageForTicker?.endDate}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                min={coverageForTicker?.startDate}
                max={coverageForTicker?.endDate}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchData}
                disabled={loading}
                className="w-full flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {loading ? 'Loading...' : 'Get Data'}
              </button>
            </div>
          </div>

          {dataSource === 'local' && coverageForTicker && (
            <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              <div className="font-semibold">Local coverage</div>
              <div>
                {coverageForTicker.startDate} → {coverageForTicker.endDate} · {coverageForTicker.records} records
              </div>
              {typeof coverageForTicker.reductionPercent === 'number' && (
                <div className="text-emerald-200/80">
                  Storage reduction: {coverageForTicker.reductionPercent}%
                </div>
              )}
            </div>
          )}
        </div>

        {/* Data Info */}
        {data.length > 0 && (
          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-8">
            <div className="grid md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{data.length}</div>
                <div className="text-sm text-gray-300">Total Records</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{ticker.toUpperCase()}</div>
                <div className="text-sm text-gray-300">Ticker Symbol</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{data[0].date}</div>
                <div className="text-sm text-gray-300">First Date</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{data[data.length - 1].date}</div>
                <div className="text-sm text-gray-300">Last Date</div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-8">
            <p className="text-red-200">Error: {error}</p>
          </div>
        )}

        {/* Chart */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Price Chart</h2>
            <button
              onClick={exportCsv}
              disabled={!data?.length}
              className="flex items-center px-4 py-2 border border-gray-400 text-gray-300 hover:text-white hover:border-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </button>
            <Link href="/strategy" className="flex items-center px-4 py-2 border border-white/20 text-white/90 hover:text-white hover:border-white rounded-lg transition-colors">
              <Beaker className="w-4 h-4 mr-2" /> Strategy Lab
            </Link>
            <Link href="/data" className="flex items-center px-4 py-2 border border-white/20 text-white/90 hover:text-white hover:border-white rounded-lg transition-colors">
              <Database className="w-4 h-4 mr-2" /> Data Warehouse
            </Link>
          </div>

          <div className="h-96">
            {data.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  {/* Define both Y axes with explicit IDs */}
                  <YAxis yAxisId="price" />
                  <YAxis yAxisId="volume" orientation="right" />
                  <Tooltip />
                  <Legend />
                  {/* Series must reference matching yAxisId */}
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="close"
                    name="Close"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Bar
                    yAxisId="volume"
                    dataKey="volume"
                    name="Volume"
                    opacity={0.3}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                {loading ? (
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p>Loading market data...</p>
                  </div>
                ) : (
                  <p>No data available. Click "Get Data" to fetch data.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Performance Metrics</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-300">Total Return</span>
                <span className="text-green-400 font-semibold">+12.5%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Sharpe Ratio</span>
                <span className="text-white font-semibold">1.42</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Max Drawdown</span>
                <span className="text-red-400 font-semibold">-8.2%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Win Rate</span>
                <span className="text-white font-semibold">68%</span>
              </div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Data Pipeline Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-300">Data Source</span>
                <span className="text-blue-400 font-semibold">{dataSource === 'local' ? 'Local Parquet' : 'Polygon API'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Storage</span>
                <span className="text-green-400 font-semibold">Local + S3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Format</span>
                <span className="text-yellow-400 font-semibold">Parquet</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Last Update</span>
                <span className="text-white font-semibold">
                  {metadata?.generatedAt ? new Date(metadata.generatedAt).toLocaleString() : 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">System Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-300">API Status</span>
                <span className="text-green-400 font-semibold">{dataSource === 'local' ? 'Offline Ready' : 'Online'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Data Coverage</span>
                <span className="text-blue-400 font-semibold">2000-2024</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Processing</span>
                <span className="text-purple-400 font-semibold">Real-time</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Uptime</span>
                <span className="text-white font-semibold">99.9%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

