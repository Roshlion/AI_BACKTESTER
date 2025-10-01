export type StrategyUrlInput = {
  tickers: string[];
  indicatorParams?: string[];
  dateRange?: {
    start?: string;
    end?: string;
  };
};

export function buildStrategyUrl({
  tickers,
  indicatorParams = [],
  dateRange,
}: StrategyUrlInput): string {
  if (!tickers.length) {
    return "/strategy";
  }

  const params = new URLSearchParams();
  params.set("tickers", tickers.join(","));

  if (indicatorParams.length) {
    params.set("indicators", indicatorParams.join(","));
  }

  if (dateRange?.start) params.set("start", dateRange.start);
  if (dateRange?.end) params.set("end", dateRange.end);

  const query = params.toString();
  return query ? `/strategy?${query}` : "/strategy";
}
