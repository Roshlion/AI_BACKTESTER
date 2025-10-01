'use client'

import clsx from 'clsx'

interface ChartLegendProps {
  tickers: string[]
  colors: Record<string, string>
  hiddenTickers: Set<string>
  hoveredTicker: string | null
  onToggle: (ticker: string) => void
  onHover: (ticker: string | null) => void
}

export function ChartLegend({ tickers, colors, hiddenTickers, hoveredTicker, onToggle, onHover }: ChartLegendProps) {
  if (!tickers.length) {
    return null
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {tickers.map((ticker) => {
        const hidden = hiddenTickers.has(ticker)
        const active = hoveredTicker === ticker
        return (
          <button
            key={ticker}
            type="button"
            onClick={() => onToggle(ticker)}
            onMouseEnter={() => onHover(ticker)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(ticker)}
            onBlur={() => onHover(null)}
            className={clsx(
              'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              hidden ? 'border-gray-700 text-gray-500' : 'border-gray-600 text-gray-200 hover:border-gray-400',
              active && !hidden && 'border-blue-400 text-white shadow',
            )}
            aria-pressed={!hidden}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: hidden ? '#4b5563' : colors[ticker] }}
            />
            <span>{ticker}</span>
            <span className="text-[10px] uppercase text-gray-500">{hidden ? 'show' : 'hide'}</span>
          </button>
        )
      })}
    </div>
  )
}
