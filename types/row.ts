// types/row.ts
export type Row = {
  ticker: string;
  date: string;
  timestamp: number;
  open: number; high: number; low: number; close: number;
  volume: number; vwap?: number; transactions?: number;
};
export type MarketRow = Row;
// Alias for API routes expecting MarketRow
export type MarketRow = Row;
