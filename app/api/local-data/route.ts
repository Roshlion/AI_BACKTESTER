import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

interface LocalBar {
  ticker: string;
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number | null;
  transactions?: number | null;
}

interface MetadataEntry {
  ticker: string;
  records: number;
  startDate: string;
  endDate: string;
  jsonSizeBytes?: number;
  parquetSizeBytes?: number;
  jsonPath?: string;
  parquetPath?: string;
  reductionPercent?: number;
}

interface MetadataPayload {
  generatedAt: string;
  summary: {
    tickers: number;
    records: number;
    jsonSizeBytes: number;
    parquetSizeBytes: number;
    jsonSizeHuman: string;
    parquetSizeHuman: string;
    reductionPercent: number;
  };
  files: MetadataEntry[];
}

type CachedTicker = {
  rows: LocalBar[];
  loadedAt: number;
  startDate: string;
  endDate: string;
  fileMtime: number;
};

const DATA_DIR = path.join(process.cwd(), 'data', 'parquet-final');
const METADATA_PATH = path.join(DATA_DIR, 'metadata.json');
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const dataCache = new Map<string, CachedTicker>();
let metadataCache: MetadataPayload | null = null;
let metadataMtime: number | null = null;

async function loadParquetModule() {
  const parquet = await import('parquetjs');
  return parquet;
}

async function loadMetadata(): Promise<MetadataPayload | null> {
  if (!existsSync(METADATA_PATH)) {
    metadataCache = null;
    metadataMtime = null;
    return null;
  }

  const stats = await fs.stat(METADATA_PATH);
  const currentMtime = stats.mtimeMs;

  if (metadataCache && metadataMtime === currentMtime) {
    return metadataCache;
  }

  const raw = await fs.readFile(METADATA_PATH, 'utf8');
  metadataCache = JSON.parse(raw) as MetadataPayload;
  metadataMtime = currentMtime;
  return metadataCache;
}

function parseTickerParam(request: NextRequest): string[] {
  const { searchParams } = new URL(request.url);
  const tickers = searchParams.getAll('ticker');
  if (tickers.length === 0) {
    const single = searchParams.get('ticker');
    if (!single) return [];
    return single.split(',').map((value) => value.trim()).filter(Boolean);
  }

  return tickers
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function filterRowsByDate(rows: LocalBar[], startDate?: string | null, endDate?: string | null) {
  if (!startDate && !endDate) {
    return rows;
  }

  return rows.filter((row) => {
    if (startDate && row.date < startDate) return false;
    if (endDate && row.date > endDate) return false;
    return true;
  });
}

async function readTickerFromParquet(ticker: string): Promise<CachedTicker | null> {
  const filePath = path.join(DATA_DIR, `${ticker.toUpperCase()}.parquet`);
  if (!existsSync(filePath)) {
    return null;
  }

  const stats = await fs.stat(filePath);
  const cached = dataCache.get(ticker);
  if (cached && cached.fileMtime === stats.mtimeMs && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  const parquet = await loadParquetModule();
  const reader = await parquet.ParquetReader.openFile(filePath);
  const cursor = reader.getCursor();
  const rows: LocalBar[] = [];
  let record: any;

  // eslint-disable-next-line no-cond-assign
  while ((record = await cursor.next())) {
    rows.push({
      ticker: record.ticker,
      date: record.date,
      timestamp: Number(record.timestamp),
      open: Number(record.open),
      high: Number(record.high),
      low: Number(record.low),
      close: Number(record.close),
      volume: Number(record.volume),
      vwap: record.vwap !== undefined ? Number(record.vwap) : null,
      transactions: record.transactions !== undefined ? Number(record.transactions) : null,
    });
  }

  await reader.close();

  if (rows.length === 0) {
    return null;
  }

  rows.sort((a, b) => a.timestamp - b.timestamp);
  const details: CachedTicker = {
    rows,
    loadedAt: Date.now(),
    startDate: rows[0].date,
    endDate: rows[rows.length - 1].date,
    fileMtime: stats.mtimeMs,
  };
  dataCache.set(ticker, details);
  return details;
}

function resolveDateRange(
  requestedStart: string | null,
  requestedEnd: string | null,
  coverage: { startDate: string; endDate: string }
) {
  const startDate = requestedStart ?? coverage.startDate;
  const endDate = requestedEnd ?? coverage.endDate;
  if (startDate > endDate) {
    throw new Error('startDate must be before endDate');
  }
  if (startDate < coverage.startDate || endDate > coverage.endDate) {
    throw new Error(`Requested range ${startDate} → ${endDate} outside available coverage ${coverage.startDate} → ${coverage.endDate}`);
  }
  return { startDate, endDate };
}

async function handleMetadataRequest() {
  const metadata = await loadMetadata();
  if (!metadata) {
    return NextResponse.json(
      {
        success: false,
        source: 'local',
        error: 'Metadata not found. Run npm run convert-parquet to generate parquet files.',
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    source: 'local',
    metadata,
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') ?? searchParams.get('summary');
    if (mode && (mode === 'metadata' || mode === '1')) {
      return await handleMetadataRequest();
    }

    const requestedTickers = parseTickerParam(request);
    if (requestedTickers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          source: 'local',
          error: 'ticker parameter is required. Use ?ticker=AAPL or ?ticker=AAPL,MSFT',
        },
        { status: 400 }
      );
    }

    const metadata = await loadMetadata();
    const tickerMetadata = new Map(metadata?.files?.map((entry) => [entry.ticker.toUpperCase(), entry]));

    const startParam = searchParams.get('startDate');
    const endParam = searchParams.get('endDate');

    const results = [] as Array<{
      ticker: string;
      startDate: string;
      endDate: string;
      records: number;
      data: LocalBar[];
    }>;

    for (const tickerRaw of requestedTickers) {
      const ticker = tickerRaw.toUpperCase();
      const cacheEntry = await readTickerFromParquet(ticker);
      if (!cacheEntry) {
        results.push({ ticker, startDate: '', endDate: '', records: 0, data: [] });
        continue;
      }

      let coverage = { startDate: cacheEntry.startDate, endDate: cacheEntry.endDate };
      if (tickerMetadata?.has(ticker)) {
        const meta = tickerMetadata.get(ticker)!;
        coverage = { startDate: meta.startDate, endDate: meta.endDate };
      }

      let resolvedRange;
      try {
        resolvedRange = resolveDateRange(startParam, endParam, coverage);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            source: 'local',
            error: error instanceof Error ? error.message : 'Invalid date range',
          },
          { status: 400 }
        );
      }

      const filtered = filterRowsByDate(cacheEntry.rows, resolvedRange.startDate, resolvedRange.endDate);
      results.push({
        ticker,
        startDate: resolvedRange.startDate,
        endDate: resolvedRange.endDate,
        records: filtered.length,
        data: filtered,
      });
    }

    const missingTickers = results.filter((item) => item.records === 0);
    if (missingTickers.length === results.length) {
      return NextResponse.json(
        {
          success: false,
          source: 'local',
          error: `No local parquet data available for requested tickers: ${requestedTickers.join(', ')}`,
        },
        { status: 404 }
      );
    }

    if (results.length === 1) {
      const entry = results[0];
      return NextResponse.json({
        success: true,
        source: 'local',
        ticker: entry.ticker,
        startDate: entry.startDate,
        endDate: entry.endDate,
        records: entry.records,
        missingTickers: missingTickers.map((item) => item.ticker),
        data: entry.data.map((row) => ({
          date: row.date,
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume,
          timestamp: row.timestamp,
        })),
      });
    }

    const totalRecords = results.reduce((sum, item) => sum + item.records, 0);
    return NextResponse.json({
      success: true,
      source: 'local',
      startDate: startParam ?? null,
      endDate: endParam ?? null,
      records: totalRecords,
      missingTickers: missingTickers.map((item) => item.ticker),
      data: results.map((entry) => ({
        ticker: entry.ticker,
        startDate: entry.startDate,
        endDate: entry.endDate,
        records: entry.records,
        data: entry.data.map((row) => ({
          date: row.date,
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume,
          timestamp: row.timestamp,
        })),
      })),
    });
  } catch (error) {
    console.error('Local data route error:', error);
    return NextResponse.json(
      {
        success: false,
        source: 'local',
        error: error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 }
    );
  }
}
