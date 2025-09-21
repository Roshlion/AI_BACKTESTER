// scripts/strategy-smoke.mjs
const base = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  try {
    const r = await fetch(`${base}/api/strategy/ping`);
    const j = await r.json();
    console.log('[ping]', j);
  } catch (e) {
    console.error('[ping] failed:', e);
  }

  try {
    const url = new URL(`${base}/api/strategy/test`);
    url.searchParams.set('ticker', 'AAPL');
    url.searchParams.set('startDate', '2024-01-02');
    url.searchParams.set('endDate', '2024-03-28');
    const r = await fetch(url);
    const j = await r.json();
    console.log('[test]', { ok: j.ok, used: j.used, stats: j.result?.stats });
  } catch (e) {
    console.error('[test] failed:', e);
  }

  try {
    const r = await fetch(`${base}/api/strategy/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'MACD crossover enter; exit when RSI > 70; fast 12 slow 26 signal 9',
        ticker: 'AAPL',
        startDate: '2024-01-02',
        endDate: '2024-03-28'
      })
    });
    const j = await r.json();
    console.log('[run]', { ok: j.ok, dsl: j.dsl?.name, stats: j.result?.stats });
  } catch (e) {
    console.error('[run] failed:', e);
  }
}

main();
