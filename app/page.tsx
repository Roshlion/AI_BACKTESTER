import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-4">AI Backtester</h1>
        <Link href="/dashboard" className="px-4 py-2 border border-white/30 rounded-lg text-white/90 hover:text-white hover:border-white">
          Open Dashboard
        </Link>
      </div>
    </main>
  )
}