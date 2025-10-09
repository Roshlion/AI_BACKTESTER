# ML Agents Documentation

This document describes the Machine Learning agents and infrastructure for the AI Backtester application.

## 1. Purpose & Scope of ML Agent

The ML agent system enables users to create, configure, and backtest machine learning-based trading strategies. Unlike rule-based (DSL) strategies that rely on explicit technical indicators and thresholds, ML strategies use trained models to predict price movements and generate trading signals.

**Key Capabilities:**
- Generate ML model configurations from natural language descriptions
- Support for multiple ML model types (Random Forest, XGBoost, Prophet, etc.)
- Editable hyperparameter tuning via UI
- Training and prediction on historical OHLCV data
- Integration with external Python ML service

## 2. Data Sources Available

### OHLCV Data
- **Source**: S3 bucket with Parquet files
- **Columns**: date, open, high, low, close, volume
- **Access**: Via `/api/index` for ticker list and `readTickerRange()` for historical data
- **Format**: Daily bars

### Technical Indicators
Currently computed server-side or within the ML service:
- **SMA**: Simple Moving Average (customizable periods)
- **EMA**: Exponential Moving Average (customizable periods)
- **RSI**: Relative Strength Index (14-period)
- **MACD**: Moving Average Convergence Divergence (12/26/9)

## 3. Current ML Endpoints

### POST /ml/generate

Generate ML model configuration from natural language description.

**Request**:
```json
{
  "description": "Predict price movements using SMA and RSI",
  "tickers": ["AAPL", "MSFT"],
  "start": "2024-01-01",
  "end": "2024-12-31"
}
```

**Response**:
```json
{
  "modelType": "RandomForestRegressor",
  "summary": {
    "purpose": "Predict price movements using technical indicators"
  },
  "codeTemplate": "# Python template with {{tokens}}",
  "hyperparams": { "n_estimators": 200, ...  },
  "uiSchema": { ... }
}
```

### POST /ml/run

Train ML model and generate predictions.

**Request**:
```json
{
  "tickers": ["AAPL"],
  "start": "2024-01-01",
  "end": "2024-12-31",
  "modelType": "RandomForestRegressor",
  "code": "# Rendered Python code",
  "hyperparams": { ... }
}
```

**Response**:
```json
{
  "metrics": { "rmse": 5.23, "mape": 0.034 },
  "predictions": [{ "date": "2024-06-01", "y": 150.23, "yhat": 149.87 }, ...]
}
```

## 4. Current Model Templates Supported

### RandomForestRegressor (Baseline)
**Status**: Implemented
**Hyperparameters**:
- n_estimators: 50-1000 (default 200)
- max_depth: 2-30 (default 8)
- window: 5-250 days (default 60)
- test_size: 0.1-0.5 (default 0.2)
- random_state: 0-9999 (default 42)

### Planned Models
- XGBoost, Prophet, LSTM, LightGBM

## 5. Feature Engineering Currently Applied

- Returns (percentage price change)
- SMA (20 and 50 periods)
- RSI (14-period)
- Lagged features (previous N days' close prices)

## 6. Hyperparameter Schema and Defaults

UI schema defines rendering and validation:

```typescript
{
  type: 'number' | 'select' | 'text',
  min?: number,
  max?: number,
  step?: number,
  options?: string[],
  help?: string
}
```

## 7. Evaluation Metrics

**Current**:
- RMSE (Root Mean Squared Error)
- MAPE (Mean Absolute Percentage Error)

**Planned**: MAE, R², Sharpe Ratio, Max Drawdown, Win Rate

## 8. Known Limits

- Timeout: 20-30 seconds
- Daily bars only (no intraday)
- Single-ticker models
- No model persistence
- Requires ML_API_URL or ALLOW_LOCAL_PY=1

## 9. Deployment Pointers

**Environment**: `ML_API_URL=https://<service-url>`

**Options**:
- AWS App Runner (recommended)
- AWS Lambda + API Gateway
- ECS Fargate + ALB
- Railway/Render/Fly.io

## 10. Next Iteration TODOs

**High Priority**:
- Add XGBoost and LightGBM
- Model persistence
- More evaluation metrics
- Multi-ticker portfolios

**Medium Priority**:
- Prophet, custom features, classification models

**Infrastructure**:
- Authentication, caching, monitoring, CI/CD

---

**Last Updated**: 2025-10-08
**Version**: 1.0.0
