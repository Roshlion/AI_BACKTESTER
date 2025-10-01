'use client'

import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, TooltipProps } from 'recharts'
import type { CombinedPoint } from './types'
import type { IndicatorToggleState } from '@/app/(shell)/dashboard/utils'
import { withAlpha } from '@/lib/colors'
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'

interface MultiSeriesChartProps {
  data: CombinedPoint[]
  tickers: string[]
  colors: Record<string, string>
  indicatorState: IndicatorToggleState
  hiddenTickers: Set<string>
  hoveredTicker: string | null
  scaleMode: 'price' | 'indexed'
}

const tooltipFormatter: TooltipProps<ValueType, NameType>['formatter'] = (value, name) => {
  if (value == null) return null
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return `${value}`
  return [numeric.toFixed(2), name]
}

export function MultiSeriesChart({
  data,
  tickers,
  colors,
  indicatorState,
  hiddenTickers,
  hoveredTicker,
  scaleMode,
}: MultiSeriesChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-gray-800 bg-gray-900 text-sm text-gray-500">
        Select tickers to display the combined chart.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Price Overview ({scaleMode === 'indexed' ? 'Indexed to 100' : 'Absolute'})</h3>
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 12 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#9ca3af" minTickGap={24} tickLine={false} />
          <YAxis stroke="#9ca3af" tickLine={false} width={72} />
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', borderColor: '#1f2937', borderRadius: 8 }}
            labelStyle={{ color: '#f3f4f6' }}
            formatter={tooltipFormatter}
          />
          {tickers.map((ticker) => {
            if (hiddenTickers.has(ticker)) {
              return null
            }
            const color = colors[ticker]
            const dimmed = hoveredTicker && hoveredTicker !== ticker
            return (
              <Line
                key={ticker}
                type="monotone"
                dataKey={ticker}
                stroke={color}
                strokeWidth={dimmed ? 1.5 : 2.4}
                strokeOpacity={dimmed ? 0.3 : 1}
                dot={false}
                isAnimationActive={false}
                name={ticker}
              />
            )
          })}
          {indicatorState.sma.enabled &&
            tickers.map((ticker) => {
              if (hiddenTickers.has(ticker)) {
                return null
              }
              const color = withAlpha(colors[ticker], 0.6)
              const dimmed = hoveredTicker && hoveredTicker !== ticker
              return (
                <Line
                  key={`${ticker}-sma`}
                  type="monotone"
                  dataKey={`${ticker}_SMA`}
                  stroke={color}
                  strokeDasharray="6 6"
                  strokeWidth={dimmed ? 1 : 1.6}
                  strokeOpacity={dimmed ? 0.25 : 0.8}
                  dot={false}
                  isAnimationActive={false}
                  name={`${ticker} SMA`}
                />
              )
            })}
          {indicatorState.ema.enabled &&
            tickers.map((ticker) => {
              if (hiddenTickers.has(ticker)) {
                return null
              }
              const color = withAlpha(colors[ticker], 0.5)
              const dimmed = hoveredTicker && hoveredTicker !== ticker
              return (
                <Line
                  key={`${ticker}-ema`}
                  type="monotone"
                  dataKey={`${ticker}_EMA`}
                  stroke={color}
                  strokeDasharray="4 4"
                  strokeWidth={dimmed ? 1 : 1.4}
                  strokeOpacity={dimmed ? 0.25 : 0.7}
                  dot={false}
                  isAnimationActive={false}
                  name={`${ticker} EMA`}
                />
              )
            })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
