import { describe, it, expect } from "vitest";
import { normalizeRows } from "@/lib/safeParquet";
import type { Row } from "@/types/row";

describe("safeParquet - normalizeRows", () => {
  it("should handle standard OHLCV rows", () => {
    const input = [
      {
        date: "2023-01-01",
        open: 100,
        high: 105,
        low: 98,
        close: 102,
        volume: 1000000,
      },
      {
        date: "2023-01-02",
        open: 102,
        high: 108,
        low: 101,
        close: 106,
        volume: 1200000,
      },
    ];

    const result = normalizeRows(input, "AAPL");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "2023-01-01",
      open: 100,
      high: 105,
      low: 98,
      close: 102,
      volume: 1000000,
    });
  });

  it("should handle odd field names (Date/Open/High/Low/Close/Volume)", () => {
    const input = [
      {
        Date: "2023-01-01",
        Open: 100,
        High: 105,
        Low: 98,
        Close: 102,
        Volume: 1000000,
      },
    ];

    const result = normalizeRows(input, "TEST");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: "2023-01-01",
      open: 100,
      high: 105,
      low: 98,
      close: 102,
      volume: 1000000,
    });
  });

  it("should handle decimal fields", () => {
    const input = [
      {
        date: "2023-01-01",
        open: { value: "100.50" },
        high: { value: "105.75" },
        low: { value: "98.25" },
        close: { value: "102.00" },
        volume: { value: "1000000" },
      },
    ];

    const result = normalizeRows(input, "TEST");

    expect(result).toHaveLength(1);
    expect(result[0].open).toBe(100.5);
    expect(result[0].high).toBe(105.75);
    expect(result[0].low).toBe(98.25);
    expect(result[0].close).toBe(102.0);
  });

  it("should handle bigint fields", () => {
    const input = [
      {
        date: "2023-01-01",
        open: 100,
        high: 105,
        low: 98,
        close: 102,
        volume: BigInt(1000000),
      },
    ];

    const result = normalizeRows(input, "TEST");

    expect(result).toHaveLength(1);
    expect(result[0].volume).toBe(1000000);
    expect(typeof result[0].volume).toBe("number");
  });

  it("should skip rows with missing essential OHLC data", () => {
    const input = [
      {
        date: "2023-01-01",
        open: 100,
        high: 105,
        low: 98,
        close: 102,
        volume: 1000000,
      },
      {
        date: "2023-01-02",
        open: null,
        high: 105,
        low: 98,
        close: 102,
        volume: 1000000,
      },
      {
        date: "2023-01-03",
        open: 100,
        high: 105,
        low: undefined,
        close: 102,
        volume: 1000000,
      },
    ];

    const result = normalizeRows(input, "TEST");

    // Only the first row should be included
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2023-01-01");
  });

  it("should handle empty array", () => {
    const result = normalizeRows([], "EMPTY");
    expect(result).toEqual([]);
  });

  it("should handle mixed valid and invalid rows", () => {
    const input = [
      {
        date: "2023-01-01",
        open: 100,
        high: 105,
        low: 98,
        close: 102,
        volume: 1000000,
      },
      {
        date: "2023-01-02",
        // Missing OHLC data
      },
      {
        date: "2023-01-03",
        open: 110,
        high: 115,
        low: 108,
        close: 112,
        volume: 1100000,
      },
    ];

    const result = normalizeRows(input, "TEST");

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2023-01-01");
    expect(result[1].date).toBe("2023-01-03");
  });

  it("should handle string numbers", () => {
    const input = [
      {
        date: "2023-01-01",
        open: "100",
        high: "105",
        low: "98",
        close: "102",
        volume: "1000000",
      },
    ];

    const result = normalizeRows(input, "TEST");

    expect(result).toHaveLength(1);
    expect(typeof result[0].open).toBe("number");
    expect(result[0].open).toBe(100);
  });
});
