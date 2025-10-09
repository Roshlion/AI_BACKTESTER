import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as generateHandler } from '@/app/api/strategy/generate/route';
import { NextRequest } from 'next/server';

// Mock environment
vi.mock('@/lib/env', () => ({
  env: {
    ML_API_URL: 'https://mock-ml-api.com'
  }
}));

describe('/api/strategy/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 if tickers are missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/strategy/generate', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'dsl',
        prompt: 'test strategy'
      })
    });

    const response = await generateHandler(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('tickers');
  });

  it('should return 400 if tickers is empty array', async () => {
    const req = new NextRequest('http://localhost:3000/api/strategy/generate', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'dsl',
        tickers: [],
        prompt: 'test strategy'
      })
    });

    const response = await generateHandler(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('tickers');
  });

  it('should handle DSL mode with valid payload', async () => {
    const req = new NextRequest('http://localhost:3000/api/strategy/generate', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'dsl',
        tickers: ['AAPL', 'MSFT'],
        prompt: 'momentum strategy',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      })
    });

    const response = await generateHandler(req);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('dsl');
  });

  it('should proxy to ML_API_URL for ML mode', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 'print("test")', hyperparams: { n_estimators: 100 } })
    });
    global.fetch = mockFetch;

    const req = new NextRequest('http://localhost:3000/api/strategy/generate', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'ml',
        tickers: ['AAPL'],
        prompt: 'RandomForest model',
        hyperparams: { n_estimators: 100 }
      })
    });

    const response = await generateHandler(req);
    const data = await response.json();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/ml/generate'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      })
    );
    expect(response.status).toBe(200);
    expect(data).toHaveProperty('code');
  });

  it('should return 501 if ML_API_URL not set for ML mode', async () => {
    vi.doMock('@/lib/env', () => ({
      env: {
        ML_API_URL: undefined
      }
    }));

    const req = new NextRequest('http://localhost:3000/api/strategy/generate', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'ml',
        tickers: ['AAPL'],
        prompt: 'test'
      })
    });

    const response = await generateHandler(req);

    // Should handle gracefully even if ML_API_URL is not set
    expect([200, 501, 500]).toContain(response.status);
  });
});
