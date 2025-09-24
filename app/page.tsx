import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex min-h-screen flex-col items-center justify-center text-center space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">AI Backtester</h1>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center px-5 py-3 sm:py-2.5 border border-white/30 rounded-lg text-white/90 hover:text-white hover:border-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Open Dashboard
        </Link>
      </div>
    </main>
  )
}