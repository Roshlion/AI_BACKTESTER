import { NextRequest, NextResponse } from 'next/server'
import { PolygonClient } from '@/lib/polygon'
import { DataManager } from '@/lib/data-manager'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.POLYGON_API_KEY
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Polygon API key not configured' },
        { status: 500 }
      )
    }

    console.log('Starting comprehensive pipeline test...')
    
    // Initialize clients
    const polygon = new PolygonClient(apiKey)
    const dataManager = new DataManager(apiKey)

    const testResults: any = {
      timestamp: new Date().toISOString(),
      tests: []
    }

    // Test 1: Basic Polygon API connection
    try {
      console.log('Test 1: Testing basic Polygon API connection...')
      const basicTest = await polygon.getBars('AAPL', 'day', 1, '2024-01-01', '2024-01-05')
      testResults.tests.push({
        name: 'Basic Polygon API',
        status: 'PASS',
        data: basicTest.results?.length || 0,
        message: `Retrieved ${basicTest.results?.length || 0} bars for AAPL`
      })
    } catch (error) {
      testResults.tests.push({
        name: 'Basic Polygon API',
        status: 'FAIL',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Test 2: Ticker list retrieval
    try {
      console.log('Test 2: Testing ticker list retrieval...')
      const tickers = await polygon.getTickers({ limit: 10 })
      testResults.tests.push({
        name: 'Ticker List Retrieval',
        status: 'PASS',
        data: tickers.results?.length || 0,
        message: `Retrieved ${tickers.results?.length || 0} tickers`
      })
    } catch (error) {
      testResults.tests.push({
        name: 'Ticker List Retrieval',
        status: 'FAIL',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Test 3: Data manager historical download
    try {
      console.log('Test 3: Testing data manager historical download...')
      const historicalData = await dataManager.downloadHistoricalData(
        'MSFT', 
        '2024-01-01', 
        '2024-01-03'
      )
      testResults.tests.push({
        name: 'Data Manager Download',
        status: 'PASS',
        data: historicalData.length,
        message: `Downloaded ${historicalData.length} records for MSFT`
      })
    } catch (error) {
      testResults.tests.push({
        name: 'Data Manager Download',
        status: 'FAIL',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Test 4: Data gap detection
    try {
      console.log('Test 4: Testing data gap detection...')
      const missingRanges = await dataManager.getMissingDataRanges(
        'TSLA', 
        '2024-01-01', 
        '2024-01-10'
      )
      testResults.tests.push({
        name: 'Data Gap Detection',
        status: 'PASS',
        data: missingRanges.length,
        message: `Found ${missingRanges.length} missing data ranges for TSLA`
      })
    } catch (error) {
      testResults.tests.push({
        name: 'Data Gap Detection',
        status: 'FAIL',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Test 5: Comprehensive data retrieval
    try {
      console.log('Test 5: Testing comprehensive data retrieval...')
      const comprehensiveData = await dataManager.getComprehensiveData(
        'GOOGL', 
        '2024-01-01', 
        '2024-01-05'
      )
      testResults.tests.push({
        name: 'Comprehensive Data Retrieval',
        status: 'PASS',
        data: comprehensiveData.length,
        message: `Retrieved ${comprehensiveData.length} comprehensive records for GOOGL`
      })
    } catch (error) {
      testResults.tests.push({
        name: 'Comprehensive Data Retrieval',
        status: 'FAIL',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Test 6: Multiple ticker test
    try {
      console.log('Test 6: Testing multiple ticker download...')
      const tickers = ['AMZN', 'NFLX']
      const multiTickerResults = []
      
      for (const ticker of tickers) {
        const data = await dataManager.downloadHistoricalData(
          ticker, 
          '2024-01-01', 
          '2024-01-02'
        )
        multiTickerResults.push({ ticker, records: data.length })
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      
      testResults.tests.push({
        name: 'Multiple Ticker Download',
        status: 'PASS',
        data: multiTickerResults,
        message: `Successfully downloaded data for ${tickers.length} tickers`
      })
    } catch (error) {
      testResults.tests.push({
        name: 'Multiple Ticker Download',
        status: 'FAIL',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Calculate overall status
    const failedTests = testResults.tests.filter((test: any) => test.status === 'FAIL')
    const overallStatus = failedTests.length === 0 ? 'ALL_PASS' : 'SOME_FAIL'

    console.log('Pipeline test completed!')

    return NextResponse.json({
      success: overallStatus === 'ALL_PASS',
      overall_status: overallStatus,
      total_tests: testResults.tests.length,
      passed_tests: testResults.tests.filter((test: any) => test.status === 'PASS').length,
      failed_tests: failedTests.length,
      ...testResults
    })
  } catch (error) {
    console.error('Pipeline test failed:', error)
    
    return NextResponse.json(
      { 
        error: 'Pipeline test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
