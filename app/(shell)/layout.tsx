import { ReactNode } from 'react'
import { ShellTabs } from '@/components/ShellTabs'
import { StrategyStoreProvider } from '@/app/store/strategyStore'

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <StrategyStoreProvider>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <ShellTabs />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-8">{children}</main>
      </div>
    </StrategyStoreProvider>
  )
}
