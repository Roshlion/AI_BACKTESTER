'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const tabs = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/strategy', label: 'Strategy Lab' },
  { href: '/explore', label: 'Data Warehouse' },
]

export function ShellTabs() {
  const pathname = usePathname()

  return (
    <nav className="border-b border-gray-800 bg-gray-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="text-lg font-semibold text-white">
          AI Backtester
        </Link>
        <div className="flex items-center gap-2">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={clsx(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
                  active
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
