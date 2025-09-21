// lib/data-manager.ts
import fs from 'fs-extra';
import path from 'path';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { PolygonClient, PolygonBar, PolygonTicker } from './polygon';

export interface DataRange {
  start: string;
  end: string;
  ticker?: string;
}

export interface DataCoverage {
  ticker: string;
  earliest_date: string;
  latest_date: string;
  missing_dates: string[];
  total_records: number;
}

export class DataManager {
  private dataDir: string;
  private polygon: PolygonClient;

  constructor(polygonApiKey: string, dataDir = './data') {
    this.polygon = new PolygonClient(polygonApiKey);
    this.dataDir = dataDir;
    this.ensureDataDirectories();
  }

  private async ensureDataDirectories() {
    const dirs = [
      path.join(this.dataDir, 'daily'),
      path.join(this.dataDir, 'intraday'),
      path.join(this.dataDir, 'metadata'),
      path.join(this.dataDir, 'temp'),
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }
  }

  // Generate file path for data
  private getDataFilePath(timeframe: 'daily' | 'intraday', date: string): string {
    const year = date.substring(0, 4);
    const month = date.substring(5, 7);
    
    if (timeframe === 'daily') {
      return path.join(this.dataDir, 'daily', `${year}-${month}.json`);
    } else {
      const day = date.substring(8, 10);
      return path.join(this.dataDir, 'intraday', year, month, `${day}.json`);
    }
  }

  // Check if data exists for a specific date range
  async checkDataCoverage(ticker: string, startDate: string, endDate: string): Promise<DataCoverage> {
    const filePath = path.join(this.dataDir, 'metadata', `${ticker}_coverage.json`);
    
    try {
      const coverage = await fs.readJson(filePath);
      return coverage;
    } catch (error) {
      return {
        ticker,
        earliest_date: '',
        latest_date: '',
        missing_dates: [],
        total_records: 0
      };
    }
  }

  // Download historical data for a ticker
  async downloadHistoricalData(
    ticker: string, 
    startDate: string, 
    endDate: string,
    timespan: 'day' | 'hour' | 'minute' = 'day'
  ): Promise<PolygonBar[]> {
    console.log(`Downloading ${ticker} data from ${startDate} to ${endDate}`);
    
    const response = await this.polygon.getBars(
      ticker,
      timespan,
      1,
      startDate,
      endDate,
      { limit: 50000 }
    );

    if (!response.results) {
      console.log(`No data found for ${ticker}`);
      return [];
    }

    // Save data to file
    const fileName = `${ticker}_${timespan}_${startDate}_${endDate}.json`;
    const filePath = path.join(this.dataDir, 'temp', fileName);
    
    await fs.writeJson(filePath, {
      ticker,
      timespan,
      data: response.results,
      downloaded_at: new Date().toISOString(),
      count: response.results.length
    }, { spaces: 2 });

    console.log(`Saved ${response.results.length} records for ${ticker} to ${filePath}`);
    return response.results;
  }

  // Load data from local files
  async loadLocalData(ticker: string, startDate: string, endDate: string): Promise<PolygonBar[]> {
    const tempFiles = await fs.readdir(path.join(this.dataDir, 'temp'));
    const tickerFiles = tempFiles.filter((file: string) => file.startsWith(`${ticker}_`));
    
    let allData: PolygonBar[] = [];
    
    for (const file of tickerFiles) {
      try {
        const filePath = path.join(this.dataDir, 'temp', file);
        const fileData = await fs.readJson(filePath);
        if (fileData.data) {
          allData.push(...fileData.data);
        }
      } catch (error) {
        console.log(`Error reading file ${file}:`, error);
      }
    }

    // Filter by date range
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    
    return allData.filter((bar: PolygonBar) => bar.t >= startTime && bar.t <= endTime);
  }

  // Get missing data ranges
  async getMissingDataRanges(ticker: string, startDate: string, endDate: string): Promise<DataRange[]> {
    const localData = await this.loadLocalData(ticker, startDate, endDate);
    
    if (localData.length === 0) {
      return [{ start: startDate, end: endDate, ticker }];
    }

    // Sort by timestamp
    localData.sort((a: PolygonBar, b: PolygonBar) => a.t - b.t);
    
    const missingRanges: DataRange[] = [];
    const requestStart = new Date(startDate);
    const requestEnd = new Date(endDate);
    
    // Check if we're missing data at the beginning
    const firstDataDate = new Date(localData[0].t);
    if (isAfter(firstDataDate, requestStart)) {
      missingRanges.push({
        start: format(requestStart, 'yyyy-MM-dd'),
        end: format(firstDataDate, 'yyyy-MM-dd'),
        ticker
      });
    }

    // Check for gaps in the middle
    for (let i = 0; i < localData.length - 1; i++) {
      const currentDate = new Date(localData[i].t);
      const nextDate = new Date(localData[i + 1].t);
      
      // If there's more than 1 day gap, we have missing data
      const daysDiff = (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 1) {
        missingRanges.push({
          start: format(currentDate, 'yyyy-MM-dd'),
          end: format(nextDate, 'yyyy-MM-dd'),
          ticker
        });
      }
    }

    // Check if we're missing data at the end
    const lastDataDate = new Date(localData[localData.length - 1].t);
    if (isBefore(lastDataDate, requestEnd)) {
      missingRanges.push({
        start: format(lastDataDate, 'yyyy-MM-dd'),
        end: format(requestEnd, 'yyyy-MM-dd'),
        ticker
      });
    }

    return missingRanges;
  }

  // Get comprehensive data (local + API for missing pieces)
  async getComprehensiveData(
    ticker: string, 
    startDate: string, 
    endDate: string
  ): Promise<PolygonBar[]> {
    console.log(`Getting comprehensive data for ${ticker} from ${startDate} to ${endDate}`);
    
    // First, load any existing local data
    const localData = await this.loadLocalData(ticker, startDate, endDate);
    console.log(`Found ${localData.length} local records for ${ticker}`);
    
    // Check for missing ranges
    const missingRanges = await this.getMissingDataRanges(ticker, startDate, endDate);
    console.log(`Found ${missingRanges.length} missing data ranges for ${ticker}`);
    
    // Download missing data
    let newData: PolygonBar[] = [];
    for (const range of missingRanges) {
      try {
        const rangeData = await this.downloadHistoricalData(ticker, range.start, range.end);
        newData.push(...rangeData);
        
        // Add small delay to respect rate limits
        await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error downloading data for ${ticker} range ${range.start} to ${range.end}:`, error);
      }
    }

    // Combine and deduplicate data
    const allData = [...localData, ...newData];
    const uniqueData = Array.from(
      new Map(allData.map((bar: PolygonBar) => [bar.t, bar])).values()
    );

    // Sort by timestamp
    uniqueData.sort((a: PolygonBar, b: PolygonBar) => a.t - b.t);
    
    console.log(`Total records for ${ticker}: ${uniqueData.length}`);
    return uniqueData;
  }
}
