"""
ML Backtest Engine - Train models and generate trading signals
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
import subprocess
import json
import tempfile
import os

from app.data_fetcher import fetch_multiple_tickers
from app.portfolio_sim import simulate_portfolio


def run_ml_backtest(
    tickers: List[str],
    start: str,
    end: str,
    model_type: str,
    code: Optional[str],
    hyperparams: dict,
    portfolio: dict,
) -> dict:
    """
    Main ML backtest function
    Can run either template-based or custom code
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

    # For now, use a simple template approach
    # In production, you'd run custom code in a sandboxed environment
    ticker_signals = []

    for ticker, df in ticker_data.items():
        if df.empty:
            continue

        # Generate simple ML signals based on returns
        # This is a placeholder - you'd actually train a model here
        enter_signals, exit_signals = generate_simple_ml_signals(df, hyperparams)

        ticker_signals.append(
            {
                "ticker": ticker,
                "rows": df,
                "enterSignals": enter_signals,
                "exitSignals": exit_signals,
            }
        )

    # Run portfolio simulation
    result = simulate_portfolio(ticker_signals, portfolio, mode="ml")

    return result


def generate_simple_ml_signals(df: pd.DataFrame, hyperparams: dict) -> tuple:
    """
    Generate simple ML-like signals
    In production, this would train and run an actual ML model
    """
    # Calculate features
    df = df.copy()
    df["returns"] = df["close"].pct_change()
    df["sma_20"] = df["close"].rolling(20).mean()
    df["sma_50"] = df["close"].rolling(50).mean()

    # Simple rule: buy when short SMA crosses above long SMA
    enter_signals = np.zeros(len(df), dtype=bool)
    exit_signals = np.zeros(len(df), dtype=bool)

    enter_signals[1:] = (df["sma_20"].iloc[1:] > df["sma_50"].iloc[1:]) & (
        df["sma_20"].iloc[:-1].values <= df["sma_50"].iloc[:-1].values
    )

    exit_signals[1:] = (df["sma_20"].iloc[1:] < df["sma_50"].iloc[1:]) & (
        df["sma_20"].iloc[:-1].values >= df["sma_50"].iloc[:-1].values
    )

    return enter_signals.tolist(), exit_signals.tolist()


# TODO: Implement actual ML model training and prediction
# This would involve:
# 1. Feature engineering (technical indicators, price patterns, etc.)
# 2. Train/test split based on train_window
# 3. Model training with hyperparams
# 4. Prediction generation
# 5. Signal conversion (predictions -> buy/sell signals)
