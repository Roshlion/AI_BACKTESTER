import fs from "fs-extra";
import path from "path";
import { ParquetSchema, ParquetWriter, ParquetReader } from "parquetjs-lite";
import { mapSicToCategory } from "./sic-map";

export type DailyBar = {
  ticker: string;
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
};

export type TickerDetail = {
  ticker: string;
  name?: string;
  sic?: number;
  sector?: string;
  industry?: string;
  marketCap?: number;
};

export type ManifestEntry = {
  ticker: string;
  name?: string;
  sector?: string;
  industry?: string;
  records: number;
  firstDate?: string;
  lastDate?: string;
  marketCap?: number;
  url: string;
  source: string;
};

export interface BuildContext {
  polygonApiKey?: string;
  usePolygonForBars: boolean;
  outputDir: string;
}

const PARQUET_SCHEMA = new ParquetSchema({
  ticker: { type: "UTF8" },
  date: { type: "UTF8" },
  o: { type: "DOUBLE" },
  h: { type: "DOUBLE" },
  l: { type: "DOUBLE" },
  c: { type: "DOUBLE" },
  v: { type: "DOUBLE" },
  vw: { type: "DOUBLE", optional: true },
});

export function sanitiseTickerForFile(ticker: string): string {
  return ticker.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function readTickerSeed(csvPath: string): Promise<string[]> {
  const content = await fs.readFile(csvPath, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const [header, ...rows] = lines;
  const headerLower = header.toLowerCase();
  if (headerLower.includes(",")) {
    const tickerColIndex = 0;
    return rows
      .map((row) => row.split(",")[tickerColIndex]?.trim())
      .filter((value): value is string => !!value);
  }

  if (headerLower === "ticker") {
    return rows;
  }

  return lines;
}

async function fetchJson(url: string, apiKey?: string) {
  const requestUrl = apiKey ? (url.includes("?") ? `${url}&apiKey=${apiKey}` : `${url}?apiKey=${apiKey}`) : url;
  const response = await fetch(requestUrl, { headers: { "content-type": "application/json" } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}) ${response.statusText}: ${body}`);
  }
  return response.json();
}

export async function fetchDailyBarsFromPolygon(
  ticker: string,
  apiKey: string,
  start = "2000-01-01",
  end?: string,
): Promise<DailyBar[]> {
  const results: DailyBar[] = [];
  let url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${start}/${
    end ?? new Date().toISOString().slice(0, 10)
  }?adjusted=true&limit=50000&sort=asc`;

  while (url) {
    const payload: any = await fetchJson(url, apiKey);
    const bars: any[] = payload.results ?? [];
    for (const bar of bars) {
      const date = new Date(bar.t ?? 0).toISOString().slice(0, 10);
      results.push({
        ticker,
        date,
        o: Number(bar.o ?? 0),
        h: Number(bar.h ?? 0),
        l: Number(bar.l ?? 0),
        c: Number(bar.c ?? 0),
        v: Number(bar.v ?? 0),
        vw: bar.vw != null ? Number(bar.vw) : undefined,
      });
    }
    url = payload.next_url ?? "";
  }

  return results;
}

export async function writeBarsToParquet(filePath: string, bars: DailyBar[]): Promise<void> {
  if (!bars.length) {
    throw new Error("Cannot write empty dataset to parquet");
  }

  await fs.ensureDir(path.dirname(filePath));
  const writer = await ParquetWriter.openFile(PARQUET_SCHEMA, filePath);

  for (const row of bars) {
    await writer.appendRow(row);
  }

  await writer.close();
}

export async function readParquetSummary(
  filePath: string,
): Promise<{ records: number; firstDate?: string; lastDate?: string }> {
  const reader = await ParquetReader.openFile(filePath);
  const cursor = reader.getCursor();
  let recordCount = 0;
  let firstDate: string | undefined;
  let lastDate: string | undefined;

  for (let row = await cursor.next(); row; row = await cursor.next()) {
    recordCount += 1;
    const date = typeof row.date === "string" ? row.date : new Date(Number(row.date ?? 0)).toISOString().slice(0, 10);
    if (!firstDate || date < firstDate) firstDate = date;
    if (!lastDate || date > lastDate) lastDate = date;
  }

  await reader.close();
  return { records: recordCount, firstDate, lastDate };
}

export async function fetchTickerMetadata(ticker: string, apiKey?: string): Promise<TickerDetail> {
  if (!apiKey) {
    return { ticker };
  }

  try {
    const data: any = await fetchJson(
      `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}`,
      apiKey,
    );
    const result = data.results ?? {};
    const sic = result.sic_code ? Number(result.sic_code) : undefined;
    const category = mapSicToCategory(sic);
    return {
      ticker,
      name: result.name ?? result.description ?? undefined,
      sic,
      sector: result.sector ?? category.sector,
      industry: result.industry ?? category.industry,
      marketCap: result.market_cap ?? undefined,
    };
  } catch (error) {
    return { ticker };
  }
}

export async function ensureTickerDataset(
  ticker: string,
  context: BuildContext,
): Promise<{ parquetPath: string; summary: ManifestEntry | null }> {
  const sanitisedTicker = sanitiseTickerForFile(ticker.toUpperCase());
  const parquetPath = path.join(context.outputDir, `${sanitisedTicker}.parquet`);
  const exists = await fs.pathExists(parquetPath);

  if (!exists && context.usePolygonForBars) {
    if (!context.polygonApiKey) {
      throw new Error("POLYGON_API_KEY is required when USE_POLYGON_FOR_BARS=true");
    }
    const bars = await fetchDailyBarsFromPolygon(ticker, context.polygonApiKey);
    if (bars.length) {
      await writeBarsToParquet(parquetPath, bars);
    }
  }

  if (!(await fs.pathExists(parquetPath))) {
    return { parquetPath, summary: null };
  }

  const summary = await readParquetSummary(parquetPath);
  const metadata = await fetchTickerMetadata(ticker, context.polygonApiKey);

  return {
    parquetPath,
    summary: {
      ticker: ticker.toUpperCase(),
      name: metadata.name,
      sector: metadata.sector,
      industry: metadata.industry,
      marketCap: metadata.marketCap,
      records: summary.records,
      firstDate: summary.firstDate,
      lastDate: summary.lastDate,
      url: `/${sanitisedTicker}.parquet`,
      source: "local",
    },
  };
}