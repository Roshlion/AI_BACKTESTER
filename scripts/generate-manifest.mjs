#!/usr/bin/env node

/**
 * Manifest generator that scans a directory of parquet files and emits
 * public/manifest.json entries that point at those files. The manifest drives
 * dataset discovery in the dashboard and API routes.
 */

import { fileURLToPath } from "url";
import { dirname, join, resolve, basename } from "path";
import fs from "fs-extra";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    options[key] = value ?? true;
  }
  return options;
}

function usage() {
  console.log(`\nManifest generator\n===================\n\nUsage:\n  node scripts/generate-manifest.mjs [options]\n\nOptions:\n  --from=./dir          Directory containing per-ticker parquet files (default: ./data/parquet-final)\n  --out=./file          Manifest output path (default: ./public/manifest.json)\n  --limit=50            Only include the first N files (0 disables the limit)\n  --source=local|blob   Set manifest source flag (default: local)\n  --base-url=https://.. Base URL for blob mode (default: derived from source)\n  --help                Show this help message\n`);
}

async function readParquetMetadata(filePath) {
  // Load parquet rows so we can extract record count and date range metadata.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - dynamic import keeps parquetjs-lite optional.
  const { ParquetReader } = await import("parquetjs-lite");
  const buffer = await fs.readFile(filePath);
  const reader = await ParquetReader.openBuffer(buffer);
  const cursor = reader.getCursor();

  let first = null;
  let last = null;
  let count = 0;

  for (let row = await cursor.next(); row; row = await cursor.next()) {
    count += 1;
    if (!first) first = row;
    last = row;
  }

  await reader.close();

  if (!first || !last) {
    return null;
  }

  const toDate = (value) => {
    if (!value) return undefined;
    if (typeof value === "string") return value.slice(0, 10);
    const timestamp = typeof value === "bigint" ? Number(value) : Number(value);
    return new Date(timestamp).toISOString().slice(0, 10);
  };

  return {
    records: count,
    firstDate: toDate(first.date ?? first.timestamp),
    lastDate: toDate(last.date ?? last.timestamp),
  };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    usage();
    process.exit(0);
  }

  const inputDir = resolve(__dirname, "..", args.from ?? "data/parquet-final");
  const outputPath = resolve(__dirname, "..", args.out ?? "public/manifest.json");
  const source = (args.source ?? "local").toLowerCase();
  const limit = args.limit ? Number(args.limit) : 50;
  const baseUrl = args["base-url"];

  if (![`local`, `blob`].includes(source)) {
    console.error("--source must be 'local' or 'blob'");
    process.exit(1);
  }

  if (!(await fs.pathExists(inputDir))) {
    console.error(`Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  const files = (await fs.readdir(inputDir))
    .filter((name) => name.toLowerCase().endsWith(".parquet"))
    .sort();

  if (files.length === 0) {
    console.error(`No parquet files found in ${inputDir}`);
    process.exit(1);
  }

  const selected = limit > 0 ? files.slice(0, limit) : files;
  const tickers = [];

  for (const file of selected) {
    const filePath = join(inputDir, file);
    const ticker = basename(file, ".parquet").toUpperCase();

    try {
      const metadata = await readParquetMetadata(filePath);
      if (!metadata) continue;

      const url = source === "local"
        ? `/${file}`
        : `${(baseUrl ?? "").replace(/\/$/, "")}/${file}`;

      tickers.push({
        ticker,
        url,
        format: "parquet",
        records: metadata.records,
        firstDate: metadata.firstDate,
        lastDate: metadata.lastDate,
        sizeBytes: (await fs.stat(filePath)).size,
      });
    } catch (error) {
      console.warn(`Skipping ${file}: ${(error instanceof Error ? error.message : error)}`);
    }
  }

  const manifest = {
    version: 1,
    source,
    asOf: new Date().toISOString(),
    tickers,
  };

  await fs.ensureDir(dirname(outputPath));
  await fs.writeJson(outputPath, manifest, { spaces: 2 });

  console.log(`Manifest written to ${outputPath}`);
  console.log(`Included tickers: ${tickers.length}`);
}

main().catch((error) => {
  console.error("Manifest generation failed", error);
  process.exit(1);
});