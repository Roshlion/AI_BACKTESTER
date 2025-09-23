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

  it('maps ABBV-style single-letter columns', async () => {
    const { mapParquetRecord } = await import('../lib/safeParquet');
    const record = {
      ticker: 'ABBV',
      date: '2020-09-24',
      o: 87,
      h: 87,
      l: 85.32,
      c: 85.91,
      v: 10084692,
      vw: 86.0441,
    };
    const row = mapParquetRecord(record, 'ABBV');
    expect(row).toMatchObject({
      ticker: 'ABBV',
      date: '2020-09-24',
      open: 87,
      high: 87,
      low: 85.32,
      close: 85.91,
      volume: 10084692,
      vwap: 86.0441,
    });
    expect(typeof row.timestamp).toBe('number');
    expect(row.close).toBeGreaterThan(0);
  });

  it('handles missing essential data by returning null', async () => {
    const { mapParquetRecord } = await import('../lib/safeParquet');
    const record = {
      ticker: 'TEST',
      date: '2024-01-01',
      // Missing o, h, l, c
      v: 1000,
    };
    const row = mapParquetRecord(record, 'TEST');
    expect(row).toBeNull();
  });

  it('handles DECIMAL values with scale', async () => {
    const { mapParquetRecord } = await import('../lib/safeParquet');
    const record = {
      ticker: 'TEST',
      date: '2024-01-01',
      o: { value: 10050, scale: 2 }, // 100.50
      h: { value: 10150, scale: 2 }, // 101.50
      l: { value: 9950, scale: 2 },  // 99.50
      c: { value: 10100, scale: 2 }, // 101.00
      v: 1000,
    };
    const row = mapParquetRecord(record, 'TEST');
    expect(row).toMatchObject({
      ticker: 'TEST',
      date: '2024-01-01',
      open: 100.50,
      high: 101.50,
      low: 99.50,
      close: 101.00,
      volume: 1000,
    });
  });

  it('handles BigInt values', async () => {
    const { mapParquetRecord } = await import('../lib/safeParquet');
    const record = {
      ticker: 'TEST',
      date: '2024-01-01',
      o: BigInt(100),
      h: BigInt(110),
      l: BigInt(90),
      c: BigInt(105),
      v: BigInt(50000),
    };
    const row = mapParquetRecord(record, 'TEST');
    expect(row).toMatchObject({
      ticker: 'TEST',
      date: '2024-01-01',
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 50000,
    });
  });
});
