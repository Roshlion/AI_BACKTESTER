#!/usr/bin/env node

/**
 * Enhanced Manifest Generator with Real Parquet Analysis
 *
 * Scans a folder of per-ticker parquet files and generates a manifest.json with real analysis
 * Usage: node scripts/generate-manifest.mjs [options]
 */

import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
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
Enhanced Manifest Generator with Real Parquet Analysis

Usage:
  node scripts/generate-manifest.mjs [options]

Options:
  --limit=100               Only include first N tickers to keep repo small
  --from=./path             Input directory with parquet files (default: ./data/parquet-final)
  --out=./path              Output file path (default: ./public/manifest.json)
  --source=public           Set source type: 'public' or 'blob' (default: public)
  --help                    Show this help message

Source Types:
  public - For static files in /public/data/ (path: "/data/TICKER.parquet")
  blob   - For Vercel Blob storage (path: "__BLOB_URL__/TICKER.parquet")

Examples:
  # Generate manifest for public deployment (default)
  node scripts/generate-manifest.mjs --limit=100

  # Generate manifest for blob deployment (future)
  node scripts/generate-manifest.mjs --source=blob --limit=100

  # Use custom input/output paths
  node scripts/generate-manifest.mjs --from=./temp-data --out=./staging-manifest.json

  # No limit (include all tickers found)
  node scripts/generate-manifest.mjs --limit=0
`);
}

async function analyzeParquetFile(filePath) {
  try {
    // For JSON files (our current format), read and analyze
    if (filePath.endsWith('.json')) {
      const data = await fs.readJson(filePath);

      if (!Array.isArray(data) || data.length === 0) {
        return null;
      }

      // Sort by date to get accurate first/last dates
      const sorted = data.sort((a, b) => a.date.localeCompare(b.date));

      return {
        records: data.length,
        firstDate: sorted[0].date,
        lastDate: sorted[sorted.length - 1].date,
        ticker: data[0].ticker || 'UNKNOWN',
        // Additional metadata
        dateRange: sorted[sorted.length - 1].date !== sorted[0].date ?
          `${sorted[0].date} to ${sorted[sorted.length - 1].date}` : sorted[0].date,
        avgVolume: Math.round(data.reduce((sum, d) => sum + (d.volume || 0), 0) / data.length),
        priceRange: {
          low: Math.min(...data.map(d => d.low || 0)),
          high: Math.max(...data.map(d => d.high || 0))
        }
      };
    }

    // For actual .parquet files, we'd use parquetjs-lite to read them
    // For now, we'll add a placeholder implementation
    if (filePath.endsWith('.parquet')) {
      try {
        // Dynamic import to avoid loading parquetjs unless needed
        const { ParquetReader } = await import('parquetjs-lite');

        const buffer = await fs.readFile(filePath);
        const reader = await ParquetReader.openBuffer(buffer);
        const cursor = reader.getCursor();

        const rows = [];
        for (let row = await cursor.next(); row; row = await cursor.next()) {
          rows.push(row);
        }
        await reader.close();

        if (rows.length === 0) {
          return null;
        }

        // Sort and analyze
        const sorted = rows.sort((a, b) => {
          const dateA = a.date || new Date(a.timestamp).toISOString().slice(0, 10);
          const dateB = b.date || new Date(b.timestamp).toISOString().slice(0, 10);
          return dateA.localeCompare(dateB);
        });

        const firstDate = sorted[0].date || new Date(sorted[0].timestamp).toISOString().slice(0, 10);
        const lastDate = sorted[sorted.length - 1].date || new Date(sorted[sorted.length - 1].timestamp).toISOString().slice(0, 10);

        return {
          records: rows.length,
          firstDate,
          lastDate,
          ticker: rows[0].ticker || 'UNKNOWN',
          dateRange: lastDate !== firstDate ? `${firstDate} to ${lastDate}` : firstDate,
          avgVolume: Math.round(rows.reduce((sum, d) => sum + (d.volume || 0), 0) / rows.length),
          priceRange: {
            low: Math.min(...rows.map(d => d.low || 0)),
            high: Math.max(...rows.map(d => d.high || 0))
          }
        };
      } catch (error) {
        console.warn(`Warning: Could not read .parquet file ${filePath}: ${error.message}`);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return null;
  }
}

function generatePath(ticker, source) {
  if (source === 'blob') {
    // Placeholder for blob URLs - will be replaced by blob upload script
    return `__BLOB_URL__/${ticker}.parquet`;
  } else {
    // Public path - relative to site origin
    return `data/${ticker}.parquet`;
  }
}

function validateAnalysis(analysis) {
  if (!analysis) return false;
  if (!analysis.ticker || !analysis.firstDate || !analysis.lastDate) return false;
  if (analysis.records <= 0) return false;

  // Basic date format validation
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(analysis.firstDate) || !dateRegex.test(analysis.lastDate)) return false;

  return true;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  // Parse arguments with defaults
  const inputDir = args.from || './data/parquet-final';
  const outputPath = args.out || './public/manifest.json';
  const limit = args.limit ? parseInt(args.limit, 10) : 100;
  const source = args.source || 'public';

  // Validate source
  if (!['public', 'blob'].includes(source)) {
    console.error('Error: --source must be either "public" or "blob"');
    process.exit(1);
  }

  // Validate limit
  if (isNaN(limit) || limit < 0) {
    console.error('Error: --limit must be a non-negative number (0 = no limit)');
    process.exit(1);
  }

  console.log(`
Enhanced Manifest Generator
===========================
Input Directory: ${inputDir}
Output File: ${outputPath}
Source Type: ${source}
Ticker Limit: ${limit === 0 ? 'none' : limit}
`);

  // Check if input directory exists
  if (!(await fs.pathExists(inputDir))) {
    console.error(`Error: Input directory does not exist: ${inputDir}`);
    process.exit(1);
  }

  // Scan for data files
  const files = await fs.readdir(inputDir);
  const dataFiles = files.filter(file =>
    (file.endsWith('.parquet') || file.endsWith('.json')) &&
    !file.includes('summary') &&
    !file.includes('metadata')
  );

  if (dataFiles.length === 0) {
    console.error(`Error: No parquet or JSON files found in ${inputDir}`);
    process.exit(1);
  }

  console.log(`Found ${dataFiles.length} data files`);

  // Sort files for consistent ordering
  dataFiles.sort();

  // Apply limit if specified
  const filesToProcess = limit > 0 ? dataFiles.slice(0, limit) : dataFiles;

  if (filesToProcess.length < dataFiles.length) {
    console.log(`Processing first ${filesToProcess.length} files (limited by --limit=${limit})`);
  }

  // Analyze files and build ticker info
  const tickers = [];
  const analysisResults = [];
  let processed = 0;
  let skipped = 0;

  console.log('\nAnalyzing files...');

  for (const file of filesToProcess) {
    const filePath = join(inputDir, file);
    console.log(`Analyzing ${file}...`);

    const analysis = await analyzeParquetFile(filePath);

    if (validateAnalysis(analysis)) {
      const tickerInfo = {
        ticker: analysis.ticker,
        path: generatePath(analysis.ticker, source),
        firstDate: analysis.firstDate,
        lastDate: analysis.lastDate,
        records: analysis.records
      };

      tickers.push(tickerInfo);
      analysisResults.push({
        file,
        ticker: analysis.ticker,
        ...analysis
      });

      console.log(`  ✓ ${analysis.ticker}: ${analysis.records.toLocaleString()} records (${analysis.dateRange})`);
      processed++;
    } else {
      console.log(`  ✗ Skipped ${file}: Could not analyze or invalid data`);
      skipped++;
    }
  }

  if (tickers.length === 0) {
    console.error('Error: No valid data files could be processed');
    process.exit(1);
  }

  // Sort tickers alphabetically
  tickers.sort((a, b) => a.ticker.localeCompare(b.ticker));
  analysisResults.sort((a, b) => a.ticker.localeCompare(b.ticker));

  // Calculate summary statistics
  const totalRecords = tickers.reduce((sum, t) => sum + t.records, 0);
  const dateRange = {
    earliest: tickers.reduce((min, t) => min < t.firstDate ? min : t.firstDate, '9999-12-31'),
    latest: tickers.reduce((max, t) => max > t.lastDate ? max : t.lastDate, '1900-01-01')
  };

  // Generate manifest
  const manifest = {
    version: 1,
    source: source,
    asOf: new Date().toISOString(),
    tickers: tickers,
    metadata: {
      generated: new Date().toISOString(),
      totalTickers: tickers.length,
      totalRecords,
      dateRange,
      generator: 'generate-manifest.mjs v2.0'
    }
  };

  // Ensure output directory exists
  await fs.ensureDir(dirname(outputPath));

  // Write manifest
  await fs.writeJson(outputPath, manifest, { spaces: 2 });

  // Write detailed analysis report
  const reportPath = outputPath.replace('.json', '-analysis.json');
  await fs.writeJson(reportPath, {
    manifest: manifest.metadata,
    analysis: analysisResults,
    summary: {
      processed,
      skipped,
      totalFiles: filesToProcess.length,
      averageRecordsPerTicker: Math.round(totalRecords / tickers.length)
    }
  }, { spaces: 2 });

  console.log(`
Manifest Generated Successfully
===============================
Output: ${outputPath}
Analysis Report: ${reportPath}

Summary:
--------
Tickers: ${tickers.length}
Total Records: ${totalRecords.toLocaleString()}
Date Range: ${dateRange.earliest} to ${dateRange.latest}
Source: ${source}
Processed: ${processed} files
Skipped: ${skipped} files

Size Estimation:
----------------`);

  // Estimate file sizes if public mode
  if (source === 'public') {
    let estimatedSizeMB = 0;
    for (const result of analysisResults) {
      // Rough estimate: ~100 bytes per record for JSON format
      const sizeMB = (result.records * 100) / (1024 * 1024);
      estimatedSizeMB += sizeMB;
    }

    console.log(`Estimated public/ size: ${estimatedSizeMB.toFixed(1)} MB`);

    if (estimatedSizeMB > 80) {
      console.log(`
⚠️  WARNING: Estimated size (${estimatedSizeMB.toFixed(1)} MB) is quite large for Git repository!
   Consider reducing --limit or using Blob storage for production.
   Recommended: --limit=40 for ~40-50 MB repo size.`);
    } else if (estimatedSizeMB > 50) {
      console.log(`
⚠️  Size (${estimatedSizeMB.toFixed(1)} MB) is getting large for Git.
   Monitor repo size and consider Blob storage for scaling.`);
    } else {
      console.log(`Size looks good for Git repository (${estimatedSizeMB.toFixed(1)} MB).`);
    }
  }

  console.log(`
Top Tickers by Records:
-----------------------`);
  analysisResults
    .sort((a, b) => b.records - a.records)
    .slice(0, 10)
    .forEach((result, i) => {
      console.log(`${i + 1}.`.padStart(3) + ` ${result.ticker}: ${result.records.toLocaleString()} records`);
    });

  console.log(`\nNext steps:`);
  if (source === 'public') {
    console.log('1. Run: npm run data:stage --clean=1');
    console.log('2. Check public/ directory size');
    console.log('3. Run: npm run smoke');
    console.log('4. Commit and deploy to Vercel');
  } else {
    console.log('1. Run: node scripts/blob-upload.mjs (when implemented)');
    console.log('2. Set PARQUET_URL environment variable');
    console.log('3. Run: npm run smoke');
    console.log('4. Deploy to Vercel');
  }
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