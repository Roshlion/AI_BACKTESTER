// scripts/update-daily.js
const { PolygonClient } = require('../lib/polygon.ts');
const { DataManager } = require('../lib/data-manager.ts');
const { format, subDays } = require('date-fns');
require('dotenv').config({ path: '.env.local' });

async function updateDailyData() {
  console.log('🔄 Starting daily data update...\n');
  
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not found');
    process.exit(1);
  }

  const polygon = new PolygonClient(apiKey);
  const dataManager = new DataManager(apiKey);

  // Get yesterday's date (market data is usually available next day)
  const yesterday = subDays(new Date(), 1);
  const updateDate = format(yesterday, 'yyyy-MM-dd');
  
  console.log(`📅 Updating data for: ${updateDate}\n`);

  // Popular tickers to update daily
  const tickers = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX',
    'ADBE', 'CRM', 'PYPL', 'INTC', 'AMD', 'UBER', 'LYFT', 'SPOT',
    'ZOOM', 'WORK', 'SQ', 'ROKU', 'SNAP', 'TWTR', 'BA', 'DIS'
  ];

  let successCount = 0;
  let errorCount = 0;
  let totalRecords = 0;

  console.log(`🎯 Updating ${tickers.length} tickers for ${updateDate}...\n`);

  for (const ticker of tickers) {
    try {
      const data = await dataManager.downloadHistoricalData(
        ticker,
        updateDate,
        updateDate
      );
      
      if (data.length > 0) {
        console.log(`✅ ${ticker}: ${data.length} records updated`);
        totalRecords += data.length;
        successCount++;
      } else {
        console.log(`⚠️  ${ticker}: No data available (market closed?)`);
      }
      
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.log(`❌ ${ticker}: ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n📊 UPDATE SUMMARY');
  console.log('=================');
  console.log(`Date: ${updateDate}`);
  console.log(`Total Tickers: ${tickers.length}`);
  console.log(`Successful Updates: ${successCount}`);
  console.log(`Failed Updates: ${errorCount}`);
  console.log(`Total Records: ${totalRecords}`);
  console.log(`Success Rate: ${((successCount / tickers.length) * 100).toFixed(1)}%`);

  if (errorCount === 0) {
    console.log('\n🎉 Daily update completed successfully!');
  } else {
    console.log(`\n⚠️  ${errorCount} updates failed.`);
  }
}

// Run if called directly
if (require.main === module) {
  updateDailyData()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Daily update failed:', error);
      process.exit(1);
    });
}

module.exports = { updateDailyData };
