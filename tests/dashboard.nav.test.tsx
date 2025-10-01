import { describe, expect, it, vi } from "vitest";

import { commitStrategyNavigation } from "@/app/(tabs)/dashboard/strategy-hand-off";

describe("commitStrategyNavigation", () => {
  it("switches to the strategy tab and persists state", () => {
    const setSelection = vi.fn();
    const push = vi.fn();

    commitStrategyNavigation({
      tickers: ["AAPL"],
      indicators: ["SMA50"],
      dateRange: { start: "2020-01-01", end: "2020-02-01" },
      prompt: "Strategy idea",
      setSelection,
      push,
    });

    expect(setSelection).toHaveBeenCalledWith({
      tickers: ["AAPL"],
      indicators: ["SMA50"],
      start: "2020-01-01",
      end: "2020-02-01",
      prompt: "Strategy idea",
    });
    expect(push).toHaveBeenCalledWith("/strategy");
  });

  it("normalises blanks to null", () => {
    const setSelection = vi.fn();
    const push = vi.fn();

    commitStrategyNavigation({
      tickers: ["MSFT"],
      indicators: [],
      dateRange: { start: "", end: "" },
      prompt: "  ",
      setSelection,
      push,
    });

    expect(setSelection).toHaveBeenCalledWith({
      tickers: ["MSFT"],
      indicators: [],
      start: null,
      end: null,
      prompt: null,
    });
    expect(push).toHaveBeenCalledWith("/strategy");
  });

  it("skips navigation when there are no tickers", () => {
    const setSelection = vi.fn();
    const push = vi.fn();

    commitStrategyNavigation({
      tickers: [],
      indicators: [],
      dateRange: {},
      prompt: "",
      setSelection,
      push,
    });

    expect(setSelection).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
