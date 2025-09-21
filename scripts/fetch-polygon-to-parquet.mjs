#!/usr/bin/env node

/**
 * Enhanced Polygon Data Fetcher with Resume Support
 *
 * Downloads daily aggregates from Polygon API and saves as per-ticker parquet files.
 * Supports resume-safe operations, exponential backoff, and various input modes.
 *
 * Usage:
 *   node scripts/fetch-polygon-to-parquet.mjs --tickers=AAPL,MSFT
 *   node scripts/fetch-polygon-to-parquet.mjs --tickers-file=./data/tickers/sp100.txt
 *   node scripts/fetch-polygon-to-parquet.mjs --years=3
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs-extra';

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
  --tickers=AAPL,MSFT,...     Comma-separated list of ticker symbols
  --tickers-file=./path       Path to file with one ticker per line
  --years=3                   Fetch last N years of data (derives start/end)
  --start=YYYY-MM-DD          Start date (required if --years not used)
  --end=YYYY-MM-DD            End date (required if --years not used)
  --bar=day                   Bar interval (default: day)
  --limit-per-ticker=N        Optional cap on bars per ticker for testing
  --out=./path                Output directory (default: ./data/parquet-final)
  --concurrency=3             Max concurrent requests (default: 3)
  --help                      Show this help message

Environment:
  POLYGON_API_KEY            Required: Your Polygon API key

Resume Features:
  - Automatically detects existing files and only fetches missing data
  - Safe to interrupt and restart
  - Exponential backoff on rate limits (429) and server errors (5xx)

Examples:
  # Fetch 3 years of data for all SP100 tickers
  node scripts/fetch-polygon-to-parquet.mjs --tickers-file=./data/tickers/sp100.txt --years=3

  # Fetch specific tickers with date range
  node scripts/fetch-polygon-to-parquet.mjs --tickers=AAPL,MSFT,GOOGL --start=2022-01-01 --end=2024-12-31

  # Resume interrupted download
  node scripts/fetch-polygon-to-parquet.mjs --tickers-file=./data/tickers/sp100.txt --years=3
`);
}

// Calculate date range based on years
function calculateDateRange(years) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - years);

  // Format as YYYY-MM-DD
  const formatDate = (date) => date.toISOString().slice(0, 10);

  return {
    start: formatDate(startDate),
    end: formatDate(endDate)
  };
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

// Process single ticker with resume support
async function processTicker(apiKey, ticker, startDate, endDate, outputDir, options = {}) {
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
        dateRange: `${existing.firstDate} to ${existing.lastDate}`
      };
    }

    // Resume from day after last date
    const nextDay = new Date(existing.lastDate);
    nextDay.setDate(nextDay.getDate() + 1);
    fetchStartDate = nextDay.toISOString().slice(0, 10);

    console.log(`→ ${ticker}: Resuming from ${fetchStartDate} (has data until ${existing.lastDate})`);
  }

  try {
    // Fetch new/missing data
    const newBars = await fetchPolygonBarsWithRetry(apiKey, ticker, fetchStartDate, endDate, options);

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

      console.log(`✓ ${ticker}: ${allBars.length} total records (${firstDate} to ${lastDate}) ${existing ? '[RESUMED]' : '[NEW]'}`);

      return {
        ticker,
        success: true,
        records: allBars.length,
        newRecords: newBars.length,
        dateRange: `${firstDate} to ${lastDate}`,
        resumed: !!existing
      };
    } else {
      console.log(`- ${ticker}: No data available in range`);
      return {
        ticker,
        success: false,
        records: 0,
        error: 'No data available'
      };
    }

  } catch (error) {
    console.error(`✗ ${ticker}: ${error.message}`);
    return {
      ticker,
      success: false,
      records: 0,
      error: error.message
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

  // Parse other options
  const outputDir = args.out || './data/parquet-final';
  const bar = args.bar || 'day';
  const limitPerTicker = args['limit-per-ticker'] ? parseInt(args['limit-per-ticker'], 10) : null;
  const concurrency = args.concurrency ? parseInt(args.concurrency, 10) : 3;

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    console.error('Error: Dates must be in YYYY-MM-DD format');
    process.exit(1);
  }

  console.log(`
Enhanced Polygon Data Fetcher
=============================
Tickers: ${tickers.length} symbols
Date Range: ${startDate} to ${endDate}
Bar Interval: ${bar}
Output Directory: ${outputDir}
Concurrency: ${concurrency}
Limit per Ticker: ${limitPerTicker || 'unlimited'}
API Key: ${apiKey.slice(0, 8)}...

Starting fetch with resume support...
`);

  const startTime = Date.now();
  const results = await processTickersConcurrent(apiKey, tickers, startDate, endDate, outputDir, {
    bar,
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

  console.log(`
Summary
=======
Duration: ${duration}s
Successful: ${successful.length}/${results.length} tickers
Failed: ${failed.length} tickers
Resumed: ${resumed.length} tickers
Skipped (up to date): ${skipped.length} tickers
Total Records: ${successful.reduce((sum, r) => sum + (r.records || r.existing || 0), 0).toLocaleString()}
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
    options: { bar, limitPerTicker, concurrency },
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      resumed: resumed.length,
      skipped: skipped.length,
      duration
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