/**
 * ML Client - interface to external Python ML service
 * Supports both remote API (ML_API_URL) and local development fallback
 */

interface GenerateRequest {
  description: string;
  tickers: string[];
  start?: string;
  end?: string;
}

interface GenerateResponse {
  modelType: string;
  summary: {
    purpose: string;
    notes?: string;
  };
  codeTemplate: string;
  hyperparams: Record<string, any>;
  uiSchema: Record<string, UISchemaField>;
}

interface UISchemaField {
  type: 'number' | 'select' | 'text';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  help?: string;
}

interface TrainPredictRequest {
  tickers: string[];
  start: string;
  end: string;
  modelType: string;
  code: string;
  hyperparams: Record<string, any>;
}

interface TrainPredictResponse {
  metrics: {
    rmse: number;
    mape: number;
    [key: string]: number;
  };
  predictions: Array<{
    date: string;
    y: number;
    yhat: number;
  }>;
}

const ML_API_URL = process.env.ML_API_URL || process.env.NEXT_PUBLIC_ML_API_URL;
const ALLOW_LOCAL_PY = process.env.ALLOW_LOCAL_PY === '1';

/**
 * Check if ML service is available
 */
export function isMLAvailable(): boolean {
  if (ML_API_URL) return true;
  if (ALLOW_LOCAL_PY && process.env.NODE_ENV !== 'production') return true;
  return false;
}

/**
 * Generate ML model configuration from natural language description
 */
export async function generate(
  request: GenerateRequest
): Promise<GenerateResponse> {
  if (!isMLAvailable()) {
    throw new Error('ML service is not available. Set ML_API_URL or ALLOW_LOCAL_PY=1 in dev.');
  }

  if (ML_API_URL) {
    // Call external ML service
    const response = await fetch(`${ML_API_URL}/ml/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'ML service error' }));
      throw new Error(error.error || `ML service returned ${response.status}`);
    }

    return await response.json();
  }

  // Local development fallback (server-side only)
  if (ALLOW_LOCAL_PY && typeof window === 'undefined') {
    return await generateLocal(request);
  }

  throw new Error('ML service not configured');
}

/**
 * Train and predict with ML model
 */
export async function trainPredict(
  request: TrainPredictRequest
): Promise<TrainPredictResponse> {
  if (!isMLAvailable()) {
    throw new Error('ML service is not available. Set ML_API_URL or ALLOW_LOCAL_PY=1 in dev.');
  }

  if (ML_API_URL) {
    // Call external ML service
    const response = await fetch(`${ML_API_URL}/ml/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'ML service error' }));
      throw new Error(error.error || `ML service returned ${response.status}`);
    }

    return await response.json();
  }

  // Local development fallback (server-side only)
  if (ALLOW_LOCAL_PY && typeof window === 'undefined') {
    return await trainPredictLocal(request);
  }

  throw new Error('ML service not configured');
}

/**
 * Health check for ML service
 */
export async function healthCheck(): Promise<boolean> {
  if (!ML_API_URL) return false;

  try {
    const response = await fetch(`${ML_API_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return false;

    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Local development fallback - generates baseline model config
 * This is a simple mock that returns sensible defaults
 */
async function generateLocal(
  request: GenerateRequest
): Promise<GenerateResponse> {
  // For now, return a baseline RandomForest configuration
  // In production, the Python service would analyze the description and choose the best model
  return {
    modelType: 'RandomForestRegressor',
    summary: {
      purpose: 'Predict price movements using technical indicators',
      notes: 'Baseline configuration - adjust hyperparameters as needed',
    },
    codeTemplate: `# Random Forest Regressor for price prediction
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
`,
    hyperparams: {
      n_estimators: 200,
      max_depth: 8,
      window: 60,
      test_size: 0.2,
      random_state: 42,
    },
    uiSchema: {
      n_estimators: {
        type: 'number',
        min: 50,
        max: 1000,
        step: 50,
        help: 'Number of trees in the forest',
      },
      max_depth: {
        type: 'number',
        min: 2,
        max: 30,
        step: 1,
        help: 'Maximum depth of each tree',
      },
      window: {
        type: 'number',
        min: 5,
        max: 250,
        step: 5,
        help: 'Feature lookback window (days)',
      },
      test_size: {
        type: 'number',
        min: 0.1,
        max: 0.5,
        step: 0.05,
        help: 'Fraction of data to use for testing',
      },
      random_state: {
        type: 'number',
        min: 0,
        max: 9999,
        step: 1,
        help: 'Random seed for reproducibility',
      },
    },
  };
}

/**
 * Local development fallback - mock train/predict
 */
async function trainPredictLocal(
  request: TrainPredictRequest
): Promise<TrainPredictResponse> {
  // In local dev mode, return mock results
  // The actual Python service would fetch data, train, and predict
  const { start, end } = request;

  // Generate some mock predictions
  const startDate = new Date(start);
  const endDate = new Date(end);
  const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const predictions = [];

  for (let i = 0; i < Math.min(daysDiff, 100); i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const y = 100 + Math.random() * 50;
    const yhat = y + (Math.random() - 0.5) * 10;

    predictions.push({
      date: date.toISOString().split('T')[0],
      y,
      yhat,
    });
  }

  return {
    metrics: {
      rmse: 5.2 + Math.random() * 2,
      mape: 0.03 + Math.random() * 0.02,
    },
    predictions,
  };
}

export type {
  GenerateRequest,
  GenerateResponse,
  UISchemaField,
  TrainPredictRequest,
  TrainPredictResponse,
};
