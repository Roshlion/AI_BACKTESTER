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

function findField(record: any, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (record[alias] != null) {
      return record[alias];
    }
  }
  return undefined;
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value && "value" in value && "scale" in value) {
    // Handle DECIMAL with scale
    const { value: rawValue, scale } = value as { value: any; scale: number };
    return Number(rawValue) / Math.pow(10, scale);
  }
  return Number(value);
}

export function mapParquetRecord(record: any, fallbackTicker = ""): Row {
  const tickerValue = findField(record, ["ticker", "symbol"]) ?? fallbackTicker;
  const dateValue = findField(record, ["date", "timestamp", "t"]);
  const openValue = findField(record, ["open", "o", "OpenPrice", "openPrice"]);
  const highValue = findField(record, ["high", "h", "HighPrice", "highPrice"]);
  const lowValue = findField(record, ["low", "l", "LowPrice", "lowPrice"]);
  const closeValue = findField(record, ["close", "c", "ClosePrice", "closePrice"]);
  const volumeValue = findField(record, ["volume", "v", "Volume", "tradedVolume"]);
  const vwapValue = findField(record, ["vwap", "vw", "VWAP"]);
  const transactionsValue = findField(record, ["transactions", "count", "n"]);

  // Skip rows with invalid/missing essential data
  if (openValue == null || highValue == null || lowValue == null || closeValue == null) {
    console.warn(`Skipping row with missing OHLC data for ${tickerValue}: open=${openValue}, high=${highValue}, low=${lowValue}, close=${closeValue}`);
    return null as any; // Will be filtered out
  }

  const date = toISODate(dateValue);
  if (!date || date === "1970-01-01") {
    console.warn(`Skipping row with invalid date for ${tickerValue}: ${dateValue}`);
    return null as any; // Will be filtered out
  }

  return {
    ticker: String(tickerValue).toUpperCase(),
    date,
    timestamp: Number(record.timestamp ?? Date.parse(date)),
    open: toNumber(openValue),
    high: toNumber(highValue),
    low: toNumber(lowValue),
    close: toNumber(closeValue),
    volume: toNumber(volumeValue),
    vwap: vwapValue != null ? toNumber(vwapValue) : undefined,
    transactions: transactionsValue != null ? toNumber(transactionsValue) : undefined,
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
    const mappedRow = mapParquetRecord(record, fallbackTicker);
    if (mappedRow) {
      rows.push(mappedRow);
    }
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
  return data.map((record: any) => mapParquetRecord(record, fallbackTicker)).filter(Boolean);
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
