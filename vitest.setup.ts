import React from "react";
import { vi } from "vitest";

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
  if (u.includes("/api/local-data")) {
    return okJson({
      rows: [
        { date: "2024-01-01", open: 1, high: 1, low: 1, close: 1, volume: 100 },
        { date: "2024-01-02", open: 2, high: 2, low: 2, close: 2, volume: 100 },
      ],
    });
  }
  return new Response("not found", { status: 404 });
}));

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    value: ResizeObserver,
    writable: true,
  });
}

(globalThis as any).React = React;
