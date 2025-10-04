// Test Dashboard ticker selection functionality
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import DashboardClient from '../app/(shell)/dashboard/DashboardClient';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

// Mock chart component to avoid recharts issues in tests
vi.mock('../components/MultiTickerChart', () => ({
  MultiTickerChart: ({ tickers }: { tickers: string[] }) => (
    <div data-testid="chart">Chart for {tickers.join(', ')}</div>
  ),
}));

const mockPush = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (useRouter as any).mockReturnValue({
    push: mockPush,
  });

  // Mock fetch for ticker data
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve({
      tickers: [
        { ticker: 'AAPL', records: 100, firstDate: '2024-01-01', lastDate: '2024-12-31' },
        { ticker: 'MSFT', records: 150, firstDate: '2024-01-01', lastDate: '2024-12-31' },
        { ticker: 'GOOGL', records: 120, firstDate: '2024-01-01', lastDate: '2024-12-31' },
      ]
    })
  }));
});

describe('Dashboard ticker selection', () => {
  it('renders ticker list and allows search filtering', async () => {
    render(<DashboardClient />);

    // Wait for tickers to load
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
    });

    // Test search functionality
    const searchInput = screen.getByPlaceholderText('Search tickers...');
    fireEvent.change(searchInput, { target: { value: 'AAP' } });

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
    expect(screen.queryByText('GOOGL')).not.toBeInTheDocument();
  });

  it('shows "No tickers found" when search has no matches', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search tickers...');
    fireEvent.change(searchInput, { target: { value: 'NOTFOUND' } });

    expect(screen.getByText('No tickers found')).toBeInTheDocument();
  });

  it('allows ticker selection and shows selected count', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Initially no tickers selected
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();

    // Click on AAPL ticker row
    const aaplRow = screen.getByText('AAPL').closest('div[role="button"], div[class*="cursor-pointer"]') ||
                   screen.getByText('AAPL').closest('div');
    fireEvent.click(aaplRow!);

    expect(screen.getByText(/1 selected/)).toBeInTheDocument();

    // Should show selected ticker chip
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
  });

  it('eye icon opens Data Warehouse with correct symbol', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Find and click the eye icon for AAPL
    const eyeIcon = screen.getByLabelText('Open in Data Warehouse');
    fireEvent.click(eyeIcon);

    expect(mockPush).toHaveBeenCalledWith('/explore?symbol=AAPL');
  });

  it('isolate action sets exactly one ticker selected', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // First select multiple tickers
    const aaplRow = screen.getByText('AAPL').closest('div');
    const msftRow = screen.getByText('MSFT').closest('div');

    fireEvent.click(aaplRow!);
    fireEvent.click(msftRow!);

    expect(screen.getByText(/2 selected/)).toBeInTheDocument();

    // Now isolate AAPL
    const moreButton = screen.getAllByTitle('More actions')[0];
    fireEvent.click(moreButton);

    const isolateButton = screen.getByLabelText('Isolate this ticker');
    fireEvent.click(isolateButton);

    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
  });
});