export default function DataManagerPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">Data Manager</h1>
        <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          <p className="text-white">Data management interface coming soon...</p>
          <p className="text-gray-300 mt-4">
            Your parquet data is available at /api/local-data with 20 tickers ready for backtesting.
          </p>
        </div>
      </div>
    </div>
  )
}