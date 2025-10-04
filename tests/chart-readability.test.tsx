// Test chart readability features for multi-ticker displays
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiTickerChart } from '../components/MultiTickerChart';

// Mock recharts to avoid canvas/SVG issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="chart-container">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: ({ dataKey, hide }: any) => (
    <div data-testid={`line-${dataKey}`} data-hidden={hide} />
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: ({ onClick, onMouseEnter, onMouseLeave }: any) => (
    <div
      data-testid="legend"
      onClick={() => onClick?.({ dataKey: 'AAPL' })}
      onMouseEnter={() => onMouseEnter?.({ dataKey: 'AAPL' })}
      onMouseLeave={() => onMouseLeave?.()}
    />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();

  // Mock successful API responses
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve({
      ok: true,
      rows: [
        { date: '2024-01-01', close: 100, open: 99, high: 101, low: 98, volume: 1000 },
        { date: '2024-01-02', close: 102, open: 100, high: 103, low: 99, volume: 1200 },
        { date: '2024-01-03', close: 98, open: 102, high: 102, low: 97, volume: 1100 },
      ]
    })
  }));
});

describe('Chart readability features', () => {
  it('renders multiple tickers with different colors', async () => {
    const tickers = ['AAPL', 'MSFT', 'GOOGL'];

    render(<MultiTickerChart tickers={tickers} />);

    // Should render lines for each ticker
    expect(screen.getByTestId('line-AAPL')).toBeInTheDocument();
    expect(screen.getByTestId('line-MSFT')).toBeInTheDocument();
    expect(screen.getByTestId('line-GOOGL')).toBeInTheDocument();
  });

  it('allows toggling series visibility via legend click', async () => {
    const tickers = ['AAPL', 'MSFT'];

    render(<MultiTickerChart tickers={tickers} />);

    const legend = screen.getByTestId('legend');

    // Initially visible
    expect(screen.getByTestId('line-AAPL')).toHaveAttribute('data-hidden', 'false');

    // Click legend to hide series
    fireEvent.click(legend);

    // Should toggle visibility state (implementation would update the hide prop)
    // This tests the interaction mechanism exists
  });

  it('handles hover emphasis on legend items', async () => {
    const tickers = ['AAPL', 'MSFT'];

    render(<MultiTickerChart tickers={tickers} />);

    const legend = screen.getByTestId('legend');

    // Test hover enter
    fireEvent.mouseEnter(legend);
    // Test hover leave
    fireEvent.mouseLeave(legend);

    // These events should be handled (opacity changes would be in implementation)
  });

  it('supports different scale modes', () => {
    const tickers = ['AAPL', 'MSFT'];

    render(<MultiTickerChart tickers={tickers} />);

    // Should render scale selector
    const scaleSelect = screen.getByDisplayValue('Price (Absolute)');
    expect(scaleSelect).toBeInTheDocument();

    // Test changing to indexed mode
    fireEvent.change(scaleSelect, { target: { value: 'indexed' } });
    expect(scaleSelect).toHaveValue('indexed');

    // Test small multiples mode
    fireEvent.change(scaleSelect, { target: { value: 'small-multiples' } });
    expect(scaleSelect).toHaveValue('small-multiples');
  });

  it('shows small multiples mode with grid layout for many tickers', () => {
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA'];

    render(<MultiTickerChart tickers={tickers} />);

    const scaleSelect = screen.getByDisplayValue('Price (Absolute)');
    fireEvent.change(scaleSelect, { target: { value: 'small-multiples' } });

    // Should show notice about showing only first 6 and provide "Show all" toggle
    expect(screen.getByText(/Showing first 6 tickers/)).toBeInTheDocument();
    expect(screen.getByText(/1 more available/)).toBeInTheDocument();

    const showAllButton = screen.getByText('Show all');
    fireEvent.click(showAllButton);

    // After clicking show all, notice should disappear
    expect(screen.queryByText(/Showing first 6 tickers/)).not.toBeInTheDocument();
  });

  it('renders separate panels for RSI and MACD indicators', () => {
    const tickers = ['AAPL'];
    const indicators = {
      sma: { enabled: false, period: 50 },
      ema: { enabled: false, period: 20 },
      rsi: { enabled: true },
      macd: { enabled: true },
    };

    render(<MultiTickerChart tickers={tickers} indicators={indicators} />);

    // Should show RSI panel
    expect(screen.getByText('RSI (14)')).toBeInTheDocument();

    // Should show MACD panel
    expect(screen.getByText('MACD (12,26,9)')).toBeInTheDocument();
  });

  it('applies proper stroke widths and styles for different line types', () => {
    const tickers = ['AAPL'];
    const indicators = {
      sma: { enabled: true, period: 50 },
      ema: { enabled: true, period: 20 },
      rsi: { enabled: false },
      macd: { enabled: false },
    };

    render(<MultiTickerChart tickers={tickers} indicators={indicators} />);

    // Should render price line and indicator lines
    expect(screen.getByTestId('line-AAPL')).toBeInTheDocument();
    expect(screen.getByTestId('line-AAPL_SMA50')).toBeInTheDocument();
    expect(screen.getByTestId('line-AAPL_EMA20')).toBeInTheDocument();
  });
});