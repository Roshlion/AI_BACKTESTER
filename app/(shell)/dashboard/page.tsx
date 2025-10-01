import { Suspense } from 'react'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="rounded-lg bg-gray-900 p-6 text-sm text-gray-400">Loading dashboard…</div>}>
      <DashboardClient />
    </Suspense>
  )
}
