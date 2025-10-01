import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">AI Backtester</h1>
        <p className="mt-3 text-sm text-gray-300">
          Explore the dashboard, craft strategies, and inspect datasets directly from the new tabbed workspace.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-500"
        >
          Enter workspace
        </Link>
      </div>
    </main>
  )
}
