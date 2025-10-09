"""
S3 Data Fetcher - Fetch OHLCV data from S3 via HTTPS
"""

import os
import requests
import pandas as pd
import io
from typing import List


S3_BASE = os.environ.get("S3_BASE", "")


def fetch_ticker_data(ticker: str, start: str, end: str) -> pd.DataFrame:
    """
    Fetch OHLCV data for a single ticker from S3
    Returns a DataFrame with columns: date, open, high, low, close, volume
    """
    if not S3_BASE:
        raise ValueError("S3_BASE environment variable not set")

    # Try Parquet first, then JSON
    for ext in [".parquet", ".json"]:
        url = f"{S3_BASE}/{ticker}{ext}"
        try:
            response = requests.get(url, timeout=30)
            if response.status_code == 200:
                if ext == ".parquet":
                    df = pd.read_parquet(io.BytesIO(response.content))
                else:
                    df = pd.read_json(io.StringIO(response.text))

                # Normalize column names
                df.columns = df.columns.str.lower()

                # Ensure date column exists
                if "date" not in df.columns:
                    if "timestamp" in df.columns:
                        df["date"] = df["timestamp"]
                    elif df.index.name == "date":
                        df = df.reset_index()

                # Filter by date range
                df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
                df = df[(df["date"] >= start) & (df["date"] <= end)]

                # Ensure required columns
                required = ["date", "open", "high", "low", "close", "volume"]
                for col in required:
                    if col not in df.columns:
                        raise ValueError(f"Missing column: {col} in {ticker} data")

                return df[required].sort_values("date").reset_index(drop=True)
        except Exception as e:
            if ext == ".json":  # Last attempt
                raise ValueError(f"Failed to fetch {ticker}: {str(e)}")
            continue

    raise ValueError(f"No data found for {ticker}")


def fetch_multiple_tickers(tickers: List[str], start: str, end: str) -> dict:
    """
    Fetch data for multiple tickers
    Returns a dict mapping ticker -> DataFrame
    """
    data = {}
    errors = []

    for ticker in tickers:
        try:
            df = fetch_ticker_data(ticker, start, end)
            if not df.empty:
                data[ticker] = df
        except Exception as e:
            errors.append(f"{ticker}: {str(e)}")

    if errors:
        print(f"Errors fetching data: {errors}")

    return data
