interface TickerMeta {
  firstDate?: string;
  lastDate?: string;
}

type MetaMap = Record<string, TickerMeta>;

let cachedMetaPromise: Promise<MetaMap> | null = null;

async function fetchIndexMeta(): Promise<MetaMap> {
  const map: MetaMap = {};
  try {
    const response = await fetch("/api/index");
    if (!response.ok) {
      return map;
    }
    const data = await response.json();
    if (!Array.isArray(data?.tickers)) {
      return map;
    }
    for (const entry of data.tickers) {
      if (!entry) continue;
      if (typeof entry === "string") {
        const key = entry.toUpperCase();
        if (!map[key]) map[key] = {};
        continue;
      }
      if (typeof entry.ticker !== "string") continue;
      const key = entry.ticker.toUpperCase();
      if (!map[key]) map[key] = {};
      if (entry.firstDate) map[key].firstDate = entry.firstDate;
      if (entry.lastDate) map[key].lastDate = entry.lastDate;
    }
  } catch (error) {
    console.warn("Failed to load /api/index metadata", error);
  }
  return map;
}

async function fetchManifestMeta(existing: MetaMap): Promise<MetaMap> {
  const map = { ...existing };
  try {
    const response = await fetch("/manifest.json");
    if (!response.ok) {
      return map;
    }
    const data = await response.json();
    if (!Array.isArray(data?.tickers)) {
      return map;
    }
    for (const entry of data.tickers) {
      if (!entry || typeof entry.ticker !== "string") continue;
      const key = entry.ticker.toUpperCase();
      if (!map[key]) map[key] = {};
      if (entry.firstDate && !map[key].firstDate) map[key].firstDate = entry.firstDate;
      if (entry.lastDate && !map[key].lastDate) map[key].lastDate = entry.lastDate;
    }
  } catch (error) {
    console.warn("Failed to load manifest metadata", error);
  }
  return map;
}

export async function getTickerMeta(): Promise<MetaMap> {
  if (!cachedMetaPromise) {
    cachedMetaPromise = (async () => {
      const indexMeta = await fetchIndexMeta();
      const needsManifest = Object.values(indexMeta).some(
        (entry) => !entry.firstDate || !entry.lastDate,
      );
      if (needsManifest || Object.keys(indexMeta).length === 0) {
        return fetchManifestMeta(indexMeta);
      }
      return indexMeta;
    })();
  }
  return cachedMetaPromise;
}

export function intersectRange(
  tickers: string[],
  metaMap: MetaMap,
): { min?: string; max?: string } {
  if (!Array.isArray(tickers) || tickers.length === 0) return {};
  const normalized = Array.from(new Set(tickers.map((ticker) => ticker.toUpperCase()))).filter(
    Boolean,
  );
  if (normalized.length === 0) return {};

  let minStart: string | undefined;
  let maxEnd: string | undefined;
  let hasAny = false;

  for (const ticker of normalized) {
    const meta = metaMap[ticker];
    if (!meta) continue;
    if (meta.firstDate) {
      hasAny = true;
      if (!minStart || meta.firstDate > minStart) {
        minStart = meta.firstDate;
      }
    }
    if (meta.lastDate) {
      hasAny = true;
      if (!maxEnd || meta.lastDate < maxEnd) {
        maxEnd = meta.lastDate;
      }
    }
  }

  if (!hasAny) return {};
  return { min: minStart, max: maxEnd };
}
