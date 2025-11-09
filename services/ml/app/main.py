"""
FastAPI ML Service for AI Backtester
Provides ML model generation and training/prediction endpoints
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_percentage_error
import ta
import os

app = FastAPI(title="AI Backtester ML Service", version="1.0.0")

# Configure CORS from environment variable
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# S3 Configuration (for production use)
DATA_BUCKET = os.getenv("DATA_BUCKET", "ai-backtester-data-rosh")
DATA_PREFIX = os.getenv("DATA_PREFIX", "prod/")
DATA_LAYOUT = os.getenv("DATA_LAYOUT", "per-symbol")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


# Request/Response models
class GenerateRequest(BaseModel):
    description: str
    tickers: List[str]
    start: Optional[str] = None
    end: Optional[str] = None


class UISchemaField(BaseModel):
    type: str
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    options: Optional[List[str]] = None
    help: Optional[str] = None


class GenerateResponse(BaseModel):
    modelType: str
    summary: Dict[str, Any]
    codeTemplate: str
    hyperparams: Dict[str, Any]
    uiSchema: Dict[str, UISchemaField]


class TrainPredictRequest(BaseModel):
    tickers: List[str]
    start: str
    end: str
    modelType: str
    code: str
    hyperparams: Dict[str, Any]


class Prediction(BaseModel):
    date: str
    y: float
    yhat: float


class TrainPredictResponse(BaseModel):
    metrics: Dict[str, float]
    predictions: List[Prediction]


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "ml",
        "config": {
            "data_bucket": DATA_BUCKET,
            "data_prefix": DATA_PREFIX,
            "data_layout": DATA_LAYOUT,
            "aws_region": AWS_REGION
        }
    }


@app.post("/ml/generate", response_model=GenerateResponse)
async def generate_ml(request: GenerateRequest):
    """
    Generate ML model configuration from natural language description
    Returns baseline model configuration with editable hyperparameters
    """

    # For now, return a baseline RandomForest configuration
    # In a more advanced version, analyze the description to choose the best model

    return GenerateResponse(
        modelType="RandomForestRegressor",
        summary={
            "purpose": "Predict price movements using technical indicators",
            "notes": "Baseline configuration - adjust hyperparameters as needed"
        },
        codeTemplate="""# Random Forest Regressor for price prediction
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_percentage_error

def train_and_predict(X_train, y_train, X_test, y_test):
    model = RandomForestRegressor(
        n_estimators={{n_estimators}},
        max_depth={{max_depth}},
        random_state={{random_state}},
        n_jobs=-1
    )

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    rmse = np.sqrt(mean_squared_error(y_test, predictions))
    mape = mean_absolute_percentage_error(y_test, predictions)

    return {
        'predictions': predictions,
        'metrics': {'rmse': rmse, 'mape': mape}
    }
""",
        hyperparams={
            "n_estimators": 200,
            "max_depth": 8,
            "window": 60,
            "test_size": 0.2,
            "random_state": 42
        },
        uiSchema={
            "n_estimators": UISchemaField(
                type="number",
                min=50,
                max=1000,
                step=50,
                help="Number of trees in the forest"
            ),
            "max_depth": UISchemaField(
                type="number",
                min=2,
                max=30,
                step=1,
                help="Maximum depth of each tree"
            ),
            "window": UISchemaField(
                type="number",
                min=5,
                max=250,
                step=5,
                help="Feature lookback window (days)"
            ),
            "test_size": UISchemaField(
                type="number",
                min=0.1,
                max=0.5,
                step=0.05,
                help="Fraction of data to use for testing"
            ),
            "random_state": UISchemaField(
                type="number",
                min=0,
                max=9999,
                step=1,
                help="Random seed for reproducibility"
            )
        }
    )


@app.post("/ml/run", response_model=TrainPredictResponse)
async def train_predict(request: TrainPredictRequest):
    """
    Train ML model and generate predictions
    Returns metrics and prediction series
    """

    try:
        # Extract hyperparameters
        n_estimators = int(request.hyperparams.get("n_estimators", 200))
        max_depth = int(request.hyperparams.get("max_depth", 8))
        window = int(request.hyperparams.get("window", 60))
        test_size = float(request.hyperparams.get("test_size", 0.2))
        random_state = int(request.hyperparams.get("random_state", 42))

        # For demo purposes, generate synthetic data
        # In production, fetch actual price data from S3/database
        dates = pd.date_range(start=request.start, end=request.end, freq='D')
        n_samples = len(dates)

        # Generate synthetic price data
        np.random.seed(random_state)
        prices = 100 + np.cumsum(np.random.randn(n_samples) * 2)

        df = pd.DataFrame({
            'date': dates,
            'close': prices
        })

        # Feature engineering
        df['returns'] = df['close'].pct_change()
        df['sma_20'] = df['close'].rolling(window=20).mean()
        df['sma_50'] = df['close'].rolling(window=50).mean()
        df['rsi'] = ta.momentum.RSIIndicator(df['close'], window=14).rsi()

        # Create lagged features based on window
        for i in range(1, min(window, 10) + 1):
            df[f'lag_{i}'] = df['close'].shift(i)

        # Drop NaN rows
        df = df.dropna()

        if len(df) < 50:
            raise HTTPException(status_code=400, detail="Insufficient data after feature engineering")

        # Prepare train/test split
        split_idx = int(len(df) * (1 - test_size))
        train_df = df.iloc[:split_idx]
        test_df = df.iloc[split_idx:]

        # Features and target
        feature_cols = [col for col in df.columns if col not in ['date', 'close']]
        X_train = train_df[feature_cols].values
        y_train = train_df['close'].values
        X_test = test_df[feature_cols].values
        y_test = test_df['close'].values

        # Train model
        model = RandomForestRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            random_state=random_state,
            n_jobs=-1
        )

        model.fit(X_train, y_train)

        # Predict
        predictions = model.predict(X_test)

        # Calculate metrics
        rmse = float(np.sqrt(mean_squared_error(y_test, predictions)))
        mape = float(mean_absolute_percentage_error(y_test, predictions))

        # Prepare prediction series
        prediction_list = []
        for i, (idx, row) in enumerate(test_df.iterrows()):
            prediction_list.append(Prediction(
                date=row['date'].strftime('%Y-%m-%d'),
                y=float(y_test[i]),
                yhat=float(predictions[i])
            ))

        return TrainPredictResponse(
            metrics={
                "rmse": rmse,
                "mape": mape
            },
            predictions=prediction_list
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ML training failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
