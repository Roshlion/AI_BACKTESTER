import { vi } from "vitest";

process.env.AWS_BUCKET ||= "dummy-bucket";
process.env.AWS_REGION ||= "us-east-1";
process.env.AWS_PREFIX ||= "prod";
process.env.S3_BASE ||= "https://dummy-bucket.s3.amazonaws.com/prod";
process.env.NEXT_PUBLIC_APP_URL ||= "http://localhost:3000";

const okJson = (obj: any) =>
  new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

vi.stubGlobal('fetch', vi.fn(async (input: any) => {
  const u = String(input)
  if (u.endsWith('/index.json')) {
    return okJson({
      asOf: '2025-01-01T00:00:00Z',
      source: 'test',
      tickers: ['AAPL', 'AMD', 'AMZN', 'MSFT'],
    })
  }

  if (u.includes('/api/local-data')) {
    const url = new URL(u, 'https://example.com')
    const ticker = url.searchParams.get('ticker') ?? 'AAPL'
    const base = ticker.charCodeAt(0)
    const rows = Array.from({ length: 5 }).map((_, index) => ({
      ticker,
      date: `2025-01-0${index + 1}`,
      timestamp: Date.parse(`2025-01-0${index + 1}`),
      open: base + index,
      high: base + index + 2,
      low: base + index - 1,
      close: base + index + 1,
      volume: 1000 + index * 10,
    }))
    return okJson({ ok: true, rows })
  }

  return new Response('not found', { status: 404 })
}))
