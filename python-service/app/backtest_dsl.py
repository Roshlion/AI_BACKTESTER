"""
DSL Backtest Engine - Process rule-based strategies
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any

from app.data_fetcher import fetch_multiple_tickers
from app.indicators import (
    calculate_sma,
    calculate_ema,
    calculate_rsi,
    calculate_macd,
)
from app.portfolio_sim import simulate_portfolio


def process_sma_cross_rule(df: pd.DataFrame, params: dict) -> tuple:
    """Process SMA crossover rule"""
    fast = params.get("fast", 10)
    slow = params.get("slow", 30)
    enter = params.get("enter", "fast_above")
    exit_cond = params.get("exit", "fast_below")

    sma_fast = calculate_sma(df["close"], fast)
    sma_slow = calculate_sma(df["close"], slow)

    enter_signals = np.zeros(len(df), dtype=bool)
    exit_signals = np.zeros(len(df), dtype=bool)

    if enter == "fast_above":
        enter_signals[1:] = (sma_fast.iloc[1:] > sma_slow.iloc[1:]) & (
            sma_fast.iloc[:-1].values <= sma_slow.iloc[:-1].values
        )
    else:  # fast_below
        enter_signals[1:] = (sma_fast.iloc[1:] < sma_slow.iloc[1:]) & (
            sma_fast.iloc[:-1].values >= sma_slow.iloc[:-1].values
        )

    if exit_cond == "fast_below":
        exit_signals[1:] = (sma_fast.iloc[1:] < sma_slow.iloc[1:]) & (
            sma_fast.iloc[:-1].values >= sma_slow.iloc[:-1].values
        )
    else:  # fast_above
        exit_signals[1:] = (sma_fast.iloc[1:] > sma_slow.iloc[1:]) & (
            sma_fast.iloc[:-1].values <= sma_slow.iloc[:-1].values
        )

    return enter_signals.tolist(), exit_signals.tolist()


def process_ema_cross_rule(df: pd.DataFrame, params: dict) -> tuple:
    """Process EMA crossover rule"""
    fast = params.get("fast", 12)
    slow = params.get("slow", 26)
    enter = params.get("enter", "fast_above")
    exit_cond = params.get("exit", "fast_below")

    ema_fast = calculate_ema(df["close"], fast)
    ema_slow = calculate_ema(df["close"], slow)

    enter_signals = np.zeros(len(df), dtype=bool)
    exit_signals = np.zeros(len(df), dtype=bool)

    if enter == "fast_above":
        enter_signals[1:] = (ema_fast.iloc[1:] > ema_slow.iloc[1:]) & (
            ema_fast.iloc[:-1].values <= ema_slow.iloc[:-1].values
        )
    else:  # fast_below
        enter_signals[1:] = (ema_fast.iloc[1:] < ema_slow.iloc[1:]) & (
            ema_fast.iloc[:-1].values >= ema_slow.iloc[:-1].values
        )

    if exit_cond == "fast_below":
        exit_signals[1:] = (ema_fast.iloc[1:] < ema_slow.iloc[1:]) & (
            ema_fast.iloc[:-1].values >= ema_slow.iloc[:-1].values
        )
    else:  # fast_above
        exit_signals[1:] = (ema_fast.iloc[1:] > ema_slow.iloc[1:]) & (
            ema_fast.iloc[:-1].values <= ema_slow.iloc[:-1].values
        )

    return enter_signals.tolist(), exit_signals.tolist()


def process_macd_cross_rule(df: pd.DataFrame, params: dict) -> tuple:
    """Process MACD crossover rule"""
    fast = params.get("fast", 12)
    slow = params.get("slow", 26)
    signal = params.get("signal", 9)
    enter = params.get("enter", "bull")
    exit_cond = params.get("exit", "bear")

    macd_line, signal_line, _ = calculate_macd(df["close"], fast, slow, signal)

    enter_signals = np.zeros(len(df), dtype=bool)
    exit_signals = np.zeros(len(df), dtype=bool)

    if enter == "bull":
        enter_signals[1:] = (macd_line.iloc[1:] > signal_line.iloc[1:]) & (
            macd_line.iloc[:-1].values <= signal_line.iloc[:-1].values
        )
    else:  # bear
        enter_signals[1:] = (macd_line.iloc[1:] < signal_line.iloc[1:]) & (
            macd_line.iloc[:-1].values >= signal_line.iloc[:-1].values
        )

    if exit_cond == "bear":
        exit_signals[1:] = (macd_line.iloc[1:] < signal_line.iloc[1:]) & (
            macd_line.iloc[:-1].values >= signal_line.iloc[:-1].values
        )
    else:  # bull
        exit_signals[1:] = (macd_line.iloc[1:] > signal_line.iloc[1:]) & (
            macd_line.iloc[:-1].values <= signal_line.iloc[:-1].values
        )

    return enter_signals.tolist(), exit_signals.tolist()


def process_rsi_threshold_rule(df: pd.DataFrame, params: dict) -> tuple:
    """Process RSI threshold rule"""
    period = params.get("period", 14)
    low = params.get("low", 30)
    high = params.get("high", 70)
    enter = params.get("enter", "long")

    rsi = calculate_rsi(df["close"], period)

    enter_signals = np.zeros(len(df), dtype=bool)
    exit_signals = np.zeros(len(df), dtype=bool)

    if enter == "long":
        # Buy when RSI crosses below low threshold
        enter_signals[1:] = (rsi.iloc[1:] < low) & (rsi.iloc[:-1].values >= low)
        # Sell when RSI crosses above high threshold
        exit_signals[1:] = (rsi.iloc[1:] > high) & (rsi.iloc[:-1].values <= high)
    else:  # short
        # Short when RSI crosses above high threshold
        enter_signals[1:] = (rsi.iloc[1:] > high) & (rsi.iloc[:-1].values <= high)
        # Cover when RSI crosses below low threshold
        exit_signals[1:] = (rsi.iloc[1:] < low) & (rsi.iloc[:-1].values >= low)

    return enter_signals.tolist(), exit_signals.tolist()


def apply_dsl_rules(df: pd.DataFrame, rules: List[Dict[str, Any]]) -> tuple:
    """
    Apply all DSL rules and combine signals
    Returns (enter_signals, exit_signals) as lists of booleans
    """
    combined_enter = np.zeros(len(df), dtype=bool)
    combined_exit = np.zeros(len(df), dtype=bool)

    for rule in rules:
        rule_type = rule.get("type")
        params = rule.get("params", {})

        if rule_type == "sma_cross":
            enter, exit = process_sma_cross_rule(df, params)
        elif rule_type == "ema_cross":
            enter, exit = process_ema_cross_rule(df, params)
        elif rule_type == "macd_cross":
            enter, exit = process_macd_cross_rule(df, params)
        elif rule_type == "rsi_threshold":
            enter, exit = process_rsi_threshold_rule(df, params)
        else:
            continue

        # OR logic: any rule can trigger entry/exit
        combined_enter = combined_enter | np.array(enter)
        combined_exit = combined_exit | np.array(exit)

    return combined_enter.tolist(), combined_exit.tolist()


def run_dsl_backtest(
    tickers: List[str], start: str, end: str, dsl: dict, portfolio: dict
) -> dict:
    """
    Main DSL backtest function
    """
    # Fetch data from S3
    ticker_data = fetch_multiple_tickers(tickers, start, end)

    if not ticker_data:
        return {
            "ok": False,
            "error": "No data available for any tickers",
            "summary": {},
            "perTicker": [],
            "portfolioDaily": [],
            "logs": [],
        }

    # Process each ticker and generate signals
    ticker_signals = []
    rules = dsl.get("rules", [])

    for ticker, df in ticker_data.items():
        if df.empty:
            continue

        enter_signals, exit_signals = apply_dsl_rules(df, rules)

        ticker_signals.append(
            {
                "ticker": ticker,
                "rows": df,
                "enterSignals": enter_signals,
                "exitSignals": exit_signals,
            }
        )

    # Run portfolio simulation
    result = simulate_portfolio(ticker_signals, portfolio, mode="dsl")

    return result
