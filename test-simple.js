 
// test-simple.js
const https = require('https');

async function testPolygonAPI() {
  console.log('🚀 Testing Polygon API connection...\n');
  
  const apiKey = 'WyA_GP15p18tK0OSz8_5OS7VEqnu3gad';
  const url = `https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-01-05?adjusted=true&sort=asc&limit=5&apikey=${apiKey}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (result.status === 'OK' && result.results) {
            console.log('✅ Polygon API Test: SUCCESS');
            console.log(`📊 Retrieved ${result.results.length} records for AAPL`);
            console.log(`📅 Date range: 2024-01-01 to 2024-01-05`);
            console.log(`🔗 API Status: ${result.status}\n`);
            
            console.log('Sample data:');
            result.results.forEach((bar, index) => {
              const date = new Date(bar.t).toISOString().split('T')[0];
              console.log(`  ${index + 1}. ${date}: Close $${bar.c}, Volume ${bar.v.toLocaleString()}`);
            });
            
            resolve(result);
          } else {
            console.log('❌ Polygon API Test: FAILED');
            console.log('Response:', result);
            reject(new Error('Invalid response from Polygon API'));
          }
        } catch (error) {
          console.log('❌ Polygon API Test: FAILED');
          console.log('Parse error:', error.message);
          reject(error);
        }
      });
    }).on('error', (error) => {
      console.log('❌ Polygon API Test: FAILED');
      console.log('Network error:', error.message);
      reject(error);
    });
  });
}

// Run test
testPolygonAPI()
  .then(() => {
    console.log('\n🎉 Basic test completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Run: npm run dev');
    console.log('2. Visit: http://localhost:3000');
    console.log('3. Test the web interface');
  })
  .catch((error) => {
    console.log('\n💥 Test failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Check your Polygon API key');
    console.log('2. Verify internet connection');
    console.log('3. Try running the test again');
  });