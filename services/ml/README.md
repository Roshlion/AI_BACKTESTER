# ML Service for AI Backtester

FastAPI-based machine learning service that provides ML model generation and training/prediction capabilities.

## Features

- **Model Generation** (`POST /ml/generate`): Generate ML model configurations from natural language descriptions
- **Training & Prediction** (`POST /ml/run`): Train models and generate predictions
- **Health Check** (`GET /health`): Service health monitoring

## Local Development

### Prerequisites

- Python 3.11+
- pip

### Setup

```bash
cd services/ml
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Run Locally

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Access the API documentation at: `http://localhost:8000/docs`

## Docker Deployment

### Build Image

```bash
docker build -t ml-service:latest .
```

### Run Container

```bash
docker run -p 8000:8000 ml-service:latest
```

## AWS Deployment Options

### Option 1: AWS App Runner (Easiest)

1. Create an ECR repository:
   ```bash
   aws ecr create-repository --repository-name ml-service
   ```

2. Build and push the image:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
   docker tag ml-service:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/ml-service:latest
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/ml-service:latest
   ```

3. Create App Runner service via console or CLI:
   - Source: ECR
   - Port: 8000
   - Auto HTTPS enabled

4. Copy the service URL and set `ML_API_URL` in your Vercel environment variables

### Option 2: AWS Lambda + API Gateway

1. Modify `app/main.py` to add Mangum handler:
   ```python
   from mangum import Mangum
   handler = Mangum(app)
   ```

2. Build and push to ECR (same as above)

3. Create Lambda function from container image

4. Set timeout to 20-29s and memory to 2-3GB

5. Create HTTP API via API Gateway and map to Lambda

6. Enable CORS and set `ML_API_URL` to the API Gateway URL

### Option 3: ECS Fargate + ALB

1. Create ECS cluster, task definition from ECR image

2. Create ALB with target group on port 8000

3. Deploy service with desired count 1-2

4. Set `ML_API_URL` to the ALB DNS

## Alternative Cloud Platforms

- **Render**: Connect GitHub repo, auto-deploy from Dockerfile
- **Railway**: One-click deploy from Dockerfile
- **Fly.io**: Deploy with `fly launch`

All provide a public URL to use as `ML_API_URL`.

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

### POST /ml/generate

Generate ML model configuration from natural language description.

**Request:**
```json
{
  "description": "Predict price movements using SMA and RSI",
  "tickers": ["AAPL", "MSFT"],
  "start": "2024-01-01",
  "end": "2024-12-31"
}
```

**Response:**
```json
{
  "modelType": "RandomForestRegressor",
  "summary": {
    "purpose": "Predict price movements using technical indicators",
    "notes": "Baseline configuration"
  },
  "codeTemplate": "...",
  "hyperparams": {
    "n_estimators": 200,
    "max_depth": 8,
    "window": 60,
    "test_size": 0.2,
    "random_state": 42
  },
  "uiSchema": { ... }
}
```

### POST /ml/run

Train model and generate predictions.

**Request:**
```json
{
  "tickers": ["AAPL"],
  "start": "2024-01-01",
  "end": "2024-12-31",
  "modelType": "RandomForestRegressor",
  "code": "...",
  "hyperparams": { ... }
}
```

**Response:**
```json
{
  "metrics": {
    "rmse": 5.23,
    "mape": 0.034
  },
  "predictions": [
    {
      "date": "2024-06-01",
      "y": 150.23,
      "yhat": 149.87
    },
    ...
  ]
}
```

## Environment Variables

- `CORS_ORIGINS`: Comma-separated list of allowed origins (default: `*`)
- `LOG_LEVEL`: Logging level (default: `info`)

## Notes

- The current implementation uses synthetic data for demonstration
- In production, integrate with your actual data source (S3, database, etc.)
- Consider implementing caching for frequently-accessed data
- Add authentication/API keys for production deployments
- Monitor resource usage and scale accordingly
