#!/usr/bin/env node

/**
 * Enhanced Polygon Data Fetcher with Flat Files and REST Support
 *
 * Downloads daily aggregates from Polygon API using Flat Files first, REST fallback.
 * Supports resume-safe operations, exponential backoff, and various input modes.
 *
 * Usage:
 *   node scripts/fetch-polygon-to-parquet.mjs --tickers=AAPL,MSFT --mode=auto
 *   node scripts/fetch-polygon-to-parquet.mjs --tickers-file=./data/tickers/sp100.txt --years=3
 *   node scripts/fetch-polygon-to-parquet.mjs --mode=flat --years=2
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs-extra';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import zlib from 'zlib';
import readline from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      parsed[key] = value || 'true';
    }
  }

  return parsed;
}

function showHelp() {
  console.log(`
Enhanced Polygon Data Fetcher

Usage:
  node scripts/fetch-polygon-to-parquet.mjs [options]

Options:
  --mode=auto|flat|rest       Data source mode (default: auto)
                              auto: try flat files first, fallback to REST
                              flat: use Polygon Flat Files (CSV bulk downloads)
                              rest: use REST API /v2/aggs
  --tickers=AAPL,MSFT,...     Comma-separated list of ticker symbols
  --tickers-file=./path       Path to file with one ticker per line
  --years=3                   Fetch last N years of data (derives start/end)
  --start=YYYY-MM-DD          Start date (required if --years not used)
  --end=YYYY-MM-DD            End date (required if --years not used)
  --limit-per-ticker=N        Optional cap on bars per ticker for testing
  --out=./path                Output directory (default: ./data/parquet-final)
  --concurrency=2             Max concurrent requests (default: 2)
  --help                      Show this help message

Environment:
  POLYGON_API_KEY            Required: Your Polygon API key

Resume Features:
  - Automatically detects existing files and only fetches missing data
  - Safe to interrupt and restart
  - Exponential backoff on rate limits (429) and server errors (5xx)

Examples:
  # Auto mode: try Flat Files first, fallback to REST
  node scripts/fetch-polygon-to-parquet.mjs --tickers-file=./data/tickers/sp100.txt --years=3 --mode=auto

  # Flat Files only (faster, bulk CSV downloads)
  node scripts/fetch-polygon-to-parquet.mjs --tickers=AAPL,MSFT,GOOGL --mode=flat --years=2

  # REST API only (more compatible, rate limited)
  node scripts/fetch-polygon-to-parquet.mjs --tickers=AAPL,MSFT --mode=rest --start=2022-01-01 --end=2024-12-31

  # Resume interrupted download
  node scripts/fetch-polygon-to-parquet.mjs --tickers-file=./data/tickers/sp100.txt --years=3
`);
}

// Calculate date range based on years (end = today - 2 days to avoid lag)
function calculateDateRange(years) {
  const endDate = new Date(Date.now() - 2 * 24 * 3600 * 1000); // today - 2d
  const startDate = new Date(endDate);
  startDate.setFullYear(endDate.getFullYear() - years);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(startDate), end: fmt(endDate) };
}

// Read tickers from file
async function readTickersFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim().toUpperCase())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    throw new Error(`Failed to read tickers file ${filePath}: ${error.message}`);
  }
}

// Check existing parquet file coverage
async function checkExistingCoverage(filePath) {
  try {
    if (!(await fs.pathExists(filePath))) {
      return null;
    }

    // For JSON files (our current format), read and check coverage
    if (filePath.endsWith('.json')) {
      const data = await fs.readJson(filePath);
      if (!Array.isArray(data) || data.length === 0) {
        return null;
      }

      const sorted = data.sort((a, b) => a.date.localeCompare(b.date));
      return {
        firstDate: sorted[0].date,
        lastDate: sorted[sorted.length - 1].date,
        records: data.length
      };
    }

    // For actual .parquet files, we'd need parquetjs to read them
    // For now, assume we need to refetch .parquet files
    console.log(`Found existing ${filePath} but cannot analyze .parquet format yet`);
    return null;
  } catch (error) {
    console.log(`Error checking existing coverage for ${filePath}: ${error.message}`);
    return null;
  }
}

// Sleep with exponential backoff
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// S3 client factory for Polygon Flat Files
function getS3Client() {
  const endpoint = process.env.POLYGON_S3_ENDPOINT || 'https://files.polygon.io';
  const accessKeyId = process.env.POLYGON_FLATFILES_KEY;
  const secretAccessKey = process.env.POLYGON_FLATFILES_SECRET;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Flat Files credentials missing: set POLYGON_FLATFILES_KEY and POLYGON_FLATFILES_SECRET in .env.local');
  }
  return new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function pick(obj, names) {
  for (const n of names) if (obj[n] != null && obj[n] !== '') return obj[n];
  return undefined;
}

// Normalize columns across flat-file variants
function mapCsvRow(obj) {
  const ticker = String(pick(obj, ['ticker', 'symbol']) ?? '').toUpperCase();

  // window_start might be epoch-ns; day/date is ISO; normalize to YYYY-MM-DD
  let iso = '';
  const ws = pick(obj, ['window_start', 'day', 'date']);
  if (ws) {
    if (/^\d{13,}$/.test(String(ws))) {
      const ms = String(ws).length > 13 ? Number(String(ws).slice(0, 13)) : Number(ws);
      iso = new Date(ms).toISOString().slice(0, 10);
    } else {
      iso = String(ws).slice(0, 10);
    }
  }
  const ts = Date.parse(iso ? `${iso}T16:00:00Z` : (pick(obj, ['timestamp']) ?? 0));

  const open = Number(pick(obj, ['open', 'o']));
  const high = Number(pick(obj, ['high', 'h']));
  const low = Number(pick(obj, ['low', 'l']));
  const close = Number(pick(obj, ['close', 'c']));
  const volume = Number(pick(obj, ['volume', 'v']));
  const vwap = pick(obj, ['vwap', 'vw']);
  const transactions = pick(obj, ['transactions', 'n']);

  return {
    ticker,
    date: iso,
    timestamp: ts,
    open, high, low, close, volume,
    vwap: vwap != null ? Number(vwap) : undefined,
    transactions: transactions != null ? Number(transactions) : undefined,
  };
}

async function listDayAggKeys(s3, startDate, endDate) {
  const bucket = process.env.POLYGON_S3_BUCKET || 'flatfiles';
  // Data set path: us_stocks_sip/day_aggs_v1/YYYY/MM/2024-01-03.csv.gz
  const keys = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (monthCursor <= end) {
    const y = monthCursor.getFullYear();
    const m = String(monthCursor.getMonth() + 1).padStart(2, '0');
    const Prefix = `us_stocks_sip/day_aggs_v1/${y}/${m}/`;

    let ContinuationToken;
    do {
      const out = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken }));
      for (const obj of out.Contents ?? []) {
        const key = obj.Key ?? '';
        const mDate = key.match(/(\d{4}-\d{2}-\d{2})\.csv\.gz$/);
        if (!mDate) continue;
        const date = mDate[1];
        if (date >= startDate && date <= endDate) keys.push({ key, date });
      }
      ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (ContinuationToken);

    monthCursor.setMonth(monthCursor.getMonth() + 1, 1);
  }

  keys.sort((a, b) => a.date.localeCompare(b.date));
  return keys;
}

// True Flat Files fetcher via S3 (day aggregates)
async function downloadFlatFileData(_apiKey, ticker, startDate, endDate, options = {}) {
  const { limitPerTicker } = options;
  const want = new Set([String(ticker).toUpperCase()]);
  const s3 = getS3Client();
  const bucket = process.env.POLYGON_S3_BUCKET || 'flatfiles';

  const keys = await listDayAggKeys(s3, startDate, endDate);
  if (!keys.length) throw new Error('No files in Flat Files for requested range');

  const out = [];
  for (const { key } of keys) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const gunzip = zlib.createGunzip();
    const rl = readline.createInterface({ input: obj.Body.pipe(gunzip), crlfDelay: Infinity });

    let header = null;
    for await (const line of rl) {
      if (!line) continue;
      if (!header) { header = line.split(','); continue; }
      const cols = line.split(',');
      const rowObj = Object.fromEntries(header.map((h, i) => [h, cols[i]]));
      const mapped = mapCsvRow(rowObj);
      if (mapped.ticker && want.has(mapped.ticker) && mapped.date) {
        out.push(mapped);
        if (limitPerTicker && out.length >= limitPerTicker) break;
      }
    }
    if (limitPerTicker && out.length >= limitPerTicker) break;
    await sleep(50); // tiny politeness pause
  }

  if (!out.length) throw new Error('No data available via Flat Files');

  // Sort + de-dup by timestamp
  out.sort((a, b) => a.timestamp - b.timestamp);
  const uniq = Array.from(new Map(out.map(r => [r.timestamp, r])).values())
                    .sort((a, b) => a.timestamp - b.timestamp);

  console.log(`✓ ${ticker}: Flat Files returned ${uniq.length} bars`);
  return uniq;
}

// Generate array of dates between start and end
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    // Skip weekends (Saturday = 6, Sunday = 0)
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(current.toISOString().slice(0, 10));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// Fetch data from Polygon with retry logic
async function fetchPolygonBarsWithRetry(apiKey, ticker, startDate, endDate, options = {}) {
  const { bar = 'day', limitPerTicker, maxRetries = 3 } = options;

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const baseUrl = 'https://api.polygon.io/v2/aggs/ticker';
      let url = `${baseUrl}/${ticker}/range/1/${bar}/${startDate}/${endDate}?adjusted=true&sort=asc`;

      if (limitPerTicker) {
        url += `&limit=${limitPerTicker}`;
      } else {
        url += `&limit=50000`;
      }

      url += `&apikey=${apiKey}`;

      const response = await fetch(url);

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        console.log(`Rate limited for ${ticker}, backing off ${backoffMs.toFixed(0)}ms...`);
        await sleep(backoffMs);
        attempt++;
        continue;
      }

      // Handle server errors with backoff
      if (response.status >= 500) {
        const backoffMs = Math.pow(2, attempt) * 2000;
        console.log(`Server error ${response.status} for ${ticker}, backing off ${backoffMs.toFixed(0)}ms...`);
        await sleep(backoffMs);
        attempt++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== 'OK') {
        if (data.status === 'ERROR' && data.error_found) {
          console.log(`No data available for ${ticker} in range ${startDate} to ${endDate}`);
          return [];
        }
        throw new Error(`API Error: ${data.status} - ${data.error || 'Unknown error'}`);
      }

      if (!data.results || data.results.length === 0) {
        console.log(`No data found for ${ticker} in range`);
        return [];
      }

      // Transform to our standard format and sort by timestamp
      const bars = data.results.map(bar => ({
        ticker: ticker.toUpperCase(),
        date: new Date(bar.t).toISOString().slice(0, 10),
        timestamp: bar.t,
        open: Number(bar.o),
        high: Number(bar.h),
        low: Number(bar.l),
        close: Number(bar.c),
        volume: Number(bar.v),
        vwap: bar.vw ? Number(bar.vw) : undefined,
        transactions: bar.n ? Number(bar.n) : undefined
      })).sort((a, b) => a.timestamp - b.timestamp);

      return bars;

    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }

      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`Attempt ${attempt} failed for ${ticker}: ${error.message}. Retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
    }
  }
}

// Process single ticker with resume support and mode selection
async function processTicker(apiKey, ticker, startDate, endDate, outputDir, options = {}) {
  const { mode = 'auto' } = options;
  const filePath = join(outputDir, `${ticker}.json`); // Using .json for now

  // Check existing coverage
  const existing = await checkExistingCoverage(filePath);
  let fetchStartDate = startDate;

  if (existing) {
    // If we have data covering or past the end date, skip
    if (existing.lastDate >= endDate) {
      console.log(`✓ ${ticker}: Already up to date (${existing.records} records, ${existing.firstDate} to ${existing.lastDate})`);
      return {
        ticker,
        skipped: true,
        existing: existing.records,
        dateRange: `${existing.firstDate} to ${existing.lastDate}`,
        method: 'cached'
      };
    }

    // Resume from day after last date
    const nextDay = new Date(existing.lastDate);
    nextDay.setDate(nextDay.getDate() + 1);
    fetchStartDate = nextDay.toISOString().slice(0, 10);

    console.log(`→ ${ticker}: Resuming from ${fetchStartDate} (has data until ${existing.lastDate})`);
  }

  let newBars = [];
  let method = 'unknown';

  try {
    // Choose fetching method based on mode
    if (mode === 'flat') {
      newBars = await downloadFlatFileData(apiKey, ticker, fetchStartDate, endDate, options);
      method = 'flat';
    } else if (mode === 'rest') {
      newBars = await fetchPolygonBarsWithRetry(apiKey, ticker, fetchStartDate, endDate, options);
      method = 'rest';
    } else { // auto
      try {
        newBars = await downloadFlatFileData(apiKey, ticker, fetchStartDate, endDate, options);
        method = 'flat';
      } catch (e) {
        newBars = await fetchPolygonBarsWithRetry(apiKey, ticker, fetchStartDate, endDate, options);
        method = 'rest';
      }
    }

    let allBars = newBars;

    // Merge with existing data if resuming
    if (existing && newBars.length > 0) {
      const existingData = await fs.readJson(filePath);
      allBars = [...existingData, ...newBars];

      // Remove duplicates and sort
      const unique = Array.from(
        new Map(allBars.map(bar => [bar.timestamp, bar])).values()
      ).sort((a, b) => a.timestamp - b.timestamp);

      allBars = unique;
    }

    // Save data
    if (allBars.length > 0) {
      await fs.ensureDir(outputDir);
      await fs.writeJson(filePath, allBars, { spaces: 2 });

      const firstDate = allBars[0].date;
      const lastDate = allBars[allBars.length - 1].date;

      console.log(`✓ ${ticker}: ${allBars.length} total records (${firstDate} to ${lastDate}) [${method.toUpperCase()}] ${existing ? '[RESUMED]' : '[NEW]'}`);

      return {
        ticker,
        success: true,
        records: allBars.length,
        newRecords: newBars.length,
        dateRange: `${firstDate} to ${lastDate}`,
        resumed: !!existing,
        method
      };
    } else {
      console.log(`- ${ticker}: No data available in range`);
      return {
        ticker,
        success: false,
        records: 0,
        error: 'No data available',
        method
      };
    }

  } catch (error) {
    console.error(`✗ ${ticker}: ${error.message}`);
    return {
      ticker,
      success: false,
      records: 0,
      error: error.message,
      method
    };
  }
}

// Concurrent processing with throttling
async function processTickersConcurrent(apiKey, tickers, startDate, endDate, outputDir, options = {}) {
  const { concurrency = 3 } = options;
  const results = [];

  // Process in batches
  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    const batchPromises = batch.map(ticker =>
      processTicker(apiKey, ticker, startDate, endDate, outputDir, options)
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to be respectful
    if (i + concurrency < tickers.length) {
      await sleep(500);
    }
  }

  return results;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  // Validate environment
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('Error: POLYGON_API_KEY environment variable is required');
    process.exit(1);
  }

  // Parse tickers
  let tickers = [];
  if (args.tickers) {
    tickers = args.tickers.split(',').map(t => t.trim().toUpperCase());
  } else if (args['tickers-file']) {
    tickers = await readTickersFile(args['tickers-file']);
  } else {
    console.error('Error: Either --tickers or --tickers-file is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  // Parse date range
  let startDate, endDate;
  if (args.years) {
    const range = calculateDateRange(parseInt(args.years, 10));
    startDate = range.start;
    endDate = range.end;
  } else if (args.start && args.end) {
    startDate = args.start;
    endDate = args.end;
  } else {
    console.error('Error: Either --years or both --start and --end are required');
    process.exit(1);
  }

  // Clamp endDate safely and honor --end even when --years is provided
  const clampEnd = (inputISO) => {
    const userEnd = inputISO ? new Date(inputISO + 'T00:00:00Z') : null;
    const safeMax = new Date(Date.now() - 2 * 24 * 3600 * 1000); // today-2d
    const chosen = userEnd && userEnd < safeMax ? userEnd : safeMax;
    return chosen.toISOString().slice(0, 10);
  };
  endDate = clampEnd(endDate);

  // Parse other options
  const outputDir = args.out || './data/parquet-final';
  const mode = args.mode || 'auto';
  const limitPerTicker = args['limit-per-ticker'] ? parseInt(args['limit-per-ticker'], 10) : null;
  const concurrency = args.concurrency ? parseInt(args.concurrency, 10) : 2;

  // Validate mode
  if (!['auto', 'flat', 'rest'].includes(mode)) {
    console.error('Error: --mode must be one of: auto, flat, rest');
    process.exit(1);
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    console.error('Error: Dates must be in YYYY-MM-DD format');
    process.exit(1);
  }

  console.log(`
Enhanced Polygon Data Fetcher with Flat Files Support
======================================================
Mode: ${mode} (${mode === 'auto' ? 'Flat Files first, REST fallback' : mode === 'flat' ? 'Flat Files only' : 'REST API only'})
Tickers: ${tickers.length} symbols
Date Range: ${startDate} to ${endDate}
Output Directory: ${outputDir}
Concurrency: ${concurrency}
Limit per Ticker: ${limitPerTicker || 'unlimited'}
API Key: ${apiKey.slice(0, 8)}...

Starting fetch with resume support...
`);

  const startTime = Date.now();
  const results = await processTickersConcurrent(apiKey, tickers, startDate, endDate, outputDir, {
    mode,
    limitPerTicker,
    concurrency
  });

  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);

  // Summary
  const successful = results.filter(r => r.success || r.skipped);
  const failed = results.filter(r => !r.success && !r.skipped);
  const resumed = results.filter(r => r.resumed);
  const skipped = results.filter(r => r.skipped);

  // Method statistics
  const methodStats = {
    flat: results.filter(r => r.method === 'flat').length,
    rest: results.filter(r => r.method === 'rest').length,
    cached: results.filter(r => r.method === 'cached').length
  };

  console.log(`
Summary
=======
Duration: ${duration}s
Successful: ${successful.length}/${results.length} tickers
Failed: ${failed.length} tickers
Resumed: ${resumed.length} tickers
Skipped (up to date): ${skipped.length} tickers
Total Records: ${successful.reduce((sum, r) => sum + (r.records || r.existing || 0), 0).toLocaleString()}

Method Breakdown:
- Flat Files: ${methodStats.flat} tickers
- REST API: ${methodStats.rest} tickers
- Cached: ${methodStats.cached} tickers
`);

  if (successful.length > 0) {
    console.log('Successful downloads:');
    successful.forEach(r => {
      if (r.skipped) {
        console.log(`  ${r.ticker}: ${r.existing} records (up to date) ${r.dateRange}`);
      } else {
        console.log(`  ${r.ticker}: ${r.records} records (${r.newRecords} new) ${r.dateRange}`);
      }
    });
  }

  if (failed.length > 0) {
    console.log('\nFailed downloads:');
    failed.forEach(r => {
      console.log(`  ${r.ticker}: ${r.error}`);
    });
  }

  // Save detailed summary
  const summaryPath = join(outputDir, 'fetch-summary.json');
  await fs.ensureDir(outputDir);
  await fs.writeJson(summaryPath, {
    timestamp: new Date().toISOString(),
    dateRange: { start: startDate, end: endDate },
    options: { mode, limitPerTicker, concurrency },
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      resumed: resumed.length,
      skipped: skipped.length,
      duration,
      methodStats
    },
    results
  }, { spaces: 2 });

  console.log(`\nDetailed summary saved to ${summaryPath}`);
  console.log('\nNext steps:');
  console.log('1. Run: npm run data:manifest');
  console.log('2. Run: npm run data:stage');
  console.log('3. Test: npm run smoke');

  process.exit(failed.length > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});