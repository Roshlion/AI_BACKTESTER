// Portfolio configuration types for backtesting

export type PositionSizingType = "fixed_dollar" | "percent_of_equity" | "risk_per_trade_pct";

export interface PositionSizing {
  type: PositionSizingType;
  amount?: number;           // for fixed_dollar
  pct?: number;              // for percent_of_equity or risk_per_trade_pct
  atr_lookback?: number;     // for risk_per_trade_pct
}

export interface PortfolioConfig {
  startingCash: number;
  initialPositions?: Record<string, number>;  // ticker -> shares
  leverage?: number;
  maxGross?: number;
  commissionFixed?: number;
  commissionPct?: number;     // e.g., 0.0005 = 5 bps
  slippageBps?: number;       // e.g., 2 = 2 bps
  borrowRateShort?: number;   // annualized; applied daily
  allowShort?: boolean;
  sizing: PositionSizing;
  maxPositions?: number;
  maxWeightPerTicker?: number;
  rebalance?: "none" | "daily" | "weekly" | "monthly";
  rebalanceDriftPct?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  benchmark?: string;
}

export interface Trade {
  date: string;
  ticker: string;
  side: "buy" | "sell" | "short" | "cover";
  qty: number;
  fillPrice: number;
  fees: number;
  slippage: number;
  pnlPct?: number;
}

export interface PortfolioDaily {
  date: string;
  nav: number;
  drawdownPct: number;
  exposurePct: number;
}

export interface PortfolioStats {
  mode: "dsl" | "ml";
  startDate: string;
  endDate: string;
  startingCash: number;
  endingEquity: number;
  totalReturnPct: number;
  CAGR?: number;
  volatilityPct?: number;
  sharpe?: number;
  sortino?: number;
  maxDrawdownPct?: number;
  exposurePct?: number;
  turnoverPct?: number;
  totalTrades: number;
  winRatePct?: number;
  avgWinPct?: number;
  avgLossPct?: number;
  bestDayPct?: number;
  worstDayPct?: number;
  benchmark?: {
    totalReturnPct: number;
    alphaPct: number;
    beta: number;
  };
}

export interface TickerAttribution {
  ticker: string;
  stats: {
    totalReturnPct: number;
    trades: number;
    winRatePct: number;
    avgTradePct: number;
    contributionPct: number;
  };
  trades: Trade[];
  equity: { date: string; nav: number }[];
}

export interface BacktestResults {
  ok: boolean;
  summary: PortfolioStats;
  perTicker: TickerAttribution[];
  portfolioDaily: PortfolioDaily[];
  logs?: string[];
}
