export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let manifest: { tickers: unknown; asOf: string | null; source: string | null; error?: string | null } = {
    tickers: [],
    asOf: null,
    source: null,
    error: null,
  };

  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const res = await fetch(`${base}/api/index`, { cache: "no-store" });
    manifest = res.ok ? await res.json() : { tickers: [], error: `HTTP ${res.status}`, asOf: null, source: null };
  } catch (error) {
    manifest = { tickers: [], error: String(error), asOf: null, source: null };
  }

  const tickers = Array.isArray(manifest.tickers) ? manifest.tickers : [];
  const count = tickers.length;

  return (
    <main className="p-6 text-white">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {manifest.error ? (
        <div className="mt-4 rounded bg-red-900/60 p-3 text-sm">
          Error loading manifest: {manifest.error}
        </div>
      ) : null}
      <p className="mt-4">Tickers: {count}</p>
      <p>Source: {manifest.source ?? "S3"}</p>
      <p>As of: {manifest.asOf ?? "unknown"}</p>
    </main>
  );
}
