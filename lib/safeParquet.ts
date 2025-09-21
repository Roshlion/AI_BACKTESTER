/**
 * Manifest-aware parquet reader for multi-ticker dataset
 * Supports both public static files and Blob storage via manifest
 */

export interface Row {
  ticker: string;
  date: string;          // YYYY-MM-DD
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  transactions?: number;
}

export interface TickerInfo {
  ticker: string;
  path: string;          // relative for public, absolute https URL for Blob
  firstDate: string;
  lastDate: string;
  records: number;
}

export interface Manifest {
  version: number;
  source: 'public' | 'blob';
  asOf: string;
  tickers: TickerInfo[];
}

/**
 * Load manifest from either Blob URL or public/manifest.json
 */
export async function loadManifest(req: Request): Promise<Manifest> {
  try {
    let manifestUrl: string;

    // Check if PARQUET_URL points to a manifest (ends with .json)
    const parquetUrl = process.env.PARQUET_URL;
    if (parquetUrl && parquetUrl.endsWith('.json')) {
      manifestUrl = parquetUrl;
    } else {
      // Use public manifest
      const origin = (req as any).nextUrl?.origin ?? new URL(req.url).origin;
      manifestUrl = `${origin}/manifest.json`;
    }

    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status}`);
    }

    const manifest = await response.json() as Manifest;

    // Validate minimal shape
    if (!manifest.version || !manifest.source || !Array.isArray(manifest.tickers)) {
      throw new Error('Invalid manifest structure');
    }

    return manifest;
  } catch (error) {
    console.error('Error loading manifest:', error);
    return {
      version: 1,
      source: 'public',
      asOf: new Date().toISOString(),
      tickers: []
    };
  }
}

/**
 * Resolve ticker path to absolute URL
 */
export function resolveTickerPath(manifest: Manifest, ticker: string, req: Request): string | null {
  const tickerInfo = manifest.tickers.find(t => t.ticker.toUpperCase() === ticker.toUpperCase());

  if (!tickerInfo) {
    return null;
  }

  // If using blob storage, path is already absolute
  if (manifest.source === 'blob') {
    return tickerInfo.path;
  }

  // For public mode, prepend origin if needed
  if (tickerInfo.path.startsWith('http')) {
    return tickerInfo.path;
  }

  const origin = (req as any).nextUrl?.origin ?? new URL(req.url).origin;
  return `${origin}/${tickerInfo.path}`;
}

/**
 * Read parquet from URL and normalize to Row[]
 */
export async function readParquetURL(url: string): Promise<Row[]> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to fetch parquet: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const { ParquetReader } = await import("parquetjs-lite");
    const reader = await ParquetReader.openBuffer(buffer);
    const cursor = reader.getCursor();

    const rawRows: any[] = [];
    for (let row = await cursor.next(); row; row = await cursor.next()) {
      rawRows.push(row);
    }
    await reader.close();

    // Normalize rows
    const rows: Row[] = rawRows.map((raw): Row | null => {
      // Handle date conversion
      let date: string;
      if (typeof raw.date === "string") {
        date = raw.date.slice(0, 10); // Ensure YYYY-MM-DD format
      } else {
        const timestamp = typeof raw.timestamp === "bigint" ? Number(raw.timestamp) : Number(raw.timestamp ?? raw.date ?? 0);
        date = new Date(timestamp).toISOString().slice(0, 10);
      }

      // Skip rows without valid date
      if (!date || date === 'Invalid Date') {
        return null;
      }

      // Convert bigint/number values safely
      const toNum = (v: unknown): number => {
        if (typeof v === "bigint") return Number(v);
        const num = Number(v ?? 0);
        return isNaN(num) ? 0 : num;
      };

      return {
        ticker: raw.ticker ? String(raw.ticker) : 'UNKNOWN',
        date,
        timestamp: toNum(raw.timestamp ?? raw.date),
        open: toNum(raw.open),
        high: toNum(raw.high),
        low: toNum(raw.low),
        close: toNum(raw.close),
        volume: toNum(raw.volume),
        vwap: raw.vwap != null ? toNum(raw.vwap) : undefined,
        transactions: raw.transactions != null ? toNum(raw.transactions) : undefined,
      };
    }).filter((row): row is Row => row !== null);

    return rows;
  } catch (error) {
    console.error(`Error reading parquet from ${url}:`, error);
    return [];
  }
}

/**
 * Read ticker data for date range using manifest
 */
export async function readTickerRange(
  req: Request,
  ticker: string,
  startDate: string,
  endDate: string
): Promise<Row[]> {
  try {
    const manifest = await loadManifest(req);

    // Try to get ticker from manifest
    const tickerPath = resolveTickerPath(manifest, ticker, req);

    let rows: Row[] = [];

    if (tickerPath) {
      rows = await readParquetURL(tickerPath);
      // Ensure ticker is set correctly
      rows = rows.map(row => ({ ...row, ticker: ticker.toUpperCase() }));
    } else {
      // Fallback for AAPL using old single-file logic
      if (ticker.toUpperCase() === 'AAPL') {
        const origin = (req as any).nextUrl?.origin ?? new URL(req.url).origin;
        const fallbackUrl = `${origin}/AAPL.parquet`;
        rows = await readParquetURL(fallbackUrl);
        rows = rows.map(row => ({ ...row, ticker: 'AAPL' }));
      }
    }

    // Filter by date range
    const filteredRows = rows.filter(row =>
      row.date >= startDate && row.date <= endDate
    );

    return filteredRows.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    console.error(`Error reading ticker range for ${ticker}:`, error);
    return [];
  }
}

/**
 * Get source information
 */
export async function getDataSource(req: Request) {
  try {
    const manifest = await loadManifest(req);
    return {
      source: manifest.source,
      asOf: manifest.asOf,
      tickerCount: manifest.tickers.length
    };
  } catch (error) {
    return {
      source: 'public' as const,
      asOf: new Date().toISOString(),
      tickerCount: 0
    };
  }
}

// Legacy compatibility - use readTickerRange instead
export async function safeReadParquet(req: Request, fallbackTicker = "AAPL"): Promise<Row[]> {
  return readTickerRange(req, fallbackTicker, '1900-01-01', '2099-12-31');
}