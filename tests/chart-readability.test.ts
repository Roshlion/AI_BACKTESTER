import { describe, expect, it } from 'vitest'

import { getSeriesColor } from '@/lib/colors'
import { downsample } from '@/lib/downsample'

describe('chart readability helpers', () => {
  it('downsamples long series while preserving endpoints', () => {
    const series = Array.from({ length: 10000 }, (_, index) => ({ index, value: index }))
    const reduced = downsample(series, 1000)

    expect(reduced.length).toBeLessThanOrEqual(1001)
    expect(reduced[0]).toEqual({ index: 0, value: 0 })
    expect(reduced.at(-1)).toEqual({ index: 9999, value: 9999 })
  })

  it('assigns stable colors and recycles palette predictably', () => {
    const colors = Array.from({ length: 12 }, (_, index) => getSeriesColor(`T${index}`, index))
    const unique = new Set(colors)

    expect(unique.size).toBeGreaterThan(5)
    expect(colors[0]).toBe(getSeriesColor('T0', 0))
    expect(getSeriesColor('T0', 0)).toBe(getSeriesColor('T0', 11))
  })
})
