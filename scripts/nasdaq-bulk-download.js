// scripts/nasdaq-bulk-download.js
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

// NASDAQ 20 - Top tickers by market cap
const NASDAQ_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 
  'ADBE', 'CRM', 'PYPL', 'INTC', 'AMD', 'QCOM', 'AVGO', 'TXN', 
  'COST', 'TMUS', 'PEP', 'CMCSA'
];

class PolygonBulkDownloader {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.polygon.io';
    this.dataDir = './data';
    this.requestCount = 0;
    this.requestLimit = 5; // API rate limit per minute
    this.rateLimitWindow = 60000; // 1 minute
    this.lastRequestTime = 0;
  }

  async ensureDirectories() {
    const dirs = [
      path.join(this.dataDir, 'raw'),
      path.join(this.dataDir, 'parquet'),
      path.join(this.dataDir, 'metadata'),
      path.join(this.dataDir, 'logs')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < 12000) { // 12 seconds between requests
      const waitTime = 12000 - timeSinceLastRequest;
      console.log(`  Rate limiting: waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  async makeRequest(url) {
    await this.rateLimit();
    
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            this.requestCount++;
            resolve(result);
          } catch (error) {
            reject(new Error(`JSON parse error: ${error.message}`));
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  async downloadTickerData(ticker, startDate, endDate) {
    console.log(`\n📊 Downloading ${ticker} (${startDate} to ${endDate})`);
    
    const url = `${this.baseUrl}/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apikey=${this.apiKey}`;
    
    try {
      const response = await this.makeRequest(url);
      
      if (response.status === 'OK' && response.results) {
        console.log(`  ✅ ${response.results.length} records downloaded`);
        
        // Save raw data
        const fileName = `${ticker}_${startDate}_${endDate}.json`;
        const filePath = path.join(this.dataDir, 'raw', fileName);
        
        const dataToSave = {
          ticker,
          startDate,
          endDate,
          downloadedAt: new Date().toISOString(),
          recordCount: response.results.length,
          data: response.results
        };
        
        await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
        console.log(`  💾 Saved to ${fileName}`);
        
        return response.results;
      } else {
        console.log(`  ❌ No data: ${response.status}`);
        return [];
      }
    } catch (error) {
      console.log(`  💥 Error: ${error.message}`);
      return [];
    }
  }

  async convertToParquet(ticker, data) {
    // For now, save as structured JSON (parquet conversion coming next)
    console.log(`  🔄 Converting ${ticker} to structured format...`);
    
    const structuredData = data.map(bar => ({
      ticker,
      date: new Date(bar.t).toISOString().split('T')[0],
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      vwap: bar.vw || null,
      transactions: bar.n || null
    }));

    const fileName = `${ticker}_structured.json`;
    const filePath = path.join(this.dataDir, 'parquet', fileName);
    
    await fs.writeFile(filePath, JSON.stringify(structuredData, null, 2));
    console.log(`  ✅ Structured data saved: ${structuredData.length} records`);
    
    return structuredData;
  }

  async downloadBulkData() {
    console.log('🚀 Starting NASDAQ Bulk Download Pipeline\n');
    console.log(`📋 Tickers: ${NASDAQ_TICKERS.length}`);
    console.log(`📅 Date Range: 2024-01-01 to 2024-03-31 (Q1 2024)`);
    console.log(`⚡ Rate Limit: 12 seconds between requests\n`);

    await this.ensureDirectories();

    const results = {
      startTime: new Date().toISOString(),
      tickers: [],
      summary: {
        totalTickers: NASDAQ_TICKERS.length,
        successfulDownloads: 0,
        failedDownloads: 0,
        totalRecords: 0,
        totalRequests: 0
      }
    };

    // Download each ticker
    for (let i = 0; i < NASDAQ_TICKERS.length; i++) {
      const ticker = NASDAQ_TICKERS[i];
      console.log(`\n[${i + 1}/${NASDAQ_TICKERS.length}] Processing ${ticker}...`);
      
      try {
        const data = await this.downloadTickerData(ticker, '2024-01-01', '2024-03-31');
        
        if (data.length > 0) {
          const structuredData = await this.convertToParquet(ticker, data);
          
          results.tickers.push({
            ticker,
            status: 'success',
            records: data.length,
            structuredRecords: structuredData.length,
            downloadedAt: new Date().toISOString()
          });
          
          results.summary.successfulDownloads++;
          results.summary.totalRecords += data.length;
        } else {
          results.tickers.push({
            ticker,
            status: 'no_data',
            records: 0,
            downloadedAt: new Date().toISOString()
          });
          
          results.summary.failedDownloads++;
        }
      } catch (error) {
        console.log(`  💥 Failed: ${error.message}`);
        
        results.tickers.push({
          ticker,
          status: 'error',
          error: error.message,
          downloadedAt: new Date().toISOString()
        });
        
        results.summary.failedDownloads++;
      }
    }

    results.endTime = new Date().toISOString();
    results.summary.totalRequests = this.requestCount;
    
    // Save summary
    const summaryPath = path.join(this.dataDir, 'logs', `download_summary_${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(results, null, 2));

    // Print final summary
    console.log('\n📊 DOWNLOAD SUMMARY');
    console.log('===================');
    console.log(`Total Tickers: ${results.summary.totalTickers}`);
    console.log(`Successful: ${results.summary.successfulDownloads}`);
    console.log(`Failed: ${results.summary.failedDownloads}`);
    console.log(`Total Records: ${results.summary.totalRecords.toLocaleString()}`);
    console.log(`API Requests: ${results.summary.totalRequests}`);
    console.log(`Success Rate: ${((results.summary.successfulDownloads / results.summary.totalTickers) * 100).toFixed(1)}%`);
    
    const duration = new Date(results.endTime) - new Date(results.startTime);
    console.log(`Duration: ${Math.round(duration / 1000)}s`);
    
    console.log(`\n💾 Summary saved to: ${summaryPath}`);
    
    if (results.summary.successfulDownloads > 0) {
      console.log('\n🎉 Bulk download completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Review data in ./data/raw/ and ./data/parquet/');
      console.log('2. Test loading data in the backtester');
      console.log('3. Convert to actual parquet format');
    } else {
      console.log('\n⚠️  No data was downloaded. Check your API key and connection.');
    }

    return results;
  }
}

// Run if called directly
if (require.main === module) {
  const apiKey = process.env.POLYGON_API_KEY || 'WyA_GP15p18tK0OSz8_5OS7VEqnu3gad';
  
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not found');
    process.exit(1);
  }

  const downloader = new PolygonBulkDownloader(apiKey);
  
  downloader.downloadBulkData()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('💥 Bulk download failed:', error);
      process.exit(1);
    });
}

module.exports = { PolygonBulkDownloader };