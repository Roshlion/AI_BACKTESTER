import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { __TickerRowTest as TickerRow } from "@/components/ticker-selector";

describe("TickerSelector row", () => {
  it("reflects selection state in attributes", () => {
    const selectedMarkup = renderToStaticMarkup(
      React.createElement(TickerRow, {
        item: { ticker: "AAPL" },
        selected: true,
        onToggle: () => {},
        onSelectOnly: () => {},
      }),
    );
    const unselectedMarkup = renderToStaticMarkup(
      React.createElement(TickerRow, {
        item: { ticker: "AMD" },
        selected: false,
        onToggle: () => {},
        onSelectOnly: () => {},
      }),
    );

    expect(selectedMarkup).toContain("ticker-row-AAPL");
    expect(selectedMarkup).toContain("aria-pressed=\"true\"");
    expect(unselectedMarkup).toContain("ticker-row-AMD");
    expect(unselectedMarkup).toContain("aria-pressed=\"false\"");
  });
});
