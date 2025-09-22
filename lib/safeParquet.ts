// lib/safeParquet.ts
import { Row } from "@/types/row";

export type ManifestItem = {
  ticker: string;
  url: string;
  format: 'parquet' | 'json';
  records?: number;
  firstDate?: string;
  lastDate?: string;
  sizeBytes?: number;
};

export type Manifest = {
  version: number;
  source: 'public' | 'blob';
  asOf: string;
  tickers: ManifestItem[];
};


export async function loadManifest(req: Request): Promise<Manifest> {
  const origin = (req as any).nextUrl?.origin ?? new URL(req.url).origin;
  const src = process.env.PARQUET_URL && /^https?:\/\//i.test(process.env.PARQUET_URL)
    ? process.env.PARQUET_URL
    : `${origin}/manifest.json`;

  const res = await fetch(src, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
  return await res.json();
}

function toISODate(input: any): string {
  if (typeof input === 'string') return input.slice(0, 10);
  const ts = typeof input === 'bigint' ? Number(input) : Number(input ?? 0);
  return new Date(ts).toISOString().slice(0, 10);
}

function toNum(x: unknown): number {
  return typeof x === 'bigint' ? Number(x) : Number(x);
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function readParquetFromUrl(url: string): Promise<Row[]> {
  const buf = await fetchBuffer(url);
  // parquetjs-lite is untyped; rely on ambient types
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const { ParquetReader } = await import('parquetjs-lite');
  const reader = await ParquetReader.openBuffer(buf);
  const cursor = reader.getCursor();
  const rows: any[] = [];
  for (let r = await cursor.next(); r; r = await cursor.next()) rows.push(r);
  await reader.close();

  return rows.map((r: any) => ({
    ticker: String(r.ticker ?? 'AAPL'),
    date: toISODate(r.date ?? r.timestamp),
    timestamp: Number(r.timestamp ?? r.date ?? Date.parse(r.date)),
    open: toNum(r.open),
    high: toNum(r.high),
    low: toNum(r.low),
    close: toNum(r.close),
    volume: toNum(r.volume),
    vwap: r.vwap != null ? Number(r.vwap) : undefined,
    transactions: r.transactions != null ? Number(r.transactions) : undefined,
  }));
}

async function readJsonFromUrl(url: string): Promise<Row[]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} for ${url}`);
  const arr = await res.json();
  return (Array.isArray(arr) ? arr : []).map((r: any) => ({
    ticker: String(r.ticker ?? 'AAPL'),
    date: toISODate(r.date ?? r.timestamp),
    timestamp: Number(r.timestamp ?? r.date ?? Date.parse(r.date)),
    open: toNum(r.open),
    high: toNum(r.high),
    low: toNum(r.low),
    close: toNum(r.close),
    volume: toNum(r.volume),
    vwap: r.vwap != null ? Number(r.vwap) : undefined,
    transactions: r.transactions != null ? Number(r.transactions) : undefined,
  }));
}

/** Reads rows for a single ticker using manifest (json or parquet). */
export async function readTickerRange(
  req: Request,
  ticker: string,
  startDate?: string,
  endDate?: string
): Promise<Row[]> {
  const m = await loadManifest(req);
  const item = m.tickers.find(t => t.ticker.toUpperCase() === ticker.toUpperCase());
  if (!item) return [];

  const origin = (req as any).nextUrl?.origin ?? new URL(req.url).origin;
  const url = item.url.startsWith('http') ? item.url : `${origin}${item.url}`;
  const rows = item.format === 'json'
    ? await readJsonFromUrl(url)
    : await readParquetFromUrl(url);

  if (!startDate && !endDate) return rows;
  return rows.filter(r => (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate));
}

// Legacy compatibility exports
export interface TickerInfo {
  ticker: string;
  path: string;          // relative for public, absolute https URL for Blob
  firstDate: string;
  lastDate: string;
  records: number;
}

export async function getDataSource(req: Request) {
  try {
    const manifest = await loadManifest(req);
    return {
      source: manifest.source,
      asOf: manifest.asOf,
      tickerCount: manifest.tickers.length
    };
  } catch (error) {
    return {
      source: 'public' as const,
      asOf: new Date().toISOString(),
      tickerCount: 0
    };
  }
}

/**
 * Resolve ticker path to absolute URL (legacy compatibility)
 */
export function resolveTickerPath(manifest: Manifest, ticker: string, req: Request): string | null {
  const tickerInfo = manifest.tickers.find(t => t.ticker.toUpperCase() === ticker.toUpperCase());

  if (!tickerInfo) {
    return null;
  }

  // If using blob storage, url is already absolute
  if (manifest.source === 'blob') {
    return tickerInfo.url;
  }

  // For public mode, prepend origin if needed
  if (tickerInfo.url.startsWith('http')) {
    return tickerInfo.url;
  }

  const origin = (req as any).nextUrl?.origin ?? new URL(req.url).origin;
  return `${origin}${tickerInfo.url}`;
}

// Legacy compatibility - use readTickerRange instead
export async function safeReadParquet(req: Request, fallbackTicker = "AAPL"): Promise<Row[]> {
  return readTickerRange(req, fallbackTicker, '1900-01-01', '2099-12-31');
}