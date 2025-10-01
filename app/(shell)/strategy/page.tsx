import { Suspense } from 'react'
import StrategyClient from './StrategyClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  searchParams?: {
    tickers?: string
    indicators?: string
    start?: string
    end?: string
  }
}

function parseList(value?: string): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
}

export default function StrategyPage({ searchParams }: PageProps) {
  const tickers = parseList(searchParams?.tickers)
  const indicators = parseList(searchParams?.indicators)
  const start = searchParams?.start?.slice(0, 10) || undefined
  const end = searchParams?.end?.slice(0, 10) || undefined

  return (
    <Suspense fallback={<div className="rounded-lg bg-gray-900 p-6 text-sm text-gray-400">Loading strategy lab…</div>}>
      <StrategyClient
        initialTickers={tickers}
        initialIndicators={indicators}
        initialStart={start}
        initialEnd={end}
      />
    </Suspense>
  )
}
