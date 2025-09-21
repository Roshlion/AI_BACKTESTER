#!/usr/bin/env node

/**
 * Vercel Smoke Test Script
 *
 * Tests key API endpoints to ensure they're working after deployment.
 * Prints status and first 200 chars of response for each endpoint.
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.BASE_URL
  ? process.env.BASE_URL
  : 'http://localhost:3000';

const ENDPOINTS = [
  {
    name: 'Index (Manifest)',
    path: '/api/index',
    method: 'GET'
  },
  {
    name: 'Health Check',
    path: '/api/health',
    method: 'GET'
  },
  {
    name: 'Ping',
    path: '/api/ping',
    method: 'GET'
  },
  {
    name: 'Local Data Metadata',
    path: '/api/local-data?mode=metadata&ticker=AAPL',
    method: 'GET'
  },
  {
    name: 'Local Data Rows',
    path: '/api/local-data?ticker=AAPL',
    method: 'GET'
  },
  {
    name: 'Local Batch Data',
    path: '/api/local-batch',
    method: 'POST',
    body: {
      tickers: ['AAPL', 'MSFT', 'GOOGL'],
      startDate: '2024-01-01',
      endDate: '2024-01-31'
    }
  },
  {
    name: 'Strategy Test',
    path: '/api/strategy/test',
    method: 'GET'
  },
  {
    name: 'Strategy Run',
    path: '/api/strategy/run',
    method: 'POST',
    body: {
      prompt: 'Simple MACD strategy',
      ticker: 'AAPL',
      startDate: '2024-01-01',
      endDate: '2024-03-31'
    }
  }
];

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function truncateResponse(response, maxLength = 200) {
  if (response.length <= maxLength) {
    return response;
  }
  return response.substring(0, maxLength) + '...';
}

async function testEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`;
  const startTime = Date.now();

  try {
    const options = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Smoke-Test/1.0'
      }
    };

    if (endpoint.body) {
      options.body = JSON.stringify(endpoint.body);
    }

    log(`${colors.blue}Testing: ${endpoint.name}${colors.reset}`);
    log(`  URL: ${url}`);
    log(`  Method: ${endpoint.method}`);

    const response = await fetch(url, options);
    const responseTime = Date.now() - startTime;
    const responseText = await response.text();

    const statusColor = response.ok ? colors.green : colors.red;
    log(`  ${statusColor}Status: ${response.status} ${response.statusText}${colors.reset}`);
    log(`  Response Time: ${responseTime}ms`);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
      log(`  Response: ${truncateResponse(JSON.stringify(parsedResponse, null, 2))}`);

      // Check for expected ok field
      if (parsedResponse.hasOwnProperty('ok')) {
        const okColor = parsedResponse.ok ? colors.green : colors.yellow;
        log(`  ${okColor}API Ok: ${parsedResponse.ok}${colors.reset}`);
      }
    } catch {
      log(`  Response: ${truncateResponse(responseText)}`);
    }

    return {
      name: endpoint.name,
      url,
      status: response.status,
      ok: response.ok,
      responseTime,
      response: parsedResponse || responseText,
      success: response.ok
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
    log(`  Response Time: ${responseTime}ms`);

    return {
      name: endpoint.name,
      url,
      status: 0,
      ok: false,
      responseTime,
      error: error.message,
      success: false
    };
  }
}

async function runSmokeTests() {
  log(`${colors.bold}=== Vercel Smoke Test ===${colors.reset}`);
  log(`Base URL: ${BASE_URL}`);
  log(`Testing ${ENDPOINTS.length} endpoints...`);
  log('');

  const results = [];

  for (const endpoint of ENDPOINTS) {
    const result = await testEndpoint(endpoint);
    results.push(result);
    log(''); // Empty line between tests
  }

  // Summary
  log(`${colors.bold}=== Test Summary ===${colors.reset}`);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  log(`Total Tests: ${results.length}`);
  log(`${colors.green}Successful: ${successful.length}${colors.reset}`);
  log(`${colors.red}Failed: ${failed.length}${colors.reset}`);

  if (failed.length > 0) {
    log(`${colors.red}Failed Tests:${colors.reset}`);
    failed.forEach(test => {
      log(`  - ${test.name} (${test.status})`);
    });
  }

  const totalTime = results.reduce((sum, r) => sum + r.responseTime, 0);
  log(`Total Response Time: ${totalTime}ms`);
  log(`Average Response Time: ${Math.round(totalTime / results.length)}ms`);

  // Exit with appropriate code
  const exitCode = failed.length > 0 ? 1 : 0;
  if (exitCode === 0) {
    log(`${colors.green}${colors.bold}All tests passed! ✓${colors.reset}`);
  } else {
    log(`${colors.red}${colors.bold}Some tests failed! ✗${colors.reset}`);
  }

  process.exit(exitCode);
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  log(`${colors.red}Unhandled error: ${error.message}${colors.reset}`);
  process.exit(1);
});

// Run the tests
runSmokeTests().catch((error) => {
  log(`${colors.red}Failed to run smoke tests: ${error.message}${colors.reset}`);
  process.exit(1);
});