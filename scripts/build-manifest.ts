import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { ParquetReader } from "parquetjs-lite";

const AWS_BUCKET = process.env.AWS_BUCKET;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_PREFIX = process.env.AWS_PREFIX || "prod";

interface TickerInfo {
  ticker: string;
  url: string;
  format: "parquet" | "json" | "csv";
  records?: number;
  firstDate?: string;
  lastDate?: string;
  fileSize?: number;
  sector?: string;
  industry?: string;
}

// Basic sector mapping - in a real implementation this could come from an external API
const SECTOR_MAP: Record<string, { sector: string; industry: string }> = {
  AAPL: { sector: "Technology", industry: "Consumer Electronics" },
  MSFT: { sector: "Technology", industry: "Software" },
  GOOGL: { sector: "Technology", industry: "Internet Services" },
  AMZN: { sector: "Consumer Discretionary", industry: "E-commerce" },
  TSLA: { sector: "Consumer Discretionary", industry: "Automotive" },
  META: { sector: "Technology", industry: "Social Media" },
  NVDA: { sector: "Technology", industry: "Semiconductors" },
  BRK: { sector: "Financial Services", industry: "Diversified Investments" },
  UNH: { sector: "Healthcare", industry: "Health Insurance" },
  JNJ: { sector: "Healthcare", industry: "Pharmaceuticals" },
  // Add more as needed
};

async function analyzeParquetFile(s3: S3Client, bucket: string, key: string): Promise<{ records: number; firstDate?: string; lastDate?: string }> {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3.send(command);

    if (!response.Body) {
      return { records: 0 };
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const buffer = Buffer.concat(chunks);
    const parquetReader = await ParquetReader.openBuffer(buffer);
    const cursor = parquetReader.getCursor();

    let records = 0;
    let firstDate: string | undefined;
    let lastDate: string | undefined;

    // Sample first few and last few records to get date range
    const sampleSize = 10;
    const allRecords: any[] = [];

    for (let record = await cursor.next(); record; record = await cursor.next()) {
      records++;

      if (allRecords.length < sampleSize || records <= sampleSize) {
        allRecords.push(record);
      } else if (records > sampleSize) {
        // Keep only first sampleSize and last sampleSize records for date analysis
        allRecords.push(record);
        if (allRecords.length > sampleSize * 2) {
          allRecords.splice(sampleSize, allRecords.length - sampleSize * 2);
        }
      }
    }

    // Extract date range from sampled records
    if (allRecords.length > 0) {
      const dates = allRecords
        .map(record => {
          const dateVal = record.date || record.timestamp;
          if (typeof dateVal === 'string') return dateVal.slice(0, 10);
          if (typeof dateVal === 'number' || typeof dateVal === 'bigint') {
            return new Date(Number(dateVal)).toISOString().slice(0, 10);
          }
          return null;
        })
        .filter(Boolean)
        .sort();

      if (dates.length > 0) {
        firstDate = dates[0]!;
        lastDate = dates[dates.length - 1]!;
      }
    }

    await parquetReader.close();
    return { records, firstDate, lastDate };
  } catch (error) {
    console.warn(`Failed to analyze ${key}:`, error);
    return { records: 0 };
  }
}

async function main() {
  if (!AWS_BUCKET) {
    throw new Error("AWS_BUCKET env required");
  }

  const s3 = new S3Client({ region: AWS_REGION });
  const tickerMap = new Map<string, TickerInfo>();
  let continuationToken: string | undefined;

  console.log(`Scanning s3://${AWS_BUCKET}/${AWS_PREFIX}/ for ticker files...`);

  do {
    const command = new ListObjectsV2Command({
      Bucket: AWS_BUCKET,
      Prefix: AWS_PREFIX.endsWith("/") ? AWS_PREFIX : `${AWS_PREFIX}/`,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });

    const out = await s3.send(command);
    for (const obj of out.Contents ?? []) {
      const key = obj.Key ?? "";
      const match = key.match(/\/([A-Za-z0-9._-]+)\.(parquet|json|csv)$/i);

      if (match) {
        const ticker = match[1].toUpperCase();
        const format = match[2].toLowerCase() as "parquet" | "json" | "csv";
        const fileSize = obj.Size || 0;

        const baseUrl = `https://${AWS_BUCKET}.s3.amazonaws.com`;
        const url = `${baseUrl}/${key}`;

        const tickerInfo: TickerInfo = {
          ticker,
          url,
          format,
          fileSize,
          ...SECTOR_MAP[ticker] // Add sector info if available
        };

        // Analyze parquet files for more detailed metadata
        if (format === "parquet") {
          console.log(`Analyzing ${ticker}...`);
          const analysis = await analyzeParquetFile(s3, AWS_BUCKET, key);
          tickerInfo.records = analysis.records;
          tickerInfo.firstDate = analysis.firstDate;
          tickerInfo.lastDate = analysis.lastDate;
        }

        tickerMap.set(ticker, tickerInfo);
      }
    }

    continuationToken = out.NextContinuationToken;
  } while (continuationToken);

  const tickers = Array.from(tickerMap.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));

  // Calculate summary statistics
  const totalRecords = tickers.reduce((sum, t) => sum + (t.records || 0), 0);
  const totalFileSize = tickers.reduce((sum, t) => sum + (t.fileSize || 0), 0);

  const manifest = {
    asOf: new Date().toISOString(),
    source: `s3://${AWS_BUCKET}/${AWS_PREFIX.replace(/\/?$/, "")}/`,
    summary: {
      totalTickers: tickers.length,
      totalRecords,
      totalFileSizeBytes: totalFileSize,
      totalFileSizeMB: Math.round(totalFileSize / (1024 * 1024)),
      sectors: Array.from(new Set(tickers.map(t => t.sector).filter(Boolean))).sort(),
    },
    tickers,
  };

  const body = Buffer.from(JSON.stringify(manifest, null, 2));
  await s3.send(
    new PutObjectCommand({
      Bucket: AWS_BUCKET,
      Key: `${AWS_PREFIX.replace(/\/?$/, "")}/index.json`,
      Body: body,
      ContentType: "application/json",
      CacheControl: "max-age=300", // 5 minute cache
    }),
  );

  console.log(`\nManifest Summary:`);
  console.log(`- Tickers: ${manifest.summary.totalTickers}`);
  console.log(`- Total Records: ${manifest.summary.totalRecords.toLocaleString()}`);
  console.log(`- Total Size: ${manifest.summary.totalFileSizeMB} MB`);
  console.log(`- Sectors: ${manifest.summary.sectors.join(", ")}`);
  console.log(`\nWrote s3://${AWS_BUCKET}/${AWS_PREFIX}/index.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

