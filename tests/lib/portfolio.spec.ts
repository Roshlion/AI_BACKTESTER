import { describe, it, expect } from "vitest";
import { simulatePortfolio } from "@/lib/portfolio";
import type { PortfolioConfig } from "@/types/portfolio";
import type { Row } from "@/types/row";

// Helper to create properly typed Row objects
function createRow(ticker: string, partial: Omit<Row, "ticker" | "timestamp">): Row {
  return {
    ...partial,
    ticker,
    timestamp: new Date(partial.date).getTime(),
  };
}

describe("Portfolio Simulator", () => {
  const mockConfig: PortfolioConfig = {
    startingCash: 100000,
    leverage: 1,
    sizing: { type: "percent_of_equity", pct: 10 },
    commissionFixed: 0,
    commissionPct: 0.0005,
    slippageBps: 2,
    borrowRateShort: 0,
    allowShort: false,
    rebalance: "none",
    rebalanceDriftPct: 5,
  };

  it("should handle empty ticker signals", () => {
    const result = simulatePortfolio([], mockConfig, "dsl");

    expect(result.ok).toBe(false);
    expect(result.summary.endingEquity).toBe(mockConfig.startingCash);
    expect(result.summary.totalReturnPct).toBe(0);
  });

  it("should calculate basic portfolio metrics", () => {
    const ticker = "AAPL";
    const mockRows = [
      createRow(ticker, { date: "2023-01-01", open: 100, high: 105, low: 98, close: 102, volume: 1000 }),
      createRow(ticker, { date: "2023-01-02", open: 102, high: 108, low: 101, close: 106, volume: 1200 }),
      createRow(ticker, { date: "2023-01-03", open: 106, high: 110, low: 105, close: 108, volume: 1100 }),
      createRow(ticker, { date: "2023-01-04", open: 108, high: 112, low: 107, close: 110, volume: 1300 }),
      createRow(ticker, { date: "2023-01-05", open: 110, high: 115, low: 109, close: 112, volume: 1400 }),
    ];

    const tickerSignals = [
      {
        ticker,
        rows: mockRows,
        enterSignals: [true, false, false, false, false],
        exitSignals: [false, false, false, false, true],
      },
    ];

    const result = simulatePortfolio(tickerSignals, mockConfig, "dsl");

    expect(result.ok).toBe(true);
    expect(result.summary.totalTrades).toBeGreaterThan(0);
    expect(result.perTicker).toHaveLength(1);
    expect(result.perTicker[0].ticker).toBe("AAPL");
    expect(result.portfolioDaily.length).toBeGreaterThan(0);
  });

  it("should apply commission and slippage correctly", () => {
    const ticker = "TEST";
    const mockRows = [
      createRow(ticker, { date: "2023-01-01", open: 100, high: 105, low: 98, close: 100, volume: 1000 }),
      createRow(ticker, { date: "2023-01-02", open: 100, high: 102, low: 99, close: 100, volume: 1000 }),
    ];

    const tickerSignals = [
      {
        ticker,
        rows: mockRows,
        enterSignals: [true, false],
        exitSignals: [false, true],
      },
    ];

    const result = simulatePortfolio(tickerSignals, mockConfig, "dsl");

    // With flat price, we should see negative return due to fees
    expect(result.summary.totalReturnPct).toBeLessThan(0);
    expect(result.summary.totalTrades).toBe(2); // Buy + Sell
  });

  it("should calculate risk metrics", () => {
    const ticker = "VOL";
    const mockRows = Array.from({ length: 50 }, (_, i) =>
      createRow(ticker, {
        date: new Date(2023, 0, i + 1).toISOString().slice(0, 10),
        open: 100 + Math.random() * 10,
        high: 110 + Math.random() * 10,
        low: 90 + Math.random() * 10,
        close: 100 + Math.random() * 10,
        volume: 1000,
      })
    );

    const tickerSignals = [
      {
        ticker,
        rows: mockRows,
        enterSignals: [true, ...Array(49).fill(false)],
        exitSignals: [...Array(49).fill(false), true],
      },
    ];

    const result = simulatePortfolio(tickerSignals, mockConfig, "dsl");

    expect(result.summary.volatilityPct).toBeGreaterThan(0);
    expect(result.summary.maxDrawdownPct).toBeLessThanOrEqual(0);
    expect(result.summary.CAGR).toBeDefined();
  });

  it("should respect position sizing", () => {
    const fixedDollarConfig: PortfolioConfig = {
      ...mockConfig,
      sizing: { type: "fixed_dollar", amount: 5000 },
    };

    const ticker = "SIZE";
    const mockRows = [
      createRow(ticker, { date: "2023-01-01", open: 100, high: 105, low: 98, close: 100, volume: 1000 }),
      createRow(ticker, { date: "2023-01-02", open: 100, high: 102, low: 99, close: 110, volume: 1000 }),
    ];

    const tickerSignals = [
      {
        ticker,
        rows: mockRows,
        enterSignals: [true, false],
        exitSignals: [false, true],
      },
    ];

    const result = simulatePortfolio(tickerSignals, fixedDollarConfig, "dsl");

    // Entry should be roughly $5000 / $100 = 50 shares
    const buyTrade = result.perTicker[0]?.trades.find((t) => t.side === "buy");
    expect(buyTrade?.qty).toBe(50);
  });
});
