'use client';

import { useState } from 'react';

const API_PRESETS = [
  {
    name: 'Index (Manifest)',
    path: '/api/index',
    method: 'GET',
    query: '',
    body: '',
    description: 'Get manifest contents + basic counts'
  },
  {
    name: 'Health Check',
    path: '/api/health',
    method: 'GET',
    query: '',
    body: '',
    description: 'Check manifest reachability and sample ticker'
  },
  {
    name: 'Local Data - Metadata',
    path: '/api/local-data',
    method: 'GET',
    query: '?mode=metadata&ticker=AAPL',
    body: '',
    description: 'Get metadata for specific ticker'
  },
  {
    name: 'Local Data - Rows',
    path: '/api/local-data',
    method: 'GET',
    query: '?ticker=AAPL',
    body: '',
    description: 'Get all rows for ticker'
  },
  {
    name: 'Local Batch',
    path: '/api/local-batch',
    method: 'POST',
    query: '',
    body: JSON.stringify({
      tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA'],
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    }, null, 2),
    description: 'Get batch data for multiple tickers from manifest'
  },
  {
    name: 'Strategy Test',
    path: '/api/strategy/test',
    method: 'GET',
    query: '',
    body: '',
    description: 'Run fixed DSL strategy test'
  },
  {
    name: 'Strategy Run',
    path: '/api/strategy/run',
    method: 'POST',
    query: '',
    body: JSON.stringify({
      prompt: 'A simple MACD crossover strategy',
      ticker: 'AAPL',
      startDate: '2024-01-01',
      endDate: '2024-03-31',
    }, null, 2),
    description: 'Generate and run strategy from prompt'
  },
];

interface TestResult {
  name: string;
  status: number;
  ok: boolean;
  time: number;
  response: any;
  error?: string;
}

export default function ApiTesterPage() {
  const [selectedPreset, setSelectedPreset] = useState(API_PRESETS[0]);
  const [path, setPath] = useState(API_PRESETS[0].path);
  const [method, setMethod] = useState(API_PRESETS[0].method);
  const [query, setQuery] = useState(API_PRESETS[0].query);
  const [body, setBody] = useState(API_PRESETS[0].body);
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [smokeResults, setSmokeResults] = useState<TestResult[]>([]);
  const [smokeTesting, setSmokeTesting] = useState(false);

  const handlePresetSelect = (preset: typeof API_PRESETS[0]) => {
    setSelectedPreset(preset);
    setPath(preset.path);
    setMethod(preset.method);
    setQuery(preset.query);
    setBody(preset.body);
  };

  const truncateResponse = (response: string, maxLength = 1000) => {
    if (response.length <= maxLength) {
      return response;
    }
    return response.substring(0, maxLength) + '...';
  };

  const sendRequest = async (customPath?: string, customMethod?: string, customQuery?: string, customBody?: string) => {
    setLoading(true);
    setResponse('');
    setStatus(null);

    const requestPath = customPath || path;
    const requestMethod = customMethod || method;
    const requestQuery = customQuery || query;
    const requestBody = customBody || body;

    try {
      const url = `${requestPath}${requestQuery}`;
      const startTime = Date.now();

      const requestOptions: RequestInit = {
        method: requestMethod,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (requestMethod !== 'GET' && requestBody.trim()) {
        requestOptions.body = requestBody;
      }

      const res = await fetch(url, requestOptions);
      const endTime = Date.now();
      const statusCode = res.status;
      const responseText = await res.text();

      setStatus(statusCode);

      try {
        const jsonResponse = JSON.parse(responseText);
        setResponse(JSON.stringify(jsonResponse, null, 2));
        return {
          status: statusCode,
          ok: res.ok,
          time: endTime - startTime,
          response: jsonResponse
        };
      } catch {
        setResponse(responseText);
        return {
          status: statusCode,
          ok: res.ok,
          time: endTime - startTime,
          response: responseText
        };
      }
    } catch (error) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setResponse(errorMessage);
      setStatus(0);
      return {
        status: 0,
        ok: false,
        time: 0,
        response: errorMessage,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  };

  const runAllSmoke = async () => {
    setSmokeTesting(true);
    setSmokeResults([]);

    const results: TestResult[] = [];

    for (const preset of API_PRESETS) {
      try {
        const result = await sendRequest(preset.path, preset.method, preset.query, preset.body);
        results.push({
          name: preset.name,
          status: result.status,
          ok: result.ok,
          time: result.time,
          response: result.response,
          error: result.error
        });
      } catch (error) {
        results.push({
          name: preset.name,
          status: 0,
          ok: false,
          time: 0,
          response: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setSmokeResults(results);
    setSmokeTesting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Sidebar */}
      <div className="w-80 bg-white shadow-lg border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">API Tester</h1>

          {/* Quick Presets */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Quick Presets</h2>
            {API_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePresetSelect(preset)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedPreset.name === preset.name
                    ? 'bg-blue-50 border-blue-300 text-blue-900'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="font-medium text-sm">{preset.name}</div>
                <div className="text-xs text-gray-500 mt-1">{preset.method} {preset.path}</div>
                <div className="text-xs text-gray-600 mt-1">{preset.description}</div>
              </button>
            ))}
          </div>

          {/* Smoke Test */}
          <div className="mt-8">
            <button
              onClick={runAllSmoke}
              disabled={smokeTesting}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {smokeTesting ? 'Running Smoke Tests...' : 'Run All Smoke Tests'}
            </button>

            {/* Smoke Results Summary */}
            {smokeResults.length > 0 && (
              <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Smoke Test Results ({smokeResults.filter(r => r.ok).length}/{smokeResults.length} passed)
                </div>
                <div className="space-y-1">
                  {smokeResults.map((result, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <span className="truncate">{result.name}</span>
                      <span className={`font-mono ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                        {result.status} ({result.time}ms)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Request Configuration */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Request Configuration</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Path */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Path
                </label>
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="/api/endpoint"
                />
              </div>

              {/* Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  HTTP Method
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
            </div>

            {/* Query Parameters */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Query Parameters
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="?param=value&other=value"
              />
            </div>

            {/* Request Body */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Request Body (JSON)
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                placeholder="Enter JSON body for POST/PUT requests"
              />
            </div>

            {/* Send Button */}
            <button
              onClick={() => sendRequest()}
              disabled={loading}
              className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Sending...' : 'Send Request'}
            </button>
          </div>

          {/* Response Display */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Response</h2>

            {/* Status Code */}
            {status !== null && (
              <div className="mb-4">
                <span className="text-sm font-medium text-gray-700">Status: </span>
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    status >= 200 && status < 300
                      ? 'bg-green-100 text-green-800'
                      : status >= 400
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {status}
                </span>
              </div>
            )}

            {/* Response Body */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Response Body
              </label>
              <textarea
                value={truncateResponse(response)}
                readOnly
                rows={24}
                className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                placeholder="Response will appear here..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}