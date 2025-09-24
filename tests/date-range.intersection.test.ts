/// <reference types="vitest" />
import { describe, expect, it } from "vitest";
import { intersectRange } from "../lib/useDateLimits";

describe("intersectRange", () => {
  it("returns bounds for a single ticker", () => {
    const meta = {
      AAPL: { firstDate: "2020-01-02", lastDate: "2020-12-31" },
    };
    expect(intersectRange(["AAPL"], meta)).toEqual({ min: "2020-01-02", max: "2020-12-31" });
  });

  it("computes the intersection across multiple tickers", () => {
    const meta = {
      AAPL: { firstDate: "2020-01-02", lastDate: "2020-12-31" },
      MSFT: { firstDate: "2020-03-01", lastDate: "2020-10-15" },
      NVDA: { firstDate: "2020-02-15", lastDate: "2020-11-30" },
    };
    expect(intersectRange(["aapl", "MSFT", "NVDA"], meta)).toEqual({ min: "2020-03-01", max: "2020-10-15" });
  });

  it("ignores tickers without metadata", () => {
    const meta = {
      AAPL: { firstDate: "2020-01-02", lastDate: "2020-12-31" },
      GOOG: {},
    } as Record<string, { firstDate?: string; lastDate?: string }>;
    expect(intersectRange(["AAPL", "GOOG"], meta)).toEqual({ min: "2020-01-02", max: "2020-12-31" });
  });

  it("returns min greater than max when no overlap exists", () => {
    const meta = {
      AAPL: { firstDate: "2020-01-02", lastDate: "2020-03-01" },
      MSFT: { firstDate: "2020-04-01", lastDate: "2020-06-01" },
    };
    expect(intersectRange(["AAPL", "MSFT"], meta)).toEqual({ min: "2020-04-01", max: "2020-03-01" });
  });

  it("returns empty object when no tickers provided", () => {
    expect(intersectRange([], {})).toEqual({});
  });
});
