import type { Row } from "@/types/row";
import { S3_BASE } from "@/lib/env";

export type CsvRow = Row;

export function parseCsvToRows(csv: string): CsvRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (!lines.length) return [];

  const header = lines.shift() ?? "";
  const columns = header.split(",").map((value) => value.trim().toLowerCase());

  const dateIndex = columns.indexOf("date");
  const openIndex = columns.indexOf("open");
  const highIndex = columns.indexOf("high");
  const lowIndex = columns.indexOf("low");
  const closeIndex = columns.indexOf("close");
  const volumeIndex = columns.indexOf("volume");
  const tickerIndex = columns.indexOf("ticker");

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(","))
    .map((parts) => {
      const tickerValue = tickerIndex >= 0 ? parts[tickerIndex] ?? "" : "";
      const dateValue = dateIndex >= 0 ? parts[dateIndex] ?? "" : "";
      const openValue = openIndex >= 0 ? parts[openIndex] ?? "" : "";
      const highValue = highIndex >= 0 ? parts[highIndex] ?? "" : "";
      const lowValue = lowIndex >= 0 ? parts[lowIndex] ?? "" : "";
      const closeValue = closeIndex >= 0 ? parts[closeIndex] ?? "" : "";
      const volumeValue = volumeIndex >= 0 ? parts[volumeIndex] ?? "" : "";

      return {
        ticker: tickerValue.toUpperCase(),
        date: dateValue,
        timestamp: Date.parse(dateValue),
        open: Number(openValue || 0),
        high: Number(highValue || 0),
        low: Number(lowValue || 0),
        close: Number(closeValue || 0),
        volume: Number(volumeValue || 0),
      };
    });
}

export async function loadCsv(symbol: string): Promise<CsvRow[]> {
  const url = `${S3_BASE}/datasets/${symbol.toUpperCase()}.csv`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`CSV fetch failed ${res.status} for ${symbol}`);
  }
  const text = await res.text();
  return parseCsvToRows(text);
}

export async function loadParquet(symbol: string): Promise<Row[]> {
  const url = `${S3_BASE}/${symbol.toUpperCase()}.parquet`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Parquet fetch failed ${res.status} for ${symbol}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const { ParquetReader } = await import("parquetjs-lite");
  const reader = await ParquetReader.openBuffer(buffer);
  const cursor = reader.getCursor();
  const rows: Row[] = [];

  for (let record = await cursor.next(); record; record = await cursor.next()) {
    rows.push({
      ticker: String(record.ticker ?? symbol).toUpperCase(),
      date: typeof record.date === "string" ? record.date.slice(0, 10) : new Date(Number(record.date ?? record.timestamp ?? 0)).toISOString().slice(0, 10),
      timestamp: Number(record.timestamp ?? Date.parse(record.date)),
      open: Number(record.open ?? 0),
      high: Number(record.high ?? 0),
      low: Number(record.low ?? 0),
      close: Number(record.close ?? 0),
      volume: Number(record.volume ?? 0),
      vwap: record.vwap != null ? Number(record.vwap) : undefined,
      transactions: record.transactions != null ? Number(record.transactions) : undefined,
    });
  }

  await reader.close();
  return rows;
}
