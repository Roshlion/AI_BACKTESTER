"""
Python microservice for AI Backtester
Handles DSL-based and ML-based backtesting with S3 data access
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn

from app.backtest_dsl import run_dsl_backtest
from app.backtest_ml import run_ml_backtest

app = FastAPI(title="AI Backtester Python Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class PositionSizing(BaseModel):
    type: str  # "fixed_dollar" | "percent_of_equity" | "risk_per_trade_pct"
    amount: Optional[float] = None
    pct: Optional[float] = None
    atr_lookback: Optional[int] = None


class PortfolioConfig(BaseModel):
    startingCash: float = 100000
    leverage: Optional[float] = 1
    sizing: PositionSizing
    commissionFixed: Optional[float] = 0
    commissionPct: Optional[float] = 0.0005
    slippageBps: Optional[float] = 2
    borrowRateShort: Optional[float] = 0
    allowShort: Optional[bool] = False
    maxPositions: Optional[int] = None
    maxWeightPerTicker: Optional[float] = None
    rebalance: Optional[str] = "none"
    rebalanceDriftPct: Optional[float] = 5
    stopLossPct: Optional[float] = None
    takeProfitPct: Optional[float] = None
    benchmark: Optional[str] = None


class DSLRule(BaseModel):
    type: str
    params: Dict[str, Any]


class DSL(BaseModel):
    name: str
    rules: List[DSLRule]


class DSLBacktestRequest(BaseModel):
    tickers: List[str]
    start: str
    end: str
    dsl: DSL
    portfolio: PortfolioConfig


class MLBacktestRequest(BaseModel):
    tickers: List[str]
    start: str
    end: str
    modelType: str
    code: Optional[str] = None
    hyperparams: Dict[str, Any]
    portfolio: PortfolioConfig


# Health endpoint
@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-backtester-python", "version": "1.0.0"}


# DSL Backtest endpoint
@app.post("/backtest/dsl")
async def backtest_dsl(request: DSLBacktestRequest):
    """
    Run a DSL-based backtest with portfolio simulation
    """
    try:
        result = run_dsl_backtest(
            tickers=request.tickers,
            start=request.start,
            end=request.end,
            dsl=request.dsl.dict(),
            portfolio=request.portfolio.dict(),
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ML Backtest endpoint
@app.post("/ml/train-predict")
async def ml_train_predict(request: MLBacktestRequest):
    """
    Run an ML-based backtest (template or custom code)
    """
    try:
        result = run_ml_backtest(
            tickers=request.tickers,
            start=request.start,
            end=request.end,
            model_type=request.modelType,
            code=request.code,
            hyperparams=request.hyperparams,
            portfolio=request.portfolio,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8081)
