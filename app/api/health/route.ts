import { S3_BASE } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${S3_BASE}/index.json`, { cache: "no-store" });
    return new Response(
      JSON.stringify({ ok: res.ok, status: res.status }),
      { headers: { "content-type": "application/json" }, status: res.ok ? 200 : 502 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { headers: { "content-type": "application/json" }, status: 500 },
    );
  }
}
