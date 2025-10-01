import { describe, expect, it } from "vitest";
import { buildStrategyUrl } from "@/app/dashboard/page";

describe("buildStrategyUrl", () => {
  it("builds the strategy URL with tickers, indicators, and range", () => {
    const url = buildStrategyUrl({
      tickers: ["AAPL", "AMD"],
      indicatorParams: ["SMA50", "RSI"],
      dateRange: { start: "2020-01-01", end: "2020-01-02" },
    });

    expect(url).toBe("/strategy?tickers=AAPL%2CAMD&indicators=SMA50%2CRSI&start=2020-01-01&end=2020-01-02");
  });

  it("falls back to base route when no tickers", () => {
    const url = buildStrategyUrl({ tickers: [], indicatorParams: [], dateRange: { start: "", end: "" } });
    expect(url).toBe("/strategy");
  });
});
