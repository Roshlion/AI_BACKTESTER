import { describe, expect, it } from "vitest";

import {
  filterTickersList,
  isolateTickerSelection,
  limitTickersList,
  type TickerInfo,
} from "@/components/ticker-selector";

const SAMPLE_TICKERS: TickerInfo[] = [
  { ticker: "AAPL" },
  { ticker: "AMD" },
  { ticker: "AMZN" },
  { ticker: "MSFT" },
];

describe("TickerSelector helpers", () => {
  it("filters tickers as the user types", () => {
    const result = filterTickersList(SAMPLE_TICKERS, "am");
    expect(result.map((item) => item.ticker)).toEqual(["AMD", "AMZN"]);
  });

  it("shows empty list when no tickers match", () => {
    const result = filterTickersList(SAMPLE_TICKERS, "zzz");
    expect(result).toHaveLength(0);
  });

  it("isolate helper returns only the requested ticker", () => {
    const result = isolateTickerSelection("aapl");
    expect(result).toEqual(["AAPL"]);
  });

  it("limits the ticker list when no query is provided", () => {
    const limited = limitTickersList(SAMPLE_TICKERS, "", 2);
    expect(limited.map((item) => item.ticker)).toEqual(["AAPL", "AMD"]);

    const unlimited = limitTickersList(SAMPLE_TICKERS, "am", 2);
    expect(unlimited.map((item) => item.ticker)).toEqual(["AAPL", "AMD", "AMZN", "MSFT"]);
  });
});
