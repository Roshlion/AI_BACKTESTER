const fs = require('fs-extra');
const path = require('path');
const parquet = require('parquetjs-lite');

const INPUT_DIR = path.join(process.cwd(), 'data', 'parquet');
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'parquet-final');
const LOG_DIR = path.join(process.cwd(), 'data', 'logs');
const METADATA_FILE = path.join(OUTPUT_DIR, 'metadata.json');

const parquetSchema = new parquet.ParquetSchema({
  ticker: { type: 'UTF8', compression: 'GZIP' },
  date: { type: 'UTF8', compression: 'GZIP' },
  timestamp: { type: 'INT64', compression: 'GZIP' },
  open: { type: 'DOUBLE', compression: 'GZIP' },
  high: { type: 'DOUBLE', compression: 'GZIP' },
  low: { type: 'DOUBLE', compression: 'GZIP' },
  close: { type: 'DOUBLE', compression: 'GZIP' },
  volume: { type: 'INT64', compression: 'GZIP' },
  vwap: { type: 'DOUBLE', compression: 'GZIP', optional: true },
  transactions: { type: 'INT32', compression: 'GZIP', optional: true },
});

async function ensureDirectories() {
  await fs.ensureDir(INPUT_DIR);
  await fs.ensureDir(OUTPUT_DIR);
  await fs.ensureDir(LOG_DIR);
}

function normalizeRecord(record) {
  return {
    ticker: record.ticker,
    date: record.date,
    timestamp: Number(record.timestamp ?? record.t),
    open: Number(record.open ?? record.o),
    high: Number(record.high ?? record.h),
    low: Number(record.low ?? record.l),
    close: Number(record.close ?? record.c),
    volume: Number(record.volume ?? record.v),
    vwap: record.vwap !== undefined ? Number(record.vwap) : record.vw !== undefined ? Number(record.vw) : null,
    transactions: record.transactions !== undefined ? Number(record.transactions) : record.n !== undefined ? Number(record.n) : null,
  };
}

async function convertFile(filePath) {
  const fileName = path.basename(filePath);
  const ticker = fileName.replace(/_structured\.json$/i, '').toUpperCase();
  const outputPath = path.join(OUTPUT_DIR, `${ticker}.parquet`);

  const jsonStats = await fs.stat(filePath);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`No data rows found in ${fileName}`);
  }

  const rows = parsed.map(normalizeRecord);
  const dates = rows.map((row) => row.date);
  const minDate = dates.reduce((min, current) => (current < min ? current : min), dates[0]);
  const maxDate = dates.reduce((max, current) => (current > max ? current : max), dates[0]);

  const writer = await parquet.ParquetWriter.openFile(parquetSchema, outputPath, {
    useDataPageV2: false,
    useCompression: true,
    compression: 'GZIP',
  });

  try {
    for (const row of rows) {
      await writer.appendRow(row);
    }
  } finally {
    await writer.close();
  }

  const parquetStats = await fs.stat(outputPath);

  return {
    ticker,
    records: rows.length,
    startDate: minDate,
    endDate: maxDate,
    jsonSize: jsonStats.size,
    parquetSize: parquetStats.size,
    jsonFile: path.relative(process.cwd(), filePath),
    parquetFile: path.relative(process.cwd(), outputPath),
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, exponent)).toFixed(2)} ${units[exponent]}`;
}

async function buildMetadata(results) {
  const totals = results.reduce(
    (acc, item) => {
      acc.tickers += 1;
      acc.records += item.records;
      acc.jsonBytes += item.jsonSize;
      acc.parquetBytes += item.parquetSize;
      return acc;
    },
    { tickers: 0, records: 0, jsonBytes: 0, parquetBytes: 0 }
  );

  const reduction = totals.jsonBytes > 0
    ? 100 - (totals.parquetBytes / totals.jsonBytes) * 100
    : 0;

  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      tickers: totals.tickers,
      records: totals.records,
      jsonSizeBytes: totals.jsonBytes,
      parquetSizeBytes: totals.parquetBytes,
      jsonSizeHuman: formatBytes(totals.jsonBytes),
      parquetSizeHuman: formatBytes(totals.parquetBytes),
      reductionPercent: Number(reduction.toFixed(2)),
    },
    files: results.map((item) => ({
      ticker: item.ticker,
      records: item.records,
      startDate: item.startDate,
      endDate: item.endDate,
      jsonSizeBytes: item.jsonSize,
      parquetSizeBytes: item.parquetSize,
      jsonPath: item.jsonFile,
      parquetPath: item.parquetFile,
      reductionPercent: item.jsonSize > 0
        ? Number((100 - (item.parquetSize / item.jsonSize) * 100).toFixed(2))
        : 0,
    })),
  };

  await fs.writeJson(METADATA_FILE, payload, { spaces: 2 });
  return payload;
}

async function main() {
  console.log('🔁 Starting parquet conversion...');
  await ensureDirectories();

  const files = (await fs.readdir(INPUT_DIR))
    .filter((file) => file.toLowerCase().endsWith('_structured.json'))
    .sort();

  if (files.length === 0) {
    console.log('ℹ️  No structured JSON files found. Ensure data/parquet contains *_structured.json files.');
    return;
  }

  const results = [];
  for (const [index, file] of files.entries()) {
    const filePath = path.join(INPUT_DIR, file);
    const label = `${index + 1}/${files.length}`;
    console.log(`📦 [${label}] Converting ${file}...`);

    try {
      const result = await convertFile(filePath);
      results.push(result);
      const reduction = result.jsonSize > 0
        ? (100 - (result.parquetSize / result.jsonSize) * 100).toFixed(2)
        : '0.00';
      console.log(
        `   ✅ ${result.ticker}: ${result.records} rows | ${formatBytes(result.jsonSize)} → ${formatBytes(result.parquetSize)} (${reduction}% smaller)`
      );
    } catch (error) {
      console.error(`   ❌ Failed to convert ${file}:`, error.message);
    }
  }

  if (results.length === 0) {
    console.log('⚠️  No files were converted successfully.');
    return;
  }

  const metadata = await buildMetadata(results);
  console.log('\n📊 Conversion summary');
  console.log(`   Tickers: ${metadata.summary.tickers}`);
  console.log(`   Records: ${metadata.summary.records}`);
  console.log(
    `   Size: ${metadata.summary.jsonSizeHuman} → ${metadata.summary.parquetSizeHuman} (${metadata.summary.reductionPercent}% smaller)`
  );
  console.log(`   Metadata saved to ${path.relative(process.cwd(), METADATA_FILE)}`);
}

main().catch((error) => {
  console.error('Unexpected error during parquet conversion:', error);
  process.exitCode = 1;
});
