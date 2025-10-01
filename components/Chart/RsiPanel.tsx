'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'
import type { IndicatorPoint } from './types'

interface RsiPanelProps {
  data: IndicatorPoint[]
  tickers: string[]
  colors: Record<string, string>
  hiddenTickers: Set<string>
  hoveredTicker: string | null
}

export function RsiPanel({ data, tickers, colors, hiddenTickers, hoveredTicker }: RsiPanelProps) {
  if (!tickers.length || !data.length) {
    return null
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/70 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-200">RSI</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: 8, right: 16, top: 12, bottom: 8 }}>
          <XAxis dataKey="date" hide />
          <YAxis domain={[0, 100]} stroke="#9ca3af" tickLine={false} width={36} />
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', borderColor: '#1f2937', borderRadius: 8 }}
            labelStyle={{ color: '#f3f4f6' }}
            formatter={(value: any) => (value == null ? value : Number(value).toFixed(2))}
          />
          <ReferenceLine y={70} stroke="#f87171" strokeDasharray="4 4" />
          <ReferenceLine y={30} stroke="#34d399" strokeDasharray="4 4" />
          {tickers.map((ticker) => {
            if (hiddenTickers.has(ticker)) return null
            const dimmed = hoveredTicker && hoveredTicker !== ticker
            return (
              <Line
                key={`${ticker}-rsi`}
                type="monotone"
                dataKey={`${ticker}_RSI`}
                stroke={colors[ticker]}
                strokeWidth={dimmed ? 1 : 1.8}
                strokeOpacity={dimmed ? 0.35 : 0.9}
                dot={false}
                isAnimationActive={false}
                name={`${ticker} RSI`}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
