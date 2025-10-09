"""
Tests for portfolio simulator
"""

import pytest
import pandas as pd
import numpy as np
from app.portfolio_sim import simulate_portfolio, calculate_fees, calculate_slippage


def test_calculate_fees():
    """Test fee calculation"""
    config = {"commissionFixed": 1.0, "commissionPct": 0.001}

    # $10,000 notional: $1 fixed + $10 variable = $11
    fees = calculate_fees(10000, config)
    assert fees == 11.0

    # Zero fees
    config_zero = {"commissionFixed": 0, "commissionPct": 0}
    fees_zero = calculate_fees(10000, config_zero)
    assert fees_zero == 0.0


def test_calculate_slippage():
    """Test slippage calculation"""
    config = {"slippageBps": 5}  # 5 basis points

    # $10,000 notional at 5 bps = $5
    slippage = calculate_slippage(10000, config)
    assert slippage == 5.0

    # Zero slippage
    config_zero = {"slippageBps": 0}
    slippage_zero = calculate_slippage(10000, config_zero)
    assert slippage_zero == 0.0


def test_empty_portfolio():
    """Test empty portfolio simulation"""
    config = {
        "startingCash": 100000,
        "sizing": {"type": "percent_of_equity", "pct": 10},
        "commissionFixed": 0,
        "commissionPct": 0,
        "slippageBps": 0,
    }

    result = simulate_portfolio([], config, "dsl")

    assert result["ok"] is False
    assert result["summary"]["endingEquity"] == 100000
    assert result["summary"]["totalReturnPct"] == 0


def test_simple_trade_sequence():
    """Test a simple buy-hold-sell sequence"""
    df = pd.DataFrame({
        "date": ["2023-01-01", "2023-01-02", "2023-01-03", "2023-01-04", "2023-01-05"],
        "open": [100, 102, 104, 106, 108],
        "high": [105, 107, 109, 111, 113],
        "low": [98, 100, 102, 104, 106],
        "close": [102, 104, 106, 108, 110],
        "volume": [1000, 1200, 1100, 1300, 1400],
    })

    ticker_signals = [
        {
            "ticker": "AAPL",
            "rows": df,
            "enterSignals": [True, False, False, False, False],
            "exitSignals": [False, False, False, False, True],
        }
    ]

    config = {
        "startingCash": 100000,
        "sizing": {"type": "percent_of_equity", "pct": 10},
        "commissionFixed": 0,
        "commissionPct": 0.0005,
        "slippageBps": 2,
    }

    result = simulate_portfolio(ticker_signals, config, "dsl")

    assert result["ok"] is True
    assert result["summary"]["totalTrades"] == 2  # Buy + Sell
    assert result["summary"]["totalReturnPct"] > 0  # Price went up
    assert len(result["perTicker"]) == 1
    assert result["perTicker"][0]["ticker"] == "AAPL"


def test_multiple_tickers():
    """Test portfolio with multiple tickers"""
    df1 = pd.DataFrame({
        "date": ["2023-01-01", "2023-01-02"],
        "open": [100, 102],
        "high": [105, 107],
        "low": [98, 100],
        "close": [102, 104],
        "volume": [1000, 1200],
    })

    df2 = pd.DataFrame({
        "date": ["2023-01-01", "2023-01-02"],
        "open": [200, 202],
        "high": [205, 207],
        "low": [198, 200],
        "close": [202, 204],
        "volume": [2000, 2200],
    })

    ticker_signals = [
        {
            "ticker": "AAPL",
            "rows": df1,
            "enterSignals": [True, False],
            "exitSignals": [False, True],
        },
        {
            "ticker": "MSFT",
            "rows": df2,
            "enterSignals": [True, False],
            "exitSignals": [False, True],
        },
    ]

    config = {
        "startingCash": 100000,
        "sizing": {"type": "percent_of_equity", "pct": 10},
        "commissionFixed": 0,
        "commissionPct": 0,
        "slippageBps": 0,
    }

    result = simulate_portfolio(ticker_signals, config, "dsl")

    assert result["ok"] is True
    assert len(result["perTicker"]) == 2
    assert result["summary"]["totalTrades"] == 4  # 2 buys + 2 sells


def test_stop_loss():
    """Test stop loss functionality"""
    df = pd.DataFrame({
        "date": ["2023-01-01", "2023-01-02", "2023-01-03"],
        "open": [100, 95, 90],
        "high": [105, 100, 95],
        "low": [98, 90, 85],
        "close": [100, 92, 88],
        "volume": [1000, 1200, 1100],
    })

    ticker_signals = [
        {
            "ticker": "STOP",
            "rows": df,
            "enterSignals": [True, False, False],
            "exitSignals": [False, False, False],  # No manual exit
        }
    ]

    config = {
        "startingCash": 100000,
        "sizing": {"type": "percent_of_equity", "pct": 10},
        "commissionFixed": 0,
        "commissionPct": 0,
        "slippageBps": 0,
        "stopLossPct": 5,  # 5% stop loss
    }

    result = simulate_portfolio(ticker_signals, config, "dsl")

    assert result["ok"] is True
    # Stop loss should trigger when price drops below 95 (5% below 100)
    assert result["summary"]["totalTrades"] >= 2  # Entry + stop loss exit
