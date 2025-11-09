"""
Portfolio Simulator - Apply position sizing, costs, and risk controls
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any
from dataclasses import dataclass, asdict


@dataclass
class Trade:
    date: str
    ticker: str
    side: str  # buy, sell, short, cover
    qty: float
    fillPrice: float
    fees: float
    slippage: float
    pnlPct: float = 0.0


def calculate_fees(notional: float, config: dict) -> float:
    """Calculate total trading fees"""
    fixed = config.get("commissionFixed", 0)
    pct = config.get("commissionPct", 0)
    return fixed + notional * pct


def calculate_slippage(notional: float, config: dict) -> float:
    """Calculate slippage cost"""
    bps = config.get("slippageBps", 0)
    return notional * (bps / 10000)


def calculate_position_size(cash: float, price: float, config: dict) -> float:
    """Calculate position size based on sizing method"""
    sizing = config.get("sizing", {})
    sizing_type = sizing.get("type", "percent_of_equity")

    if sizing_type == "fixed_dollar":
        return min(sizing.get("amount", 10000), cash)
    elif sizing_type == "percent_of_equity":
        return cash * (sizing.get("pct", 10) / 100)
    elif sizing_type == "risk_per_trade_pct":
        return cash * (sizing.get("pct", 1) / 100)
    else:
        return cash * 0.1


def simulate_portfolio(
    ticker_signals: List[Dict[str, Any]], config: dict, mode: str = "dsl"
) -> dict:
    """
    Main portfolio simulation
    ticker_signals: List of {ticker, rows: DataFrame, enterSignals: List[bool], exitSignals: List[bool]}
    config: Portfolio configuration dict
    mode: "dsl" or "ml"
    """
    cash = config.get("startingCash", 100000)
    positions = {}  # ticker -> {qty, entryPrice, entryDate}
    trades = []
    daily_records = []

    # Get all unique dates
    all_dates = sorted(
        set(
            date
            for ts in ticker_signals
            for date in ts["rows"]["date"].tolist()
        )
    )

    if not all_dates:
        return create_empty_result(config, mode, "", "")

    start_date = all_dates[0]
    end_date = all_dates[-1]
    high_water_mark = cash

    # Daily loop
    for date in all_dates:
        # Process each ticker
        for ticker_signal in ticker_signals:
            ticker = ticker_signal["ticker"]
            df = ticker_signal["rows"]
            enter_signals = ticker_signal["enterSignals"]
            exit_signals = ticker_signal["exitSignals"]

            # Find row for this date
            row_idx = df[df["date"] == date].index
            if len(row_idx) == 0:
                continue

            idx = row_idx[0]
            price = df.loc[idx, "close"]
            position = positions.get(ticker)

            # Check exit signals first
            if position and exit_signals[idx]:
                qty = position["qty"]
                notional = abs(qty * price)
                fees = calculate_fees(notional, config)
                slippage = calculate_slippage(notional, config)

                cash += qty * price - fees - slippage

                pnl_pct = ((price - position["entryPrice"]) / position["entryPrice"]) * 100

                trades.append(
                    Trade(
                        date=date,
                        ticker=ticker,
                        side="sell" if qty > 0 else "cover",
                        qty=abs(qty),
                        fillPrice=price,
                        fees=fees,
                        slippage=slippage,
                        pnlPct=pnl_pct,
                    )
                )

                del positions[ticker]

            # Check enter signals
            elif not position and enter_signals[idx]:
                sizing = calculate_position_size(cash, price, config)
                if sizing > 0:
                    qty = int(sizing / price)
                    if qty > 0:
                        notional = qty * price
                        fees = calculate_fees(notional, config)
                        slippage = calculate_slippage(notional, config)

                        if cash >= notional + fees + slippage:
                            cash -= notional + fees + slippage

                            positions[ticker] = {
                                "qty": qty,
                                "entryPrice": price,
                                "entryDate": date,
                            }

                            trades.append(
                                Trade(
                                    date=date,
                                    ticker=ticker,
                                    side="buy",
                                    qty=qty,
                                    fillPrice=price,
                                    fees=fees,
                                    slippage=slippage,
                                )
                            )

            # Check stop loss / take profit
            if position:
                stop_loss_pct = config.get("stopLossPct")
                take_profit_pct = config.get("takeProfitPct")
                pnl_pct = ((price - position["entryPrice"]) / position["entryPrice"]) * 100

                triggered = False
                if stop_loss_pct and pnl_pct <= -stop_loss_pct:
                    triggered = True
                elif take_profit_pct and pnl_pct >= take_profit_pct:
                    triggered = True

                if triggered:
                    qty = position["qty"]
                    notional = abs(qty * price)
                    fees = calculate_fees(notional, config)
                    slippage = calculate_slippage(notional, config)

                    cash += qty * price - fees - slippage

                    trades.append(
                        Trade(
                            date=date,
                            ticker=ticker,
                            side="sell",
                            qty=abs(qty),
                            fillPrice=price,
                            fees=fees,
                            slippage=slippage,
                            pnlPct=pnl_pct,
                        )
                    )

                    del positions[ticker]

        # Calculate daily NAV
        market_value = 0
        for ticker, position in positions.items():
            # Find current price for this ticker
            for ts in ticker_signals:
                if ts["ticker"] == ticker:
                    df = ts["rows"]
                    row = df[df["date"] == date]
                    if not row.empty:
                        market_value += position["qty"] * row.iloc[0]["close"]
                    break

        nav = cash + market_value
        high_water_mark = max(high_water_mark, nav)
        drawdown_pct = ((nav - high_water_mark) / high_water_mark) * 100
        exposure_pct = (abs(market_value) / nav * 100) if nav > 0 else 0

        daily_records.append(
            {"date": date, "nav": nav, "drawdownPct": drawdown_pct, "exposurePct": exposure_pct}
        )

    # Calculate summary statistics
    ending_equity = daily_records[-1]["nav"] if daily_records else cash
    total_return_pct = ((ending_equity - config["startingCash"]) / config["startingCash"]) * 100

    # Risk metrics
    returns = [
        (daily_records[i]["nav"] - daily_records[i - 1]["nav"]) / daily_records[i - 1]["nav"]
        for i in range(1, len(daily_records))
    ]

    volatility_pct = np.std(returns) * np.sqrt(252) * 100 if len(returns) > 1 else 0
    sharpe = (total_return_pct / volatility_pct) * np.sqrt(252) if volatility_pct > 0 else 0

    downside_returns = [r for r in returns if r < 0]
    sortino = 0
    if len(downside_returns) > 1:
        downside_vol = np.std(downside_returns) * np.sqrt(252) * 100
        sortino = (total_return_pct / downside_vol) * np.sqrt(252) if downside_vol > 0 else 0

    max_drawdown_pct = min([d["drawdownPct"] for d in daily_records]) if daily_records else 0
    avg_exposure_pct = np.mean([d["exposurePct"] for d in daily_records]) if daily_records else 0

    # Trade statistics
    winning_trades = [t for t in trades if t.pnlPct > 0]
    losing_trades = [t for t in trades if t.pnlPct < 0]
    win_rate_pct = (len(winning_trades) / len(trades) * 100) if trades else 0
    avg_win_pct = np.mean([t.pnlPct for t in winning_trades]) if winning_trades else 0
    avg_loss_pct = np.mean([t.pnlPct for t in losing_trades]) if losing_trades else 0

    daily_returns_pct = [r * 100 for r in returns]
    best_day_pct = max(daily_returns_pct) if daily_returns_pct else 0
    worst_day_pct = min(daily_returns_pct) if daily_returns_pct else 0

    # Calculate CAGR
    years = (pd.to_datetime(end_date) - pd.to_datetime(start_date)).days / 365.25
    cagr = ((ending_equity / config["startingCash"]) ** (1 / years) - 1) * 100 if years > 0 else 0

    # Per-ticker attribution
    per_ticker = []
    for ticker_signal in ticker_signals:
        ticker = ticker_signal["ticker"]
        ticker_trades = [t for t in trades if t.ticker == ticker]
        ticker_win_rate = (
            len([t for t in ticker_trades if t.pnlPct > 0]) / len(ticker_trades) * 100
            if ticker_trades
            else 0
        )
        avg_trade_pct = np.mean([t.pnlPct for t in ticker_trades]) if ticker_trades else 0

        # Simplified equity curve per ticker
        ticker_equity = config["startingCash"] / len(ticker_signals)
        equity_curve = []

        for row_idx, row in ticker_signal["rows"].iterrows():
            trades_on_date = [t for t in ticker_trades if t.date == row["date"]]
            for trade in trades_on_date:
                if trade.pnlPct:
                    ticker_equity *= 1 + trade.pnlPct / 100
            equity_curve.append({"date": row["date"], "nav": ticker_equity})

        ticker_return_pct = (
            (ticker_equity - config["startingCash"] / len(ticker_signals))
            / (config["startingCash"] / len(ticker_signals))
            * 100
        )

        per_ticker.append(
            {
                "ticker": ticker,
                "stats": {
                    "totalReturnPct": ticker_return_pct,
                    "trades": len(ticker_trades),
                    "winRatePct": ticker_win_rate,
                    "avgTradePct": avg_trade_pct,
                    "contributionPct": (ticker_return_pct / total_return_pct * 100)
                    if total_return_pct != 0
                    else 0,
                },
                "trades": [asdict(t) for t in ticker_trades],
                "equity": equity_curve,
            }
        )

    summary = {
        "mode": mode,
        "startDate": start_date,
        "endDate": end_date,
        "startingCash": config["startingCash"],
        "endingEquity": ending_equity,
        "totalReturnPct": total_return_pct,
        "CAGR": cagr,
        "volatilityPct": volatility_pct,
        "sharpe": sharpe,
        "sortino": sortino,
        "maxDrawdownPct": max_drawdown_pct,
        "exposurePct": avg_exposure_pct,
        "turnoverPct": 0,  # TODO
        "totalTrades": len(trades),
        "winRatePct": win_rate_pct,
        "avgWinPct": avg_win_pct,
        "avgLossPct": avg_loss_pct,
        "bestDayPct": best_day_pct,
        "worstDayPct": worst_day_pct,
    }

    return {
        "ok": True,
        "summary": summary,
        "perTicker": per_ticker,
        "portfolioDaily": daily_records,
        "logs": [],
    }


def create_empty_result(config: dict, mode: str, start: str, end: str) -> dict:
    """Create an empty result when no data available"""
    return {
        "ok": False,
        "summary": {
            "mode": mode,
            "startDate": start,
            "endDate": end,
            "startingCash": config.get("startingCash", 100000),
            "endingEquity": config.get("startingCash", 100000),
            "totalReturnPct": 0,
            "CAGR": 0,
            "volatilityPct": 0,
            "sharpe": 0,
            "sortino": 0,
            "maxDrawdownPct": 0,
            "exposurePct": 0,
            "turnoverPct": 0,
            "totalTrades": 0,
            "winRatePct": 0,
            "avgWinPct": 0,
            "avgLossPct": 0,
            "bestDayPct": 0,
            "worstDayPct": 0,
        },
        "perTicker": [],
        "portfolioDaily": [],
        "logs": ["No data available for simulation"],
    }
