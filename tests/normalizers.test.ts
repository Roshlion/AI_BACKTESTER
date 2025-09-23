/// <reference types="vitest" />
import { describe, expect, it, beforeEach, vi } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var __test_manifest__: any;
}

function resetFetch(tickers = ['AAPL']) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/index.json')) {
        return new Response(
          JSON.stringify({
            asOf: '2025-01-01T00:00:00Z',
            source: 'test',
            tickers,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch ${u}`);
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  resetFetch();
});

describe('CSV normaliser', () => {
  it('parses rows from CSV text', async () => {
    const { parseCsvToRows } = await import('../lib/ingest-bars');
    const csv = 'ticker,date,open,high,low,close,volume\nAAPL,2024-01-02,100,110,90,105,123456';
    const rows = parseCsvToRows(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ticker: 'AAPL',
      date: '2024-01-02',
      open: 100,
      close: 105,
    });
  });
});


describe('Parquet record normaliser', () => {
  it('maps parquet row into Row shape', async () => {
    const { mapParquetRecord } = await import('../lib/safeParquet');
    const record = {
      ticker: 'msft',
      date: '2024-02-05',
      open: 10,
      high: 20,
      low: 5,
      close: 15,
      volume: 999,
      timestamp: Date.parse('2024-02-05'),
    };
    const row = mapParquetRecord(record, 'MSFT');
    expect(row).toMatchObject({
      ticker: 'MSFT',
      date: '2024-02-05',
      open: 10,
      close: 15,
    });
    expect(typeof row.timestamp).toBe('number');
  });
});
