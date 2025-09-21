import Link from 'next/link'
import path from 'path'
import fs from 'fs/promises'
import { ArrowRight, TrendingUp, Bot, Database, BarChart3, HardDrive } from 'lucide-react'

type MetadataSummary = {
  tickers: number
  records: number
  parquetSizeHuman: string
  reductionPercent: number
}

type LocalStatus = {
  available: boolean
  summary?: MetadataSummary
}

async function readLocalStatus(): Promise<LocalStatus> {
  const metadataPath = path.join(process.cwd(), 'data', 'parquet-final', 'metadata.json')
  try {
    const raw = await fs.readFile(metadataPath, 'utf8')
    const metadata = JSON.parse(raw) as { summary: MetadataSummary }
    return {
      available: true,
      summary: metadata.summary,
    }
  } catch (error) {
    return { available: false }
  }
}

export default async function HomePage() {
  const localStatus = await readLocalStatus()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>

      <div className="relative">
        {/* Navigation */}
        <nav className="container mx-auto px-6 py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-2xl font-bold text-white">AI Backtester</div>
            <div className="flex items-center justify-between gap-4">
              <div className="hidden md:flex space-x-8">
                <Link href="/backtester" className="text-gray-300 hover:text-white transition-colors">
                  Backtester
                </Link>
                <Link href="/data-manager" className="text-gray-300 hover:text-white transition-colors">
                  Data Manager
                </Link>
                <Link href="/api/test-pipeline" className="text-gray-300 hover:text-white transition-colors">
                  Test API
                </Link>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  localStatus.available
                    ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200'
                    : 'border-amber-400/60 bg-amber-400/10 text-amber-100'
                }`}
              >
                {localStatus.available
                  ? `Local data ready • ${localStatus.summary?.tickers ?? 0} tickers`
                  : 'Local data pending'}
              </span>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="container mx-auto px-6 py-20">
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
              AI-Powered
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                {' '}Trading{' '}
              </span>
              Backtester
            </h1>
            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Generate sophisticated trading strategies using natural language and backtest them against
              compressed local parquet datasets. Blend offline-first performance with on-demand Polygon API refreshes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/backtester"
                className="inline-flex items-center px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Start Backtesting
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/data-manager"
                className="inline-flex items-center px-8 py-4 border border-gray-400 text-gray-300 hover:text-white hover:border-white font-semibold rounded-lg transition-colors"
              >
                Manage Local Data
              </Link>
            </div>
            {localStatus.available && localStatus.summary && (
              <p className="mt-6 text-sm text-emerald-200/70">
                {localStatus.summary.tickers} tickers • {localStatus.summary.records.toLocaleString()} records • {localStatus.summary.reductionPercent}% storage savings
              </p>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="container mx-auto px-6 py-20">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <Bot className="h-12 w-12 text-purple-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">AI Strategy Generation</h3>
              <p className="text-gray-400">
                Describe your strategy in natural language and let AI turn it into executable backtests.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <Database className="h-12 w-12 text-blue-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Local-First Pipeline</h3>
              <p className="text-gray-400">
                Convert Polygon downloads into parquet so simulations run instantly without external calls.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <TrendingUp className="h-12 w-12 text-green-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Hybrid Data Access</h3>
              <p className="text-gray-400">
                Toggle between offline parquet archives and live Polygon API updates whenever you need fresh data.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <BarChart3 className="h-12 w-12 text-yellow-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Interactive Analytics</h3>
              <p className="text-gray-400">
                Visualize performance metrics and price action using responsive, GPU-friendly charts.
              </p>
            </div>
          </div>
        </div>

        {/* Storage Callout */}
        <div className="container mx-auto px-6">
          <div className="grid gap-6 rounded-2xl border border-white/10 bg-white/10 p-8 md:grid-cols-[auto,1fr]">
            <HardDrive className="h-16 w-16 text-emerald-300" />
            <div>
              <h2 className="text-2xl font-semibold text-white">Optimized for Parquet</h2>
              <p className="mt-2 text-gray-300">
                Batch-convert raw JSON into columnar parquet files, slash storage costs, and keep a searchable metadata
                index for every ticker in your universe.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-emerald-200/80">
                <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1">
                  {localStatus.available && localStatus.summary
                    ? `${localStatus.summary.parquetSizeHuman} parquet footprint`
                    : 'Parquet conversion pending'}
                </span>
                <span className="rounded-full border border-purple-400/40 bg-purple-400/10 px-3 py-1">
                  70–90% storage savings
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="container mx-auto px-6 py-20">
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Test at Scale?
            </h2>
            <p className="text-xl text-purple-100 mb-8">
              Launch the backtester and leverage local parquet data for lightning-fast iteration.
            </p>
            <Link
              href="/backtester"
              className="inline-flex items-center px-8 py-4 bg-white text-purple-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              Launch Backtester
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
