// scripts/test-pipeline.js
const { PolygonClient } = require('../lib/polygon.ts');
const { DataManager } = require('../lib/data-manager.ts');
require('dotenv').config({ path: '.env.local' });

async function runComprehensiveTests() {
  console.log('🚀 Starting comprehensive pipeline tests...\n');
  
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not found in environment variables');
    process.exit(1);
  }

  const polygon = new PolygonClient(apiKey);
  const dataManager = new DataManager(apiKey);
  
  const results = [];

  // Test 1: Basic API connectivity
  console.log('Test 1: Basic API connectivity...');
  try {
    const response = await polygon.getBars('AAPL', 'day', 1, '2024-01-01', '2024-01-05');
    console.log(`✅ API connectivity: ${response.results?.length || 0} records retrieved`);
    results.push({ test: 'API Connectivity', status: 'PASS', records: response.results?.length || 0 });
  } catch (error) {
    console.log(`❌ API connectivity failed: ${error.message}`);
    results.push({ test: 'API Connectivity', status: 'FAIL', error: error.message });
  }

  // Test 2: Multiple ticker data retrieval
  console.log('\nTest 2: Multiple ticker data retrieval...');
  try {
    const tickers = ['MSFT', 'GOOGL', 'AMZN'];
    let totalRecords = 0;
    
    for (const ticker of tickers) {
      const data = await dataManager.downloadHistoricalData(ticker, '2024-01-01', '2024-01-03');
      totalRecords += data.length;
      console.log(`  ${ticker}: ${data.length} records`);
      
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`✅ Multiple ticker retrieval: ${totalRecords} total records`);
    results.push({ test: 'Multiple Ticker Retrieval', status: 'PASS', records: totalRecords });
  } catch (error) {
    console.log(`❌ Multiple ticker retrieval failed: ${error.message}`);
    results.push({ test: 'Multiple Ticker Retrieval', status: 'FAIL', error: error.message });
  }

  // Test 3: Data gap detection
  console.log('\nTest 3: Data gap detection...');
  try {
    const missingRanges = await dataManager.getMissingDataRanges('TSLA', '2024-01-01', '2024-01-10');
    console.log(`✅ Gap detection: ${missingRanges.length} missing ranges found`);
    results.push({ test: 'Gap Detection', status: 'PASS', gaps: missingRanges.length });
  } catch (error) {
    console.log(`❌ Gap detection failed: ${error.message}`);
    results.push({ test: 'Gap Detection', status: 'FAIL', error: error.message });
  }

  // Test 4: Comprehensive data pipeline
  console.log('\nTest 4: Comprehensive data pipeline...');
  try {
    const comprehensiveData = await dataManager.getComprehensiveData('NFLX', '2024-01-01', '2024-01-05');
    console.log(`✅ Comprehensive pipeline: ${comprehensiveData.length} records processed`);
    results.push({ test: 'Comprehensive Pipeline', status: 'PASS', records: comprehensiveData.length });
  } catch (error) {
    console.log(`❌ Comprehensive pipeline failed: ${error.message}`);
    results.push({ test: 'Comprehensive Pipeline', status: 'FAIL', error: error.message });
  }

  // Test 5: Large ticker list retrieval
  console.log('\nTest 5: Large ticker list retrieval...');
  try {
    const tickers = await polygon.getTickers({ limit: 100 });
    console.log(`✅ Ticker list: ${tickers.results?.length || 0} tickers retrieved`);
    results.push({ test: 'Ticker List Retrieval', status: 'PASS', tickers: tickers.results?.length || 0 });
  } catch (error) {
    console.log(`❌ Ticker list retrieval failed: ${error.message}`);
    results.push({ test: 'Ticker List Retrieval', status: 'FAIL', error: error.message });
  }

  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Your pipeline is ready for production.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
  }

  return results;
}

// Run if called directly
if (require.main === module) {
  runComprehensiveTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = { runComprehensiveTests };
