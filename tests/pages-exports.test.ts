import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ALLOWED_EXPORTS = new Set([
  'default',
  'generateMetadata',
  'generateStaticParams',
  'revalidate',
  'dynamic',
  'dynamicParams',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'metadata',
])

describe('app router page exports', () => {
  it('disallows named exports outside the Next.js surface', async () => {
    const files: string[] = []

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (/page\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath)
        }
      }
    }

    walk(path.resolve('app'))
    const offenders: string[] = []

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      const matches = Array.from(
        source.matchAll(/export\s+(?:const|function|class)\s+([A-Za-z0-9_]+)/g),
      )
      for (const match of matches) {
        const name = match[1]
        if (!ALLOWED_EXPORTS.has(name)) {
          offenders.push(`${file}: ${name}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
