import { Suspense } from 'react'
import ExploreClient from './ExploreClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  searchParams?: {
    symbol?: string
  }
}

export default function ExplorePage({ searchParams }: PageProps) {
  const symbol = searchParams?.symbol?.toUpperCase() ?? ''

  return (
    <Suspense fallback={<div className="rounded-lg bg-gray-900 p-6 text-sm text-gray-400">Loading data warehouse…</div>}>
      <ExploreClient initialSymbol={symbol} />
    </Suspense>
  )
}
