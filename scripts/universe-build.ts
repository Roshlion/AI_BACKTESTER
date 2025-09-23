import path from "path";
import fs from "fs-extra";
import { ParquetSchema, ParquetWriter } from "parquetjs-lite";
import { ensureTickerDataset, readTickerSeed, type ManifestEntry } from "../lib/ingest-bars";

async function main() {
  const seedCsv = process.env.TICKER_SEED_CSV ?? "./data/universe-100.csv";
  const outputDir = path.resolve(process.cwd(), "public");
  const usePolygon = (process.env.USE_POLYGON_FOR_BARS ?? "false").toLowerCase() === "true";
  const polygonApiKey = process.env.POLYGON_API_KEY;

  const tickers = await readTickerSeed(seedCsv);
  if (!tickers.length) {
    console.error(`No tickers found in ${seedCsv}`);
    process.exit(1);
  }

  console.log(`Processing ${tickers.length} tickers. Parquet output: ${outputDir}`);
  const context = {
    polygonApiKey,
    usePolygonForBars: usePolygon,
    outputDir,
  };

  const manifestEntries: ManifestEntry[] = [];
  const failures: { ticker: string; reason: string }[] = [];

  for (const ticker of tickers) {
    try {
      const result = await ensureTickerDataset(ticker, context);
      if (!result.summary) {
        failures.push({ ticker, reason: "No data available" });
        continue;
      }
      manifestEntries.push(result.summary);
      console.log(`OK ${ticker} (${result.summary.records} bars)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ ticker, reason: message });
      console.warn(`ERR ${ticker} failed: ${message}`);
    }
  }

  manifestEntries.sort((a, b) => a.ticker.localeCompare(b.ticker));

  const manifest = {
    version: 1,
    asOf: new Date().toISOString(),
    source: "local",
    tickers: manifestEntries,
    failures,
  };

  await fs.ensureDir(outputDir);
  await fs.writeJson(path.join(outputDir, "manifest.json"), manifest, { spaces: 2 });
  console.log(`manifest.json written with ${manifestEntries.length} tickers.`);

  const schema = new ParquetSchema({
    ticker: { type: "UTF8" },
    name: { type: "UTF8", optional: true },
    sector: { type: "UTF8", optional: true },
    industry: { type: "UTF8", optional: true },
    records: { type: "INT64" },
    firstDate: { type: "UTF8", optional: true },
    lastDate: { type: "UTF8", optional: true },
    marketCap: { type: "DOUBLE", optional: true },
    url: { type: "UTF8" },
    source: { type: "UTF8" },
  });

  const parquetPath = path.join(outputDir, "manifest.parquet");
  const writer = await ParquetWriter.openFile(schema, parquetPath);
  for (const entry of manifestEntries) {
    await writer.appendRow(entry as any);
  }
  await writer.close();
  console.log(`manifest.parquet written (${manifestEntries.length} rows).`);

  if (failures.length) {
    console.warn(`Completed with ${failures.length} failures.`);
  }
}

main().catch((error) => {
  console.error("universe-build failed", error);
  process.exit(1);
});
