import { vi } from "vitest";
import '@testing-library/jest-dom';

process.env.AWS_BUCKET ||= "dummy-bucket";
process.env.AWS_REGION ||= "us-east-1";
process.env.AWS_PREFIX ||= "prod";
process.env.S3_BASE ||= "https://dummy-bucket.s3.amazonaws.com/prod";
process.env.NEXT_PUBLIC_APP_URL ||= "http://localhost:3000";

const okJson = (obj: any) =>
  new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

vi.stubGlobal("fetch", vi.fn(async (url: any) => {
  const u = String(url);
  if (u.endsWith("/index.json")) {
    return okJson({
      asOf: "2025-01-01T00:00:00Z",
      source: "test",
      tickers: ["AAPL", "AMD", "AMZN"],
    });
  }
  return new Response("not found", { status: 404 });
}));
