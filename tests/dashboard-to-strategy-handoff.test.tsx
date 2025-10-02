// Test Dashboard to Strategy Lab handoff functionality
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import DashboardClient from '../app/(shell)/dashboard/DashboardClient';
import StrategyClient from '../app/(shell)/strategy/StrategyClient';
import { useStrategyStore } from '../app/store/strategyStore';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

// Mock chart component
vi.mock('../components/MultiTickerChart', () => ({
  MultiTickerChart: () => <div data-testid="chart">Chart</div>,
}));

const mockPush = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (useRouter as any).mockReturnValue({
    push: mockPush,
  });

  // Reset store
  useStrategyStore.getState().clearStrategy();

  // Mock fetch for ticker data
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve({
      tickers: [
        { ticker: 'AAPL', records: 100, firstDate: '2024-01-01', lastDate: '2024-12-31' },
        { ticker: 'MSFT', records: 150, firstDate: '2024-01-01', lastDate: '2024-12-31' },
      ]
    })
  }));
});

describe('Dashboard to Strategy handoff', () => {
  it('updates strategy store and navigates to strategy page when create strategy is clicked', async () => {
    render(<DashboardClient />);

    // Wait for tickers to load
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Select tickers
    const aaplRow = screen.getByText('AAPL').closest('div');
    const msftRow = screen.getByText('MSFT').closest('div');
    fireEvent.click(aaplRow!);
    fireEvent.click(msftRow!);

    // Enable some indicators
    const smaCheckbox = screen.getByLabelText(/SMA/);
    fireEvent.click(smaCheckbox);

    const emaCheckbox = screen.getByLabelText(/EMA/);
    fireEvent.click(emaCheckbox);

    // Click create strategy button
    const createButton = screen.getByText('Create a strategy with this');
    fireEvent.click(createButton);

    // Check that store was updated
    const storeState = useStrategyStore.getState();
    expect(storeState.tickers).toEqual(['AAPL', 'MSFT']);
    expect(storeState.indicators).toEqual(['SMA50', 'EMA20']);

    // Check that navigation occurred
    expect(mockPush).toHaveBeenCalledWith('/strategy');
  });

  it('strategy client reads from store when URL params are absent', () => {
    // Set up store with data
    useStrategyStore.getState().setStrategy({
      tickers: ['AAPL', 'MSFT'],
      indicators: ['SMA50', 'RSI'],
      start: '2024-01-01',
      end: '2024-12-31'
    });

    render(<StrategyClient />);

    // Check that strategy client shows prefilled data
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2024-01-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2024-12-31')).toBeInTheDocument();
  });

  it('strategy client renders prefilled chips and prompt from indicators', () => {
    const indicators = ['SMA50', 'EMA20', 'RSI'];

    render(<StrategyClient tickers={['AAPL']} indicators={indicators} />);

    // Check for ticker chips
    expect(screen.getByText('AAPL')).toBeInTheDocument();

    // Check for strategy prompt hint
    const promptTextarea = screen.getByRole('textbox');
    expect(promptTextarea).toHaveValue(expect.stringContaining('SMA(50)'));
    expect(promptTextarea).toHaveValue(expect.stringContaining('EMA(20)'));
    expect(promptTextarea).toHaveValue(expect.stringContaining('RSI'));
  });
});