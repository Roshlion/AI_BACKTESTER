import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { Row } from "@/types/row";

export type ManifestSource = "local" | "remote" | "blob";

export type ManifestItem = {
  ticker: string;
  url: string;
  format: "parquet" | "json";
  records?: number;
  firstDate?: string;
  lastDate?: string;
  sizeBytes?: number;
};

export type Manifest = {
  version: number;
  source: ManifestSource;
  asOf: string;
  tickers: ManifestItem[];
};

let cachedS3Manifest: { value: Manifest; expiresAt: number } | null = null;

function getOrigin(req: Request): string {
  const nextUrl = (req as any).nextUrl;
  if (nextUrl?.origin) {
    return nextUrl.origin;
  }
  return new URL(req.url).origin;
}

function s3PublicUrl(bucket: string, key: string, region: string): string {
  if (process.env.POLYGON_S3_BUCKET) {
    return `https://${process.env.POLYGON_S3_BUCKET}/${key}`;
  }
  const prefix = region === "us-east-1" ? "" : `.${region}`;
  return `https://${bucket}.s3${prefix}.amazonaws.com/${key}`;
}

async function loadManifestFromS3(): Promise<Manifest> {
  if (cachedS3Manifest && cachedS3Manifest.expiresAt > Date.now()) {
    return cachedS3Manifest.value;
  }

  const bucket = process.env.S3_BUCKET_NAME!;
  const region = process.env.AWS_REGION ?? "us-east-1";
  const prefix = process.env.S3_PREFIX ?? "";

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const tickers: ManifestItem[] = [];
  let token: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token,
    });

    const response = await client.send(command);
    const contents = response.Contents ?? [];

    for (const obj of contents) {
      const key = obj.Key;
      if (!key || !key.toLowerCase().endsWith(".parquet")) continue;
      const file = key.split("/").pop() ?? key;
      const ticker = file.replace(/\.parquet$/i, "").toUpperCase();

      tickers.push({
        ticker,
        url: s3PublicUrl(bucket, key, region),
        format: "parquet",
        sizeBytes: obj.Size,
      });
    }

    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);

  const manifest: Manifest = {
    version: 1,
    source: "blob",
    asOf: new Date().toISOString(),
    tickers,
  };

  cachedS3Manifest = {
    value: manifest,
    expiresAt: Date.now() + 60_000,
  };

  return manifest;
}

export async function loadManifest(req: Request): Promise<Manifest> {
  if (
    process.env.S3_BUCKET_NAME &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  ) {
    return loadManifestFromS3();
  }

  const origin = getOrigin(req);
  if (process.env.PARQUET_URL && /^https?:\/\//i.test(process.env.PARQUET_URL)) {
    const res = await fetch(process.env.PARQUET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch remote manifest: ${res.status}`);
    const manifest = (await res.json()) as Manifest;
    return {
      ...manifest,
      source: manifest.source ?? "remote",
    };
  }

  const res = await fetch(`${origin}/manifest.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  return {
    ...manifest,
    source: manifest.source ?? "local",
  };
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

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch parquet: ${response.status} for ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function readParquetFromUrl(url: string): Promise<Row[]> {
  const buffer = await fetchBuffer(url);
  // parquetjs-lite does not ship types; suppress TS complaints.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const { ParquetReader } = await import("parquetjs-lite");
  const reader = await ParquetReader.openBuffer(buffer);
  const cursor = reader.getCursor();
  const rows: Row[] = [];

  for (let record = await cursor.next(); record; record = await cursor.next()) {
    rows.push({
      ticker: String(record.ticker ?? record.symbol ?? "AAPL"),
      date: toISODate(record.date ?? record.timestamp),
      timestamp: Number(record.timestamp ?? Date.parse(record.date)),
      open: toNumber(record.open),
      high: toNumber(record.high),
      low: toNumber(record.low),
      close: toNumber(record.close),
      volume: toNumber(record.volume),
      vwap: record.vwap != null ? Number(record.vwap) : undefined,
      transactions: record.transactions != null ? Number(record.transactions) : undefined,
    });
  }

  await reader.close();
  return rows;
}

async function readJsonFromUrl(url: string): Promise<Row[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch json: ${response.status} for ${url}`);
  }
  const payload = await response.json();
  const data = Array.isArray(payload) ? payload : [];
  return data.map((record: any) => ({
    ticker: String(record.ticker ?? "AAPL"),
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
  req: Request,
  ticker: string,
  startDate?: string,
  endDate?: string,
): Promise<Row[]> {
  const manifest = await loadManifest(req);
  const match = manifest.tickers.find((item) => item.ticker.toUpperCase() === ticker.toUpperCase());
  if (!match) return [];

  const origin = getOrigin(req);
  const url = match.url.startsWith("http") ? match.url : `${origin}${match.url}`;
  const rows = match.format === "json" ? await readJsonFromUrl(url) : await readParquetFromUrl(url);

  if (!startDate && !endDate) {
    return rows;
  }

  return rows.filter((row) => {
    const afterStart = startDate ? row.date >= startDate : true;
    const beforeEnd = endDate ? row.date <= endDate : true;
    return afterStart && beforeEnd;
  });
}

export interface TickerInfo {
  ticker: string;
  path: string;
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
      tickerCount: manifest.tickers.length,
    };
  } catch (error) {
    return {
      source: "local" as const,
      asOf: new Date().toISOString(),
      tickerCount: 0,
    };
  }
}

export function resolveTickerPath(manifest: Manifest, ticker: string, req: Request): string | null {
  const info = manifest.tickers.find((item) => item.ticker.toUpperCase() === ticker.toUpperCase());
  if (!info) return null;
  if (manifest.source === "blob" || info.url.startsWith("http")) {
    return info.url;
  }
  return `${getOrigin(req)}${info.url}`;
}

export async function safeReadParquet(req: Request, fallbackTicker = "AAPL"): Promise<Row[]> {
  return readTickerRange(req, fallbackTicker, "1900-01-01", "2099-12-31");
}
