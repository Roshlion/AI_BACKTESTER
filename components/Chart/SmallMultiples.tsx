'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'

export interface SmallMultipleSeries {
  ticker: string
  data: Array<{ date: string; value: number | null }>
}

interface SmallMultiplesProps {
  series: SmallMultipleSeries[]
  colors: Record<string, string>
  showAll: boolean
  onToggleShowAll: () => void
}

const MAX_VISIBLE = 6

export function SmallMultiples({ series, colors, showAll, onToggleShowAll }: SmallMultiplesProps) {
  if (!series.length) {
    return null
  }

  const visible = showAll ? series : series.slice(0, MAX_VISIBLE)
  const truncated = series.length > MAX_VISIBLE

  return (
    <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/70 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Small Multiples</h3>
        {truncated && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="rounded border border-gray-600 px-3 py-1 text-xs font-medium text-gray-200 transition-colors hover:border-gray-400"
          >
            {showAll ? 'Show first 6' : `Show all ${series.length}`}
          </button>
        )}
      </div>
      {truncated && !showAll && (
        <p className="mb-4 text-xs text-gray-400">
          Showing the first {MAX_VISIBLE} tickers. Use “Show all” to expand.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => (
          <div key={item.ticker} className="rounded-lg border border-gray-800 bg-gray-950/80 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-100">{item.ticker}</span>
              <span className="text-[10px] uppercase text-gray-500">mini</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={item.data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis stroke="#4b5563" width={30} domain={['auto', 'auto']} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#1f2937', borderRadius: 8 }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(value: any) => (value == null ? value : Number(value).toFixed(2))}
                />
                <Line type="monotone" dataKey="value" stroke={colors[item.ticker]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  )
}
