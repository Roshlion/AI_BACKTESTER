import type { Row } from "@/types/row";
import type {
  PortfolioConfig,
  Trade,
  PortfolioDaily,
  PortfolioStats,
  TickerAttribution,
  BacktestResults,
} from "@/types/portfolio";

export interface TickerSignals {
  ticker: string;
  rows: Row[];
  enterSignals: boolean[];
  exitSignals: boolean[];
}

interface Position {
  ticker: string;
  qty: number;
  entryPrice: number;
  entryDate: string;
}

export function simulatePortfolio(
  tickerSignals: TickerSignals[],
  config: PortfolioConfig,
  mode: "dsl" | "ml" = "dsl"
): BacktestResults {
  // Initialize state
  let cash = config.startingCash;
  const positions: Map<string, Position> = new Map();
  const trades: Trade[] = [];
  const dailyRecords: PortfolioDaily[] = [];

  // Get all unique dates across all tickers
  const allDates = Array.from(
    new Set(tickerSignals.flatMap((ts) => ts.rows.map((r) => r.date)))
  ).sort();

  if (allDates.length === 0) {
    return {
      ok: false,
      summary: createEmptySummary(config, mode, "", ""),
      perTicker: [],
      portfolioDaily: [],
      logs: ["No data available for simulation"],
    };
  }

  const startDate = allDates[0];
  const endDate = allDates[allDates.length - 1];

  // Track highest NAV for drawdown calculation
  let highWaterMark = config.startingCash;

  // Daily simulation loop
  for (const date of allDates) {
    // Process each ticker for this date
    for (const { ticker, rows, enterSignals, exitSignals } of tickerSignals) {
      const idx = rows.findIndex((r) => r.date === date);
      if (idx < 0) continue;

      const row = rows[idx];
      const price = row.close;
      const position = positions.get(ticker);

      // Check exit signals first
      if (position && exitSignals[idx]) {
        const qty = position.qty;
        const notional = Math.abs(qty * price);
        const fees = calculateFees(notional, config);
        const slippage = calculateSlippage(notional, config);

        cash += qty * price - fees - slippage;

        const pnlPct = ((price - position.entryPrice) / position.entryPrice) * 100;

        trades.push({
          date,
          ticker,
          side: qty > 0 ? "sell" : "cover",
          qty: Math.abs(qty),
          fillPrice: price,
          fees,
          slippage,
          pnlPct,
        });

        positions.delete(ticker);
      }
      // Check enter signals
      else if (!position && enterSignals[idx]) {
        const sizing = calculatePositionSize(cash, price, config);
        if (sizing > 0) {
          const qty = Math.floor(sizing / price);
          if (qty > 0) {
            const notional = qty * price;
            const fees = calculateFees(notional, config);
            const slippage = calculateSlippage(notional, config);

            if (cash >= notional + fees + slippage) {
              cash -= notional + fees + slippage;

              positions.set(ticker, {
                ticker,
                qty,
                entryPrice: price,
                entryDate: date,
              });

              trades.push({
                date,
                ticker,
                side: "buy",
                qty,
                fillPrice: price,
                fees,
                slippage,
              });
            }
          }
        }
      }

      // Check stop loss / take profit
      if (position && config.stopLossPct) {
        const pnlPct = ((price - position.entryPrice) / position.entryPrice) * 100;
        if (pnlPct <= -config.stopLossPct) {
          // Trigger stop loss
          const qty = position.qty;
          const notional = Math.abs(qty * price);
          const fees = calculateFees(notional, config);
          const slippage = calculateSlippage(notional, config);

          cash += qty * price - fees - slippage;

          trades.push({
            date,
            ticker,
            side: "sell",
            qty: Math.abs(qty),
            fillPrice: price,
            fees,
            slippage,
            pnlPct,
          });

          positions.delete(ticker);
        }
      }

      if (position && config.takeProfitPct) {
        const pnlPct = ((price - position.entryPrice) / position.entryPrice) * 100;
        if (pnlPct >= config.takeProfitPct) {
          // Trigger take profit
          const qty = position.qty;
          const notional = Math.abs(qty * price);
          const fees = calculateFees(notional, config);
          const slippage = calculateSlippage(notional, config);

          cash += qty * price - fees - slippage;

          trades.push({
            date,
            ticker,
            side: "sell",
            qty: Math.abs(qty),
            fillPrice: price,
            fees,
            slippage,
            pnlPct,
          });

          positions.delete(ticker);
        }
      }
    }

    // Calculate daily NAV
    let marketValue = 0;
    for (const { ticker, rows } of tickerSignals) {
      const position = positions.get(ticker);
      if (position) {
        const row = rows.find((r) => r.date === date);
        if (row) {
          marketValue += position.qty * row.close;
        }
      }
    }

    const nav = cash + marketValue;
    highWaterMark = Math.max(highWaterMark, nav);
    const drawdownPct = ((nav - highWaterMark) / highWaterMark) * 100;
    const exposurePct = nav > 0 ? (Math.abs(marketValue) / nav) * 100 : 0;

    dailyRecords.push({
      date,
      nav,
      drawdownPct,
      exposurePct,
    });
  }

  // Calculate summary statistics
  const endingEquity = dailyRecords[dailyRecords.length - 1]?.nav || config.startingCash;
  const totalReturnPct = ((endingEquity - config.startingCash) / config.startingCash) * 100;

  // Calculate risk metrics
  const returns = dailyRecords.slice(1).map((d, i) =>
    (d.nav - dailyRecords[i].nav) / dailyRecords[i].nav
  );

  const volatilityPct = calculateVolatility(returns) * 100;
  const sharpe = volatilityPct > 0 ? (totalReturnPct / volatilityPct) * Math.sqrt(252) : 0;
  const sortino = calculateSortino(returns, totalReturnPct);

  const maxDrawdownPct = Math.min(...dailyRecords.map((d) => d.drawdownPct));
  const avgExposurePct = dailyRecords.reduce((sum, d) => sum + d.exposurePct, 0) / dailyRecords.length;

  // Trade statistics
  const winningTrades = trades.filter((t) => (t.pnlPct ?? 0) > 0);
  const losingTrades = trades.filter((t) => (t.pnlPct ?? 0) < 0);
  const winRatePct = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const avgWinPct = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + (t.pnlPct ?? 0), 0) / winningTrades.length
    : 0;
  const avgLossPct = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + (t.pnlPct ?? 0), 0) / losingTrades.length
    : 0;

  const dailyReturns = returns.map((r) => r * 100);
  const bestDayPct = dailyReturns.length > 0 ? Math.max(...dailyReturns) : 0;
  const worstDayPct = dailyReturns.length > 0 ? Math.min(...dailyReturns) : 0;

  // Calculate per-ticker attribution
  const perTicker: TickerAttribution[] = tickerSignals.map(({ ticker, rows }) => {
    const tickerTrades = trades.filter((t) => t.ticker === ticker);
    const tickerWinRate = tickerTrades.length > 0
      ? (tickerTrades.filter((t) => (t.pnlPct ?? 0) > 0).length / tickerTrades.length) * 100
      : 0;
    const avgTradePct = tickerTrades.length > 0
      ? tickerTrades.reduce((sum, t) => sum + (t.pnlPct ?? 0), 0) / tickerTrades.length
      : 0;

    // Calculate ticker equity curve
    let tickerEquity = config.startingCash / tickerSignals.length; // Simplified allocation
    const tickerEquityCurve: { date: string; nav: number }[] = [];

    for (const row of rows) {
      const tradesOnDate = tickerTrades.filter((t) => t.date === row.date);
      for (const trade of tradesOnDate) {
        if (trade.pnlPct) {
          tickerEquity *= 1 + trade.pnlPct / 100;
        }
      }
      tickerEquityCurve.push({ date: row.date, nav: tickerEquity });
    }

    const tickerReturnPct = ((tickerEquity - config.startingCash / tickerSignals.length) /
      (config.startingCash / tickerSignals.length)) * 100;

    return {
      ticker,
      stats: {
        totalReturnPct: tickerReturnPct,
        trades: tickerTrades.length,
        winRatePct: tickerWinRate,
        avgTradePct,
        contributionPct: (tickerReturnPct / totalReturnPct) * 100,
      },
      trades: tickerTrades,
      equity: tickerEquityCurve,
    };
  });

  const summary: PortfolioStats = {
    mode,
    startDate,
    endDate,
    startingCash: config.startingCash,
    endingEquity,
    totalReturnPct,
    CAGR: calculateCAGR(config.startingCash, endingEquity, startDate, endDate),
    volatilityPct,
    sharpe,
    sortino,
    maxDrawdownPct,
    exposurePct: avgExposurePct,
    turnoverPct: 0, // TODO: Calculate turnover
    totalTrades: trades.length,
    winRatePct,
    avgWinPct,
    avgLossPct,
    bestDayPct,
    worstDayPct,
  };

  return {
    ok: true,
    summary,
    perTicker,
    portfolioDaily: dailyRecords,
    logs: [],
  };
}

function calculateFees(notional: number, config: PortfolioConfig): number {
  const fixed = config.commissionFixed ?? 0;
  const pct = config.commissionPct ?? 0;
  return fixed + notional * pct;
}

function calculateSlippage(notional: number, config: PortfolioConfig): number {
  const bps = config.slippageBps ?? 0;
  return notional * (bps / 10000);
}

function calculatePositionSize(cash: number, price: number, config: PortfolioConfig): number {
  const { sizing } = config;

  switch (sizing.type) {
    case "fixed_dollar":
      return Math.min(sizing.amount ?? 10000, cash);

    case "percent_of_equity":
      return (cash * (sizing.pct ?? 10)) / 100;

    case "risk_per_trade_pct":
      // Simplified: assumes ATR-based stop
      return (cash * (sizing.pct ?? 1)) / 100;

    default:
      return cash * 0.1; // Default to 10%
  }
}

function calculateVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

function calculateSortino(returns: number[], targetReturn: number): number {
  if (returns.length < 2) return 0;
  const downside = returns.filter((r) => r < 0);
  if (downside.length === 0) return 0;
  const downsideVol = calculateVolatility(downside);
  return downsideVol > 0 ? (targetReturn / (downsideVol * 100)) * Math.sqrt(252) : 0;
}

function calculateCAGR(start: number, end: number, startDate: string, endDate: string): number {
  const years = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years <= 0 || start <= 0) return 0;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

function createEmptySummary(config: PortfolioConfig, mode: "dsl" | "ml", start: string, end: string): PortfolioStats {
  return {
    mode,
    startDate: start,
    endDate: end,
    startingCash: config.startingCash,
    endingEquity: config.startingCash,
    totalReturnPct: 0,
    CAGR: 0,
    volatilityPct: 0,
    sharpe: 0,
    sortino: 0,
    maxDrawdownPct: 0,
    exposurePct: 0,
    turnoverPct: 0,
    totalTrades: 0,
    winRatePct: 0,
    avgWinPct: 0,
    avgLossPct: 0,
    bestDayPct: 0,
    worstDayPct: 0,
  };
}
