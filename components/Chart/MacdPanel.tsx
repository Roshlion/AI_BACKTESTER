'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'
import type { IndicatorPoint } from './types'

interface MacdPanelProps {
  data: IndicatorPoint[]
  tickers: string[]
  colors: Record<string, string>
  hiddenTickers: Set<string>
  hoveredTicker: string | null
}

export function MacdPanel({ data, tickers, colors, hiddenTickers, hoveredTicker }: MacdPanelProps) {
  if (!tickers.length || !data.length) {
    return null
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/70 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-200">MACD</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ left: 8, right: 16, top: 12, bottom: 8 }}>
          <XAxis dataKey="date" hide />
          <YAxis stroke="#9ca3af" tickLine={false} width={52} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', borderColor: '#1f2937', borderRadius: 8 }}
            labelStyle={{ color: '#f3f4f6' }}
            formatter={(value: any) => (value == null ? value : Number(value).toFixed(2))}
          />
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
          {tickers.map((ticker) => {
            if (hiddenTickers.has(ticker)) return null
            const dimmed = hoveredTicker && hoveredTicker !== ticker
            return (
              <Line
                key={`${ticker}-macd`}
                type="monotone"
                dataKey={`${ticker}_MACD`}
                stroke={colors[ticker]}
                strokeWidth={dimmed ? 1 : 1.6}
                strokeOpacity={dimmed ? 0.35 : 0.9}
                dot={false}
                isAnimationActive={false}
                name={`${ticker} MACD`}
              />
            )
          })}
          {tickers.map((ticker) => {
            if (hiddenTickers.has(ticker)) return null
            const dimmed = hoveredTicker && hoveredTicker !== ticker
            return (
              <Line
                key={`${ticker}-macd-signal`}
                type="monotone"
                dataKey={`${ticker}_MACD_SIGNAL`}
                stroke={colors[ticker]}
                strokeDasharray="6 4"
                strokeWidth={dimmed ? 0.8 : 1.2}
                strokeOpacity={dimmed ? 0.25 : 0.7}
                dot={false}
                isAnimationActive={false}
                name={`${ticker} Signal`}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
