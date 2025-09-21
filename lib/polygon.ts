// lib/polygon.ts
export interface PolygonBar {
  c: number;  // close
  h: number;  // high
  l: number;  // low
  o: number;  // open
  v: number;  // volume
  vw: number; // volume weighted average price
  t: number;  // timestamp
  n?: number; // number of transactions
}

export interface PolygonResponse<T> {
  ticker?: string;
  status: string;
  results?: T[];
  resultsCount?: number;
  adjusted?: boolean;
  next_url?: string;
  request_id?: string;
  count?: number;
}

export interface PolygonTicker {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange?: string;
  type?: string;
  active: boolean;
  currency_name?: string;
  cik?: string;
  composite_figi?: string;
  share_class_figi?: string;
  last_updated_utc?: string;
}

export interface PolygonDividend {
  cash_amount: number;
  currency: string;
  declaration_date: string;
  dividend_type: string;
  ex_dividend_date: string;
  frequency: number;
  pay_date: string;
  record_date: string;
  ticker: string;
}

export interface BulkDataFile {
  name: string;
  download_link: string;
  size_bytes: number;
  size: string;
}

export class PolygonClient {
  private apiKey: string;
  private baseUrl = 'https://api.polygon.io';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    // Add API key and other parameters
    url.searchParams.append('apikey', this.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString());
      }
    });

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Get historical bars (OHLCV data)
  async getBars(
    ticker: string,
    timespan: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year',
    multiplier: number,
    from: string,
    to: string,
    options: {
      adjusted?: boolean;
      sort?: 'asc' | 'desc';
      limit?: number;
    } = {}
  ): Promise<PolygonResponse<PolygonBar>> {
    return this.request(
      `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`,
      {
        adjusted: options.adjusted ?? true,
        sort: options.sort ?? 'asc',
        limit: options.limit ?? 5000,
      }
    );
  }

  // Get all tickers
  async getTickers(options: {
    type?: string;
    market?: string;
    active?: boolean;
    limit?: number;
    cursor?: string;
  } = {}): Promise<PolygonResponse<PolygonTicker>> {
    return this.request('/v3/reference/tickers', {
      type: options.type,
      market: options.market ?? 'stocks',
      active: options.active ?? true,
      limit: options.limit ?? 1000,
      cursor: options.cursor,
    });
  }

  // Get all tickers with pagination support
  async getAllTickers(): Promise<PolygonTicker[]> {
    const allTickers: PolygonTicker[] = [];
    let cursor: string | undefined;
    
    do {
      const response = await this.getTickers({ 
        limit: 1000, 
        cursor,
        active: true 
      });
      
      if (response.results) {
        allTickers.push(...response.results);
      }
      
      // Extract cursor from next_url if it exists
      if (response.next_url) {
        const url = new URL(response.next_url);
        cursor = url.searchParams.get('cursor') || undefined;
      } else {
        cursor = undefined;
      }
    } while (cursor);
    
    return allTickers;
  }

  // Get dividends
  async getDividends(options: {
    ticker?: string;
    ex_dividend_date_gte?: string;
    ex_dividend_date_lte?: string;
    record_date_gte?: string;
    record_date_lte?: string;
    declaration_date_gte?: string;
    declaration_date_lte?: string;
    pay_date_gte?: string;
    pay_date_lte?: string;
    frequency?: number;
    cash_amount_gte?: number;
    cash_amount_lte?: number;
    dividend_type?: string;
    limit?: number;
  } = {}): Promise<PolygonResponse<PolygonDividend>> {
    return this.request('/v3/reference/dividends', options);
  }

  // Get bulk data files (Flat Files API)
  async getBulkDataFiles(date: string): Promise<BulkDataFile[]> {
    try {
      const response = await this.request<{ results: BulkDataFile[] }>('/v1/reference/market-status');
      return response.results || [];
    } catch (error) {
      console.log('Note: Bulk data files require higher tier access');
      return [];
    }
  }

  // Download file helper
  async downloadFile(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
  }
}
