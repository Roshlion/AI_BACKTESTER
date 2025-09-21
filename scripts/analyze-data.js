// scripts/analyze-data.js
const fs = require('fs').promises;
const path = require('path');

class DataAnalyzer {
  constructor() {
    this.dataDir = './data';
  }

  async analyzeDownloadedData() {
    console.log('🔍 Analyzing Downloaded Data\n');

    try {
      // Check directory structure
      const dirs = ['raw', 'parquet', 'metadata', 'logs'];
      const dirStatus = {};
      
      for (const dir of dirs) {
        const dirPath = path.join(this.dataDir, dir);
        try {
          const files = await fs.readdir(dirPath);
          dirStatus[dir] = {
            exists: true,
            fileCount: files.length,
            files: files.slice(0, 5) // Show first 5 files
          };
        } catch {
          dirStatus[dir] = { exists: false, fileCount: 0, files: [] };
        }
      }

      console.log('📁 Directory Structure:');
      for (const [dir, status] of Object.entries(dirStatus)) {
        console.log(`  ${dir}/: ${status.exists ? '✅' : '❌'} (${status.fileCount} files)`);
        if (status.files.length > 0) {
          status.files.forEach(file => console.log(`    - ${file}`));
        }
      }

      // Analyze raw data
      if (dirStatus.raw.fileCount > 0) {
        console.log('\n📊 Raw Data Analysis:');
        await this.analyzeRawFiles();
      }

      // Analyze structured data
      if (dirStatus.parquet.fileCount > 0) {
        console.log('\n🔧 Structured Data Analysis:');
        await this.analyzeStructuredFiles();
      }

      // Show latest log
      if (dirStatus.logs.fileCount > 0) {
        console.log('\n📋 Latest Download Log:');
        await this.showLatestLog();
      }

    } catch (error) {
      console.error('Analysis failed:', error.message);
    }
  }

  async analyzeRawFiles() {
    const rawDir = path.join(this.dataDir, 'raw');
    const files = await fs.readdir(rawDir);
    
    let totalRecords = 0;
    let totalFileSize = 0;
    const tickerStats = {};

    for (const file of files.slice(0, 10)) { // Analyze first 10 files
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(rawDir, file);
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf8');
          const data = JSON.parse(content);
          
          totalFileSize += stats.size;
          totalRecords += data.recordCount || 0;
          
          const ticker = data.ticker;
          if (ticker) {
            tickerStats[ticker] = {
              records: data.recordCount || 0,
              dateRange: `${data.startDate} to ${data.endDate}`,
              fileSize: `${(stats.size / 1024).toFixed(1)}KB`
            };
          }
        } catch (error) {
          console.log(`  ⚠️ Error reading ${file}: ${error.message}`);
        }
      }
    }

    console.log(`  Total Records: ${totalRecords.toLocaleString()}`);
    console.log(`  Total Size: ${(totalFileSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Files Analyzed: ${Object.keys(tickerStats).length}`);
    
    console.log('\n  Top Tickers:');
    const sortedTickers = Object.entries(tickerStats)
      .sort((a, b) => b[1].records - a[1].records)
      .slice(0, 5);
    
    for (const [ticker, stats] of sortedTickers) {
      console.log(`    ${ticker}: ${stats.records} records (${stats.fileSize})`);
    }
  }

  async analyzeStructuredFiles() {
    const parquetDir = path.join(this.dataDir, 'parquet');
    const files = await fs.readdir(parquetDir);
    
    let totalRecords = 0;
    const sampleData = [];

    for (const file of files.slice(0, 5)) { // Analyze first 5 structured files
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(parquetDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const data = JSON.parse(content);
          
          totalRecords += data.length;
          
          if (data.length > 0 && sampleData.length < 3) {
            sampleData.push({
              ticker: data[0].ticker,
              sampleRecord: data[0],
              totalRecords: data.length
            });
          }
        } catch (error) {
          console.log(`  ⚠️ Error reading ${file}: ${error.message}`);
        }
      }
    }

    console.log(`  Total Structured Records: ${totalRecords.toLocaleString()}`);
    
    if (sampleData.length > 0) {
      console.log('\n  Sample Records:');
      sampleData.forEach(sample => {
        console.log(`    ${sample.ticker} (${sample.totalRecords} records):`);
        console.log(`      Date: ${sample.sampleRecord.date}`);
        console.log(`      OHLC: $${sample.sampleRecord.open} / $${sample.sampleRecord.high} / $${sample.sampleRecord.low} / $${sample.sampleRecord.close}`);
        console.log(`      Volume: ${sample.sampleRecord.volume.toLocaleString()}`);
      });
    }
  }

  async showLatestLog() {
    const logsDir = path.join(this.dataDir, 'logs');
    const files = await fs.readdir(logsDir);
    const logFiles = files.filter(f => f.startsWith('download_summary_'));
    
    if (logFiles.length === 0) {
      console.log('  No log files found');
      return;
    }

    // Get the latest log file
    const latestLog = logFiles.sort().reverse()[0];
    const logPath = path.join(logsDir, latestLog);
    
    try {
      const content = await fs.readFile(logPath, 'utf8');
      const logData = JSON.parse(content);
      
      console.log(`  File: ${latestLog}`);
      console.log(`  Download Time: ${logData.startTime} to ${logData.endTime}`);
      console.log(`  Summary:`);
      console.log(`    Total Tickers: ${logData.summary.totalTickers}`);
      console.log(`    Successful: ${logData.summary.successfulDownloads}`);
      console.log(`    Failed: ${logData.summary.failedDownloads}`);
      console.log(`    Total Records: ${logData.summary.totalRecords.toLocaleString()}`);
      console.log(`    API Requests: ${logData.summary.totalRequests}`);
      
      if (logData.summary.failedDownloads > 0) {
        console.log('\n  Failed Tickers:');
        logData.tickers
          .filter(t => t.status !== 'success')
          .forEach(t => console.log(`    ${t.ticker}: ${t.status}`));
      }
    } catch (error) {
      console.log(`  ⚠️ Error reading log: ${error.message}`);
    }
  }

  async testDataIntegrity() {
    console.log('\n🧪 Testing Data Integrity\n');

    try {
      // Test if we can load and process the data
      const parquetDir = path.join(this.dataDir, 'parquet');
      const files = await fs.readdir(parquetDir);
      
      if (files.length === 0) {
        console.log('❌ No structured data files found to test');
        return;
      }

      const testFile = files[0];
      const filePath = path.join(parquetDir, testFile);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      if (data.length === 0) {
        console.log('❌ Test file contains no data');
        return;
      }

      console.log('✅ Data Structure Tests:');
      const sample = data[0];
      
      const requiredFields = ['ticker', 'date', 'timestamp', 'open', 'high', 'low', 'close', 'volume'];
      const missingFields = requiredFields.filter(field => !(field in sample));
      
      if (missingFields.length === 0) {
        console.log('  ✅ All required fields present');
      } else {
        console.log(`  ❌ Missing fields: ${missingFields.join(', ')}`);
      }

      // Test data types
      console.log('✅ Data Type Tests:');
      console.log(`  Ticker: ${typeof sample.ticker} (${sample.ticker})`);
      console.log(`  Date: ${typeof sample.date} (${sample.date})`);
      console.log(`  Prices: ${typeof sample.open} (${sample.open})`);
      console.log(`  Volume: ${typeof sample.volume} (${sample.volume.toLocaleString()})`);

      // Test data range
      console.log('✅ Data Range Tests:');
      const dates = data.map(d => d.date).sort();
      console.log(`  Date Range: ${dates[0]} to ${dates[dates.length - 1]}`);
      console.log(`  Total Days: ${dates.length}`);
      
      // Test for gaps
      const expectedDays = this.getBusinessDays('2024-01-01', '2024-03-31');
      const actualDays = dates.length;
      console.log(`  Expected Business Days: ~${expectedDays}`);
      console.log(`  Actual Days: ${actualDays}`);
      
      if (actualDays >= expectedDays * 0.8) {
        console.log('  ✅ Data coverage looks good');
      } else {
        console.log('  ⚠️ Possible data gaps detected');
      }

    } catch (error) {
      console.log(`❌ Integrity test failed: ${error.message}`);
    }
  }

  getBusinessDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let count = 0;
    
    while (start <= end) {
      const dayOfWeek = start.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
        count++;
      }
      start.setDate(start.getDate() + 1);
    }
    
    return count;
  }
}

// Run if called directly
if (require.main === module) {
  const analyzer = new DataAnalyzer();
  
  analyzer.analyzeDownloadedData()
    .then(() => analyzer.testDataIntegrity())
    .then(() => {
      console.log('\n🎉 Analysis complete!');
      console.log('\nNext steps:');
      console.log('1. Review the data quality metrics above');
      console.log('2. If data looks good, proceed with parquet conversion');
      console.log('3. Test loading data in the web interface');
    })
    .catch(error => {
      console.error('Analysis failed:', error);
      process.exit(1);
    });
}

module.exports = { DataAnalyzer };