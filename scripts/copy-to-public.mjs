#!/usr/bin/env node

/**
 * Copy Parquet Files to Public Directory
 *
 * Copies selected parquet files to public/data/ ensuring exact <TICKER>.parquet naming
 * Usage: node scripts/copy-to-public.mjs [options]
 */

import { fileURLToPath } from 'url';
import { dirname, join, basename, extname } from 'path';
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
      parsed[key] = value;
    }
  }

  return parsed;
}

function showHelp() {
  console.log(`
Copy Parquet Files to Public Directory

Usage:
  node scripts/copy-to-public.mjs [options]

Options:
  --input=./path          Input directory with parquet files (default: ./data/parquet-final)
  --output=./path         Output directory (default: ./public/data)
  --manifest=./path       Manifest file to read ticker list from (default: ./public/manifest.json)
  --clean                 Clean output directory before copying
  --format=json           Convert .json files to .parquet naming (default: preserve)
  --help                  Show this help message

Examples:
  node scripts/copy-to-public.mjs
  node scripts/copy-to-public.mjs --input=./temp-data --clean
  node scripts/copy-to-public.mjs --manifest=./custom-manifest.json
`);
}

async function getTickersFromManifest(manifestPath) {
  try {
    if (!(await fs.pathExists(manifestPath))) {
      console.log(`Manifest not found at ${manifestPath}, will copy all files`);
      return null;
    }

    const manifest = await fs.readJson(manifestPath);

    if (!manifest.tickers || !Array.isArray(manifest.tickers)) {
      console.log(`Invalid manifest format, will copy all files`);
      return null;
    }

    return manifest.tickers.map(t => t.ticker.toUpperCase());
  } catch (error) {
    console.log(`Error reading manifest: ${error.message}, will copy all files`);
    return null;
  }
}

function extractTickerFromFilename(filename) {
  // Remove extension and extract ticker
  const nameWithoutExt = basename(filename, extname(filename));
  return nameWithoutExt.toUpperCase();
}

function generateOutputFilename(ticker, inputFile, format) {
  // Always ensure .parquet extension for consistency
  if (format === 'json' && inputFile.endsWith('.json')) {
    // For now, keep as .json since we don't have parquet writing capability
    return `${ticker}.json`;
  }

  return `${ticker}.parquet`;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  // Parse arguments
  const inputDir = args.input || './data/parquet-final';
  const outputDir = args.output || './public/data';
  const manifestPath = args.manifest || './public/manifest.json';
  const clean = args.clean === 'true' || args.clean === '' || args.clean === '1';
  const format = args.format || 'preserve';

  console.log(`
Enhanced Copy to Public Directory
==================================
Input Directory: ${inputDir}
Output Directory: ${outputDir}
Manifest: ${manifestPath}
Clean Output: ${clean}
Format: ${format}
`);

  // Check if input directory exists
  if (!(await fs.pathExists(inputDir))) {
    console.error(`Error: Input directory does not exist: ${inputDir}`);
    process.exit(1);
  }

  // Get ticker list from manifest (if available)
  const allowedTickers = await getTickersFromManifest(manifestPath);

  // Ensure output directory exists
  await fs.ensureDir(outputDir);

  // Clean output directory if requested
  if (clean) {
    console.log('Cleaning output directory...');
    await fs.emptyDir(outputDir);
  }

  // Scan for parquet/json files
  const files = await fs.readdir(inputDir);
  const dataFiles = files.filter(file =>
    file.endsWith('.parquet') || file.endsWith('.json')
  );

  if (dataFiles.length === 0) {
    console.error(`Error: No parquet or JSON files found in ${inputDir}`);
    process.exit(1);
  }

  console.log(`Found ${dataFiles.length} data files`);

  // Copy files
  const copied = [];
  const skipped = [];

  for (const file of dataFiles) {
    const ticker = extractTickerFromFilename(file);

    // Check if ticker is allowed (if manifest filtering is enabled)
    if (allowedTickers && !allowedTickers.includes(ticker)) {
      skipped.push({ file, reason: 'Not in manifest' });
      continue;
    }

    const inputPath = join(inputDir, file);
    const outputFilename = generateOutputFilename(ticker, file, format);
    const outputPath = join(outputDir, outputFilename);

    try {
      await fs.copy(inputPath, outputPath);

      // Get file stats
      const stats = await fs.stat(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      copied.push({
        ticker,
        inputFile: file,
        outputFile: outputFilename,
        sizeMB: fileSizeMB
      });

      console.log(`✓ ${ticker}: ${file} → ${outputFilename} (${fileSizeMB} MB)`);
    } catch (error) {
      console.error(`✗ ${ticker}: Failed to copy ${file} - ${error.message}`);
      skipped.push({ file, reason: error.message });
    }
  }

  // Summary
  console.log(`
Copy Summary
============
Copied: ${copied.length} files
Skipped: ${skipped.length} files
Total Size: ${copied.reduce((sum, f) => sum + parseFloat(f.sizeMB), 0).toFixed(2)} MB
`);

  if (copied.length > 0) {
    console.log('Successfully copied:');
    copied.forEach(f => {
      console.log(`  ${f.ticker}: ${f.sizeMB} MB`);
    });
  }

  if (skipped.length > 0) {
    console.log('\nSkipped files:');
    skipped.forEach(f => {
      console.log(`  ${f.file}: ${f.reason}`);
    });
  }

  // Check total size warning
  const totalSizeMB = copied.reduce((sum, f) => sum + parseFloat(f.sizeMB), 0);
  if (totalSizeMB > 100) {
    console.log(`
⚠️  Warning: Total size is ${totalSizeMB.toFixed(2)} MB
   Consider using fewer tickers or Vercel Blob storage for production.
   Git repositories work best with <50MB of data files.
`);
  }

  console.log('\nNext steps:');
  console.log('1. Commit changes to git');
  console.log('2. Deploy to Vercel');
  console.log('3. Test endpoints with: npm run smoke');

  // Save copy summary
  const summaryPath = join(outputDir, 'copy-summary.json');
  await fs.writeJson(summaryPath, {
    timestamp: new Date().toISOString(),
    totalFiles: copied.length,
    totalSizeMB: totalSizeMB,
    files: copied
  }, { spaces: 2 });

  console.log(`\nCopy summary saved to ${summaryPath}`);
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