// scripts/download-historical.js
const { PolygonClient } = require('../lib/polygon.ts');
const { DataManager } = require('../lib/data-manager.ts');
require('dotenv').config({ path: '.env.local' });

async function downloadHistoricalData() {
  console.log('📥 Starting historical data download...\n');
  
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not found');
    process.exit(1);
  }

  const polygon = new PolygonClient(apiKey);
  const dataManager = new DataManager(apiKey);

  // Configuration
  const config = {
    startDate: '2024-01-01',
    endDate: '2024-03-31',
    tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM'],
    batchSize: 5,
    delayMs: 500
  };

  console.log(`Configuration:
  📅 Date Range: ${config.startDate} to ${config.endDate}
  📊 Tickers: ${config.tickers.length} stocks
  ⚡ Batch Size: ${config.batchSize}
  ⏱️  Delay: ${config.delayMs}ms\n`);

  let totalRecords = 0;
  let successCount = 0;
  let errorCount = 0;

  // Process tickers in batches
  for (let i = 0; i < config.tickers.length; i += config.batchSize) {
    const batch = config.tickers.slice(i, i + config.batchSize);
    console.log(`Processing batch ${Math.floor(i / config.batchSize) + 1}: ${batch.join(', ')}`);

    const batchPromises = batch.map(async (ticker) => {
      try {
        const data = await dataManager.getComprehensiveData(
          ticker, 
          config.startDate, 
          config.endDate
        );
        console.log(`  ✅ ${ticker}: ${data.length} records`);
        totalRecords += data.length;
        successCount++;
        return { ticker, records: data.length, status: 'success' };
      } catch (error) {
        console.log(`  ❌ ${ticker}: ${error.message}`);
        errorCount++;
        return { ticker, error: error.message, status: 'error' };
      }
    });

    await Promise.all(batchPromises);
    
    // Delay between batches
    if (i + config.batchSize < config.tickers.length) {
      console.log(`  ⏱️  Waiting ${config.delayMs}ms...\n`);
      await new Promise(resolve => setTimeout(resolve, config.delayMs));
    }
  }

  console.log('\n📊 DOWNLOAD SUMMARY');
  console.log('===================');
  console.log(`Total Tickers Processed: ${config.tickers.length}`);
  console.log(`Successful Downloads: ${successCount}`);
  console.log(`Failed Downloads: ${errorCount}`);
  console.log(`Total Records Downloaded: ${totalRecords.toLocaleString()}`);
  console.log(`Success Rate: ${((successCount / config.tickers.length) * 100).toFixed(1)}%`);

  if (errorCount === 0) {
    console.log('\n🎉 All downloads completed successfully!');
  } else {
    console.log(`\n⚠️  ${errorCount} downloads failed. Check the logs above.`);
  }
}

// Run if called directly
if (require.main === module) {
  downloadHistoricalData()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Download failed:', error);
      process.exit(1);
    });
}

module.exports = { downloadHistoricalData };
