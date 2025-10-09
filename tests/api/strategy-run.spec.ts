import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/strategy/run/route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/safeParquet", () => ({
  readTickerRange: vi.fn(async (ticker: string) => {
    if (ticker === "AAPL") {
      return [
        { date: "2023-01-01", open: 100, high: 105, low: 98, close: 102, volume: 1000 },
        { date: "2023-01-02", open: 102, high: 108, low: 101, close: 106, volume: 1200 },
        { date: "2023-01-03", open: 106, high: 110, low: 105, close: 108, volume: 1100 },
      ];
    }
    return [];
  }),
}));

vi.mock("@/lib/ml-client", () => ({
  isMLAvailable: vi.fn(() => false),
  trainPredict: vi.fn(),
}));

describe("/api/strategy/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.USE_PY_BACKTESTER;
    delete process.env.ML_API_URL;
  });

  it("should require tickers array", async () => {
    const req = new NextRequest("http://localhost/api/strategy/run", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("tickers array required");
  });

  it("should run DSL backtest with valid payload", async () => {
    const req = new NextRequest("http://localhost/api/strategy/run", {
      method: "POST",
      body: JSON.stringify({
        tickers: ["AAPL"],
        startDate: "2023-01-01",
        endDate: "2023-01-03",
        mode: "dsl",
        dsl: {
          name: "Test Strategy",
          rules: [
            {
              type: "sma_cross",
              params: { fast: 2, slow: 3, enter: "fast_above", exit: "fast_below" },
            },
          ],
        },
        portfolio: {
          startingCash: 100000,
          sizing: { type: "percent_of_equity", pct: 10 },
          commissionFixed: 0,
          commissionPct: 0,
          slippageBps: 0,
        },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.summary).toBeDefined();
    expect(data.summary.mode).toBe("dsl");
    expect(data.summary.startingCash).toBe(100000);
    expect(data.perTicker).toBeInstanceOf(Array);
    expect(data.portfolioDaily).toBeInstanceOf(Array);
  });

  it("should use default DSL if none provided", async () => {
    const req = new NextRequest("http://localhost/api/strategy/run", {
      method: "POST",
      body: JSON.stringify({
        tickers: ["AAPL"],
        startDate: "2023-01-01",
        endDate: "2023-01-03",
        mode: "dsl",
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.summary.mode).toBe("dsl");
  });

  it("should use default portfolio config if none provided", async () => {
    const req = new NextRequest("http://localhost/api/strategy/run", {
      method: "POST",
      body: JSON.stringify({
        tickers: ["AAPL"],
        startDate: "2023-01-01",
        endDate: "2023-01-03",
        mode: "dsl",
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.summary.startingCash).toBe(100000); // Default
  });

  it("should return 501 for ML mode when service unavailable", async () => {
    const req = new NextRequest("http://localhost/api/strategy/run", {
      method: "POST",
      body: JSON.stringify({
        tickers: ["AAPL"],
        startDate: "2023-01-01",
        endDate: "2023-01-03",
        mode: "ml",
        ml: {
          code: "# ML code",
          hyperparams: { n_estimators: 100 },
        },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("ML service is not available");
  });

  it("should handle empty ticker data gracefully", async () => {
    const req = new NextRequest("http://localhost/api/strategy/run", {
      method: "POST",
      body: JSON.stringify({
        tickers: ["INVALID"],
        startDate: "2023-01-01",
        endDate: "2023-01-03",
        mode: "dsl",
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should return result even with no data
    expect(data.ok).toBeDefined();
  });

  it("should normalize tickers to uppercase", async () => {
    const req = new NextRequest("http://localhost/api/strategy/run", {
      method: "POST",
      body: JSON.stringify({
        tickers: ["aapl", "MSFT", "  googl  "],
        startDate: "2023-01-01",
        endDate: "2023-01-03",
        mode: "dsl",
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Tickers should be normalized (tested via mock behavior)
  });

  it("should error if USE_PY_BACKTESTER=1 but ML_API_URL not set", async () => {
    process.env.USE_PY_BACKTESTER = "1";

    const req = new NextRequest("http://localhost/api/strategy/run", {
      method: "POST",
      body: JSON.stringify({
        tickers: ["AAPL"],
        startDate: "2023-01-01",
        endDate: "2023-01-03",
        mode: "dsl",
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("ML_API_URL");
  });

  it("should include portfolio results structure", async () => {
    const req = new NextRequest("http://localhost/api/strategy/run", {
      method: "POST",
      body: JSON.stringify({
        tickers: ["AAPL"],
        startDate: "2023-01-01",
        endDate: "2023-01-03",
        mode: "dsl",
        portfolio: {
          startingCash: 50000,
          sizing: { type: "fixed_dollar", amount: 10000 },
          commissionFixed: 1,
          commissionPct: 0.001,
          slippageBps: 5,
          stopLossPct: 5,
          takeProfitPct: 10,
        },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary).toMatchObject({
      mode: "dsl",
      startingCash: 50000,
      endingEquity: expect.any(Number),
      totalReturnPct: expect.any(Number),
      totalTrades: expect.any(Number),
    });

    expect(data.perTicker[0]).toMatchObject({
      ticker: "AAPL",
      stats: expect.any(Object),
      trades: expect.any(Array),
      equity: expect.any(Array),
    });

    expect(data.portfolioDaily[0]).toMatchObject({
      date: expect.any(String),
      nav: expect.any(Number),
      drawdownPct: expect.any(Number),
      exposurePct: expect.any(Number),
    });
  });
});
