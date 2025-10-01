"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, Filter, Download, TrendingUp, Calendar, Database, ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";

interface TickerInfo {
  ticker: string;
  url?: string;
  records?: number;
  firstDate?: string;
  lastDate?: string;
  format?: string;
  sector?: string;
  industry?: string;
}

interface ManifestData {
  tickers: TickerInfo[];
  asOf?: string;
  source?: string;
}

export default function DataExplorerPage() {
  const [data, setData] = useState<ManifestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSector, setSelectedSector] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sortBy, setSortBy] = useState<"ticker" | "records" | "lastDate">("ticker");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Normalizes mixed schemas to our expected shape
  function normalizeTicker(t: any) {
    const ticker = String(t?.ticker ?? t?.symbol ?? "").toUpperCase();
    return {
      ticker,
      url: t?.url,
      // use ?? so 0 is kept
      records: t?.records ?? t?.recordCount ?? t?.rows ?? undefined,
      firstDate: t?.firstDate ?? t?.first_date ?? t?.start ?? undefined,
      lastDate: t?.lastDate ?? t?.last_date ?? t?.end ?? undefined,
      format: (t?.format ?? t?.file_format ?? "").toUpperCase() || undefined,
      sector: t?.sector ?? t?.Sector ?? undefined,
      industry: t?.industry ?? t?.Industry ?? undefined,
    } as TickerInfo;
  }

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch("/api/index", { cache: "no-store" });
        const result = await response.json();

        let tickers: any[] = Array.isArray(result.tickers)
          ? result.tickers.map((t: any) => (typeof t === "string" ? { ticker: t } : t))
          : [];

        let normalized = tickers.map(normalizeTicker);

        // If everything lacks metadata, fall back to public/manifest.json and merge
        const needsEnrichment = normalized.every(
          (t) => t.records == null && t.firstDate == null && t.lastDate == null
        );

        if (needsEnrichment) {
          try {
            const pubRes = await fetch("/manifest.json", { cache: "no-store" });
            if (pubRes.ok) {
              const pub = await pubRes.json();
              const map = new Map(
                (Array.isArray(pub?.tickers) ? pub.tickers : []).map((x: any) => [
                  String(x?.ticker ?? "").toUpperCase(),
                  normalizeTicker(x),
                ])
              );
              normalized = normalized.map((t) => {
                const e = map.get(t.ticker);
                return e ? { ...t, ...e, ticker: t.ticker } : t;
              });
            }
          } catch {
            // no-op; keep normalized as-is
          }
        }

        if (normalized.length > 0) {
          setData({
            tickers: normalized,
            asOf: result.asOf ?? null,
            source: result.source ?? "api/index",
          });
        } else {
          setError("No ticker data found");
        }
      } catch (err) {
        setError("Failed to load ticker data");
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Process and filter data
  const { filteredTickers, sectors, stats } = useMemo(() => {
    if (!data?.tickers) {
      return { filteredTickers: [], sectors: [], stats: { total: 0, withData: 0, avgRecords: 0 } };
    }

    let filtered = [...data.tickers];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(ticker =>
        ticker.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticker.sector?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticker.industry?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sector filter
    if (selectedSector) {
      filtered = filtered.filter(ticker => ticker.sector === selectedSector);
    }

    // Date filter
    if (dateFilter) {
      filtered = filtered.filter(ticker =>
        ticker.lastDate && ticker.lastDate >= dateFilter
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case "records":
          aVal = a.records ?? 0;
          bVal = b.records ?? 0;
          break;
        case "lastDate":
          aVal = a.lastDate ?? "";
          bVal = b.lastDate ?? "";
          break;
        default:
          aVal = a.ticker;
          bVal = b.ticker;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    // Extract unique sectors
    const sectorSet = new Set<string>();
    data.tickers.forEach(ticker => {
      if (ticker.sector) sectorSet.add(ticker.sector);
    });

    // Calculate stats
    const withData = data.tickers.filter(t => (t.records ?? 0) > 0);
    const totalRecords = withData.reduce((sum, t) => sum + (t.records ?? 0), 0);

    return {
      filteredTickers: filtered,
      sectors: Array.from(sectorSet).sort(),
      stats: {
        total: data.tickers.length,
        withData: withData.length,
        avgRecords: withData.length > 0 ? Math.round(totalRecords / withData.length) : 0,
      },
    };
  }, [data, searchQuery, selectedSector, dateFilter, sortBy, sortOrder]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading ticker data...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Error: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                href="/dashboard"
                className="flex items-center text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </div>

            <div className="flex space-x-3">
              <Link
                href="/strategy"
                className="flex items-center px-4 py-2 border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 rounded-lg transition-colors"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Open Strategy Lab
              </Link>
            </div>
          </div>

          <div className="mt-4">
            <h1 className="text-3xl font-bold text-white mb-2">
              <Database className="inline w-8 h-8 mr-2 text-purple-400" />
              Data Explorer
            </h1>
            <p className="text-gray-400 text-lg">
              Explore available ticker datasets, metadata, and data coverage
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center">
              <Database className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <div className="text-2xl font-bold text-white">{stats.total}</div>
                <div className="text-sm text-gray-400">Total Tickers</div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center">
              <TrendingUp className="w-8 h-8 text-green-400 mr-3" />
              <div>
                <div className="text-2xl font-bold text-white">{stats.withData}</div>
                <div className="text-sm text-gray-400">With Data</div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center">
              <Calendar className="w-8 h-8 text-purple-400 mr-3" />
              <div>
                <div className="text-2xl font-bold text-white">{stats.avgRecords.toLocaleString()}</div>
                <div className="text-sm text-gray-400">Avg Records</div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center">
              <Filter className="w-8 h-8 text-yellow-400 mr-3" />
              <div>
                <div className="text-2xl font-bold text-white">{filteredTickers.length}</div>
                <div className="text-sm text-gray-400">Filtered Results</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Filters & Search</h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Search className="inline w-4 h-4 mr-1" />
                Search Tickers
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ticker, sector..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Sector</label>
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">All Sectors</option>
                {sectors.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Last Updated After</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Sort By</label>
              <div className="flex space-x-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="ticker">Ticker</option>
                  <option value="records">Records</option>
                  <option value="lastDate">Last Date</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white hover:bg-gray-600 transition-colors"
                >
                  {sortOrder === "asc" ? "↑" : "↓"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-white">
              Ticker Catalog ({filteredTickers.length} items)
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th
                    className="text-left p-4 text-gray-300 cursor-pointer hover:text-white"
                    onClick={() => handleSort("ticker")}
                  >
                    Ticker {sortBy === "ticker" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left p-4 text-gray-300">Sector</th>
                  <th
                    className="text-right p-4 text-gray-300 cursor-pointer hover:text-white"
                    onClick={() => handleSort("records")}
                  >
                    Records {sortBy === "records" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left p-4 text-gray-300">First Date</th>
                  <th
                    className="text-left p-4 text-gray-300 cursor-pointer hover:text-white"
                    onClick={() => handleSort("lastDate")}
                  >
                    Last Date {sortBy === "lastDate" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left p-4 text-gray-300">Format</th>
                  <th className="text-center p-4 text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickers.map((ticker, index) => (
                  <tr key={ticker.ticker} className={index % 2 === 0 ? "bg-gray-750" : "bg-gray-800"}>
                    <td className="p-4">
                      <div className="font-medium text-white">{ticker.ticker}</div>
                      {ticker.industry && (
                        <div className="text-xs text-gray-400">{ticker.industry}</div>
                      )}
                    </td>
                    <td className="p-4">
                      {ticker.sector ? (
                        <span className="inline-block px-2 py-1 bg-blue-600/20 text-blue-300 text-xs rounded">
                          {ticker.sector}
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="p-4 text-right text-gray-300">
                      {ticker.records != null ? ticker.records.toLocaleString() : "-"}
                    </td>
                    <td className="p-4 text-gray-300">{ticker.firstDate ?? "-"}</td>
                    <td className="p-4 text-gray-300">{ticker.lastDate ?? "-"}</td>
                    <td className="p-4">
                      {ticker.format && (
                        <span className="inline-block px-2 py-1 bg-green-600/20 text-green-300 text-xs rounded uppercase">
                          {ticker.format}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex space-x-2 justify-center">
                        <Link
                          href={{ pathname: "/dashboard", query: { ticker: ticker.ticker } }}
                          className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                          title="View Chart"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        {ticker.url && (
                          <a
                            href={ticker.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
                            title="Download Data"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredTickers.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                No tickers match your current filters.
              </div>
            )}
          </div>
        </div>

        {/* Metadata */}
        {data?.asOf && (
          <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-gray-300">Data Source: {data.source || "S3"}</span>
                </div>
              </div>
              <div className="text-gray-400">
                Last Updated: {new Date(data.asOf).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
