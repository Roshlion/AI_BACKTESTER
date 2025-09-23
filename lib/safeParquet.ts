import type { Row } from "@/types/row";
import { S3_BASE } from "@/lib/env";

export type ManifestItem = {
  ticker: string;
  url: string;
  format: "parquet" | "json";
  records?: number;
  firstDate?: string;
  lastDate?: string;
};

export type Manifest = {
  asOf: string | null;
  source: string;
  tickers: ManifestItem[];
};

let cachedManifest: { value: Manifest; expiresAt: number } | null = null;

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  return res.json();
}

export async function loadManifest(): Promise<Manifest> {
  if (cachedManifest && cachedManifest.expiresAt > Date.now()) {
    return cachedManifest.value;
  }

  const url = `${S3_BASE}/index.json`;
  const raw = await fetchJson(url);
  const rawTickers = Array.isArray(raw?.tickers) ? raw.tickers : [];

  const tickers: ManifestItem[] = rawTickers.map((entry: any) => {
    if (typeof entry === "string") {
      const upper = entry.toUpperCase();
      return {
        ticker: upper,
        url: `${S3_BASE}/${upper}.parquet`,
        format: "parquet",
      };
    }

    const ticker = String(entry?.ticker ?? "").toUpperCase();
    const format = entry?.format === "json" ? "json" : "parquet";
    let urlCandidate = entry?.url as string | undefined;
    if (!urlCandidate) {
      urlCandidate = format === "json" ? `${S3_BASE}/${ticker}.json` : `${S3_BASE}/${ticker}.parquet`;
    }

    if (!urlCandidate.startsWith("http")) {
      urlCandidate = `${S3_BASE}/${urlCandidate.replace(/^\//, "")}`;
    }

    return {
      ticker,
      url: urlCandidate,
      format,
      records: entry?.records,
      firstDate: entry?.firstDate,
      lastDate: entry?.lastDate,
    };
  });

  const manifest: Manifest = {
    asOf: typeof raw?.asOf === "string" ? raw.asOf : null,
    source: raw?.source ?? url,
    tickers,
  };

  cachedManifest = {
    value: manifest,
    expiresAt: Date.now() + 60_000,
  };

  return manifest;
}

function toISODate(value: any): string {
  if (!value) return "";
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const timestamp = typeof value === "bigint" ? Number(value) : Number(value);
  return new Date(timestamp).toISOString().slice(0, 10);
}

function toNumber(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

export function mapParquetRecord(record: any, fallbackTicker = ""): Row {
  return {
    ticker: String(record.ticker ?? record.symbol ?? fallbackTicker).toUpperCase(),
    date: toISODate(record.date ?? record.timestamp),
    timestamp: Number(record.timestamp ?? Date.parse(record.date)),
    open: toNumber(record.open),
    high: toNumber(record.high),
    low: toNumber(record.low),
    close: toNumber(record.close),
    volume: toNumber(record.volume),
    vwap: record.vwap != null ? Number(record.vwap) : undefined,
    transactions: record.transactions != null ? Number(record.transactions) : undefined,
  };
}

async function readParquetFromUrl(url: string, fallbackTicker: string): Promise<Row[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch parquet: ${res.status} for ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const { ParquetReader } = await import("parquetjs-lite");
  const reader = await ParquetReader.openBuffer(buffer);
  const cursor = reader.getCursor();
  const rows: Row[] = [];

  for (let record = await cursor.next(); record; record = await cursor.next()) {
    rows.push(mapParquetRecord(record, fallbackTicker));
  }

  await reader.close();
  return rows;
}

async function readJsonFromUrl(url: string, fallbackTicker: string): Promise<Row[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch json: ${res.status} for ${url}`);
  }
  const payload = await res.json();
  const data = Array.isArray(payload) ? payload : [];
  return data.map((record: any) => ({
    ticker: String(record.ticker ?? fallbackTicker).toUpperCase(),
    date: toISODate(record.date ?? record.timestamp),
    timestamp: Number(record.timestamp ?? Date.parse(record.date)),
    open: toNumber(record.open),
    high: toNumber(record.high),
    low: toNumber(record.low),
    close: toNumber(record.close),
    volume: toNumber(record.volume),
    vwap: record.vwap != null ? Number(record.vwap) : undefined,
    transactions: record.transactions != null ? Number(record.transactions) : undefined,
  }));
}

export async function readTickerRange(
  ticker: string,
  startDate?: string,
  endDate?: string,
): Promise<Row[]> {
  const manifest = await loadManifest();
  const match = manifest.tickers.find((item) => item.ticker.toUpperCase() === ticker.toUpperCase());
  if (!match) {
    return [];
  }

  const rows = match.format === "json"
    ? await readJsonFromUrl(match.url, match.ticker)
    : await readParquetFromUrl(match.url, match.ticker);

  if (!startDate && !endDate) {
    return rows;
  }

  return rows.filter((row) => {
    const afterStart = startDate ? row.date >= startDate : true;
    const beforeEnd = endDate ? row.date <= endDate : true;
    return afterStart && beforeEnd;
  });
}

export async function safeReadParquet(ticker = "AAPL"): Promise<Row[]> {
  return readTickerRange(ticker, "1900-01-01", "2099-12-31");
}
