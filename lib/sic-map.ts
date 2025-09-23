export interface SicCategory {
  sector: string;
  industry: string;
}

const SIC_SECTOR_TABLE: Array<{ min: number; max: number; sector: string; industry: string }> = [
  { min: 1, max: 999, sector: "Agriculture", industry: "Agriculture & Forestry" },
  { min: 1000, max: 1499, sector: "Mining", industry: "Metal Mining" },
  { min: 1500, max: 1799, sector: "Construction", industry: "General Contractors" },
  { min: 1800, max: 1999, sector: "Construction", industry: "Special Trade Contractors" },
  { min: 2000, max: 3999, sector: "Manufacturing", industry: "Manufacturing" },
  { min: 4000, max: 4799, sector: "Transportation", industry: "Transportation & Public Utilities" },
  { min: 4800, max: 4999, sector: "Communications", industry: "Communications" },
  { min: 5000, max: 5199, sector: "Wholesale", industry: "Wholesale Trade" },
  { min: 5200, max: 5999, sector: "Retail", industry: "Retail Trade" },
  { min: 6000, max: 6799, sector: "Finance", industry: "Finance, Insurance & Real Estate" },
  { min: 7000, max: 8999, sector: "Services", industry: "Services" },
  { min: 9100, max: 9999, sector: "Public Administration", industry: "Public Administration" },
];

/**
 * Convert a SIC (Standard Industrial Classification) code into a coarse
 * sector/industry pair. Polygon returns SIC codes for certain listings and we
 * expose the mapping so manifest consumers can filter by higher-level groups.
 */
export function mapSicToCategory(sic?: number | string | null): Partial<SicCategory> {
  if (sic === undefined || sic === null) {
    return {};
  }

  const code = typeof sic === "string" ? parseInt(sic, 10) : sic;
  if (!Number.isFinite(code)) {
    return {};
  }

  const match = SIC_SECTOR_TABLE.find((row) => code >= row.min && code <= row.max);
  if (!match) {
    return { sector: "Other", industry: "Other" };
  }

  return { sector: match.sector, industry: match.industry };
}

/**
 * Some instruments (ETFs/crypto) do not have a traditional SIC. Provide a
 * simple helper that ensures we always have a sector label for UI purposes.
 */
export function coalesceSector(source?: Partial<SicCategory>, fallback?: string): string | undefined {
  if (source?.sector) return source.sector;
  if (fallback && fallback.trim().length > 0) {
    return fallback.trim();
  }
  return undefined;
}