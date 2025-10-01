"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

interface TickerInfo {
  ticker: string;
  format?: string;
  records?: number;
  firstDate?: string;
  lastDate?: string;
}

interface TickerSelectorProps {
  onSelectionChange: (tickers: string[]) => void;
  selectedTickers: string[];
}

function normaliseTicker(value: string): string {
  return value.trim().toUpperCase();
}

type TickerRowProps = {
  item: TickerInfo;
  selected: boolean;
  onToggle: (ticker: string) => void;
  onSelectOnly: (ticker: string) => void;
};

const TickerRow = memo(function TickerRow({ item, selected, onToggle, onSelectOnly }: TickerRowProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle(item.ticker);
      }
    },
    [item.ticker, onToggle],
  );

  const handleOnly = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onSelectOnly(item.ticker);
    },
    [item.ticker, onSelectOnly],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onToggle(item.ticker)}
      onKeyDown={handleKeyDown}
      data-testid={`ticker-row-${item.ticker}`}
      className={`group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
        selected
          ? "bg-blue-600/40 text-blue-50 border border-blue-400"
          : "bg-gray-700 text-gray-100 border border-transparent hover:bg-gray-600"
      }`}
    >
      <span className="tracking-wide">{item.ticker}</span>
      <button
        type="button"
        onClick={handleOnly}
        className="rounded-full px-2 py-1 text-xs font-semibold text-blue-200 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        only
      </button>
    </div>
  );
});

export const __TickerRowTest = TickerRow;

export function TickerSelector({ onSelectionChange, selectedTickers }: TickerSelectorProps) {
  const [tickers, setTickers] = useState<TickerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTickers() {
      try {
        const response = await fetch("/api/index");
        const data = await response.json();

        if (!cancelled && data.tickers) {
          const tickerList = Array.isArray(data.tickers)
            ? data.tickers.map((t: any) =>
                typeof t === "string"
                  ? { ticker: normaliseTicker(t) }
                  : { ...t, ticker: normaliseTicker(t.ticker ?? "") },
              )
            : [];
          setTickers(tickerList);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load tickers");
          console.error("Error loading tickers:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTickers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filteredTickers = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return tickers;
    return tickers.filter((ticker) => ticker.ticker.toLowerCase().includes(query));
  }, [tickers, debouncedSearch]);

  const handleToggle = useCallback(
    (ticker: string) => {
      const normalised = normaliseTicker(ticker);
      const alreadySelected = selectedTickers.includes(normalised);
      const next = alreadySelected
        ? selectedTickers.filter((value) => value !== normalised)
        : [...selectedTickers, normalised];
      onSelectionChange(next);
    },
    [onSelectionChange, selectedTickers],
  );

  const handleSelectOnly = useCallback(
    (ticker: string) => {
      onSelectionChange([normaliseTicker(ticker)]);
    },
    [onSelectionChange],
  );

  const handleRemoveChip = useCallback(
    (ticker: string) => {
      onSelectionChange(selectedTickers.filter((value) => value !== ticker));
    },
    [onSelectionChange, selectedTickers],
  );

  if (loading) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg">
        <p className="text-gray-400">Loading tickers…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/60 rounded-lg">
        <p className="text-red-200">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 flex flex-col h-full border border-gray-700/60">
      <div className="mb-4 space-y-1">
        <h3 className="text-lg font-semibold text-white">Available Tickers ({tickers.length})</h3>
        <p className="text-xs text-gray-400">
          Click a row to toggle it. Use the “only” action to isolate a single ticker quickly.
        </p>
      </div>

      <label className="sr-only" htmlFor="ticker-search">
        Search tickers
      </label>
      <input
        id="ticker-search"
        type="text"
        placeholder="Search tickers…"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        className="w-full px-3 py-2 mb-3 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
      />

      <div className="flex-1 overflow-y-auto pr-1">
        {filteredTickers.length === 0 ? (
          <p className="text-gray-400">No tickers found</p>
        ) : (
          <div className="space-y-1">
            {filteredTickers.map((ticker) => (
              <TickerRow
                key={ticker.ticker}
                item={ticker}
                selected={selectedTickers.includes(ticker.ticker)}
                onToggle={handleToggle}
                onSelectOnly={handleSelectOnly}
              />
            ))}
          </div>
        )}
      </div>

      {selectedTickers.length > 0 && (
        <div className="mt-4 rounded-lg border border-blue-600/50 bg-blue-900/20 p-3 text-xs text-blue-100">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>Selected ({selectedTickers.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTickers.map((ticker) => (
              <button
                key={ticker}
                type="button"
                onClick={() => handleRemoveChip(ticker)}
                data-testid={`selected-chip-${ticker}`}
                className="flex items-center gap-1 rounded-full bg-blue-700/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-blue-600"
                aria-label={`Remove ${ticker}`}
              >
                <span>{ticker}</span>
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
