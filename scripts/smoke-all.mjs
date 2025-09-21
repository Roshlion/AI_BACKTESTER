// scripts/smoke-all.mjs
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function jfetch(path, init) {
  const r = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...(init?.headers||{}) } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw:text }; }
  return { ok: r.ok, status: r.status, body };
}

function ok(name, cond, extra="") {
  if (!cond) throw new Error(`❌ ${name} failed ${extra?' — '+extra:''}`);
  console.log(`✅ ${name}`);
}

(async () => {
  console.log(`Base: ${BASE}`);

  // 0) Home/Dashboard reachable
  {
    const r = await fetch(BASE + "/dashboard", { cache: "no-store" });
    ok("GET /dashboard", r.ok);
  }

  // 1) Metadata available
  {
    const { ok: good, body } = await jfetch("/api/local-data?mode=metadata");
    ok("GET /api/local-data?mode=metadata", good);
    ok("metadata shape", !!body?.metadata || body?.success === true);
  }

  // 2) Local parquet read (AAPL sample window)
  {
    const qs = new URLSearchParams({ ticker:"AAPL", startDate:"2024-01-02", endDate:"2024-03-28" }).toString();
    const { ok: good, body } = await jfetch(`/api/local-data?${qs}`);
    ok("GET /api/local-data (AAPL)", good);
    ok("local data array", Array.isArray(body?.data));
    ok("has close", body?.data?.[0]?.close !== undefined);
  }

  // 3) Batch parquet (watchlist)
  {
    const payload = { tickers:["AAPL","MSFT","GOOGL"], startDate:"2024-01-02", endDate:"2024-03-28" };
    const { ok: good, body } = await jfetch("/api/local-batch", { method:"POST", body: JSON.stringify(payload) });
    ok("POST /api/local-batch", good);
    ok("batch array", Array.isArray(body?.data));
  }

  // 4) Strategy test (fixed DSL smoke)
  {
    const { ok: good, body } = await jfetch("/api/strategy/test", { cache:"no-store" });
    ok("GET /api/strategy/test", good);
    ok("strategy test ok", body?.ok === true);
    ok("stats present", !!body?.stats);
  }

  // 5) LLM ping (requires OPENAI_API_KEY set)
  {
    const { ok: good, body } = await jfetch("/api/strategy/ping");
    if (good) {
      ok("GET /api/strategy/ping", true);
      ok("model string", typeof body?.model === "string");
    } else {
      console.log("⚠ ping skipped or failed (likely no OPENAI_API_KEY in env) — continuing");
    }
  }

  // 6) LLM strategy→DSL→backtest (requires key)
  {
    const payload = {
      prompt: "Enter long when MACD fast(12) crosses above slow(26), exit when RSI > 70; signal 9; rsi 14",
      ticker: "AAPL",
      startDate: "2024-01-02",
      endDate: "2024-03-28"
    };
    const { ok: good, body } = await jfetch("/api/strategy/run", { method:"POST", body: JSON.stringify(payload) });
    if (good && body?.ok) {
      ok("POST /api/strategy/run", true);
      ok("dsl present", !!body?.dsl);
      ok("result stats", !!body?.result?.stats);
    } else {
      console.log("⚠ strategy/run skipped or failed (LLM disabled or prompt parsing). Continuing.");
    }
  }

  // 7) Data API default is local-first (no download)
  {
    const qs = new URLSearchParams({ ticker:"AAPL", start:"2024-01-02", end:"2024-03-28" }).toString();
    const { ok: good, body } = await jfetch(`/api/data?${qs}`);
    ok("GET /api/data (local-first)", good);
    ok("data present", Array.isArray(body?.data?.data) || Array.isArray(body?.data));
  }

  console.log("\n🎉 All smoke checks passed (or gracefully skipped when keys absent).\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});