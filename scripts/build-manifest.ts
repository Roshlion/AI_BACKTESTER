import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";

const AWS_BUCKET = process.env.AWS_BUCKET;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_PREFIX = process.env.AWS_PREFIX || "prod";

async function main() {
  if (!AWS_BUCKET) {
    throw new Error("AWS_BUCKET env required");
  }

  const s3 = new S3Client({ region: AWS_REGION });
  const tickers = new Set<string>();
  let continuationToken: string | undefined;

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
      const match = key.match(/\/([A-Za-z0-9._-]+)\.(parquet|csv)$/i);
      if (match) {
        tickers.add(match[1].toUpperCase());
      }
    }

    continuationToken = out.NextContinuationToken;
  } while (continuationToken);

  const manifest = {
    asOf: new Date().toISOString(),
    source: `s3://${AWS_BUCKET}/${AWS_PREFIX.replace(/\/?$/, "")}/`,
    tickers: Array.from(tickers).sort(),
  };

  const body = Buffer.from(JSON.stringify(manifest, null, 2));
  await s3.send(
    new PutObjectCommand({
      Bucket: AWS_BUCKET,
      Key: `${AWS_PREFIX.replace(/\/?$/, "")}/index.json`,
      Body: body,
      ContentType: "application/json",
      ACL: "public-read",
    }),
  );

  console.log(`Wrote s3://${AWS_BUCKET}/${AWS_PREFIX}/index.json with ${manifest.tickers.length} tickers`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
