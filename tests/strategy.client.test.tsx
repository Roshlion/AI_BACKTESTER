import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StrategyClient from "@/app/strategy/StrategyClient";

describe("StrategyClient", () => {
  it("prefills tickers and indicators from props", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StrategyClient, {
        initialTickers: ["AAPL", "ADI"],
        initialIndicators: ["SMA50", "RSI"],
        initialStartDate: "2020-01-01",
        initialEndDate: "2020-12-31",
      }),
    );

    expect(markup).toContain('data-testid="strategy-selected-AAPL"');
    expect(markup).toContain('data-testid="strategy-selected-ADI"');
    expect(markup).toMatch(/Strategy idea: Use SMA\(50\) and RSI on the selected stocks\./);
  });
});
