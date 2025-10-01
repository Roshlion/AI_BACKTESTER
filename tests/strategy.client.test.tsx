import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StrategyClient from "@/app/strategy/StrategyClient";

describe("StrategyClient", () => {
  it("prefills tickers and indicators from props", () => {
    const html = renderToString(
      <StrategyClient
        initialTickers={["AAPL", "MSFT"]}
        initialIndicators={["SMA50", "RSI"]}
        initialStartDate={null}
        initialEndDate={null}
      />,
    );

    expect(html).toContain("AAPL, MSFT");
    expect(html).toContain("Strategy idea: Use SMA(50) and RSI on the selected stocks.");
  });
});
