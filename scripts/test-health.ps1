param(
  [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "Checking $BaseUrl/api/ping" -ForegroundColor Cyan
Invoke-RestMethod "$BaseUrl/api/ping"

Write-Host "Checking $BaseUrl/api/index" -ForegroundColor Cyan
$index = Invoke-RestMethod "$BaseUrl/api/index?limit=1000"
$index | ConvertTo-Json -Depth 5

if (($index.total -as [int]) -lt 100) {
  throw "Manifest contains fewer than 100 tickers (total=$($index.total))"
}

Write-Host "Checking $BaseUrl/api/local-data" -ForegroundColor Cyan
Invoke-RestMethod "$BaseUrl/api/local-data?ticker=AAPL&start=2024-01-01&end=2024-12-31" | ConvertTo-Json -Depth 5