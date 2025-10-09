import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StrategyClient from '@/app/(shell)/strategy/StrategyClient';

// Mock fetch globally
global.fetch = vi.fn();

// Mock useStrategyStore
vi.mock('@/app/store/strategyStore', () => ({
  useStrategyStore: () => ({
    tickers: [],
    indicators: [],
    start: '',
    end: ''
  })
}));

describe('Strategy Lab Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ tickers: ['AAPL', 'MSFT', 'GOOGL'] })
    });
  });

  it('should render DSL and ML tabs', async () => {
    render(<StrategyClient />);

    expect(screen.getByTestId('tab-dsl')).toBeInTheDocument();
    expect(screen.getByTestId('tab-ml')).toBeInTheDocument();
  });

  it('should render ML health badge', async () => {
    render(<StrategyClient />);

    await waitFor(() => {
      expect(screen.getByTestId('ml-health-badge')).toBeInTheDocument();
    });
  });

  it('should render manual checker toggle', async () => {
    render(<StrategyClient />);

    expect(screen.getByTestId('manual-checker-toggle')).toBeInTheDocument();
  });

  it('should switch between DSL and ML modes', async () => {
    render(<StrategyClient />);

    const mlTab = screen.getByTestId('tab-ml');
    fireEvent.click(mlTab);

    await waitFor(() => {
      expect(screen.getByTestId('ml-prompt-textarea')).toBeInTheDocument();
    });
  });

  it('should disable generate buttons in manual mode', async () => {
    render(<StrategyClient />);

    const manualToggle = screen.getByTestId('manual-checker-toggle');
    fireEvent.click(manualToggle);

    await waitFor(() => {
      const dslGenerateBtn = screen.getByTestId('dsl-generate-btn');
      expect(dslGenerateBtn).toBeDisabled();
    });
  });

  it('should prefill DSL code in manual mode', async () => {
    render(<StrategyClient />);

    const manualToggle = screen.getByTestId('manual-checker-toggle');
    fireEvent.click(manualToggle);

    await waitFor(() => {
      const dslEditor = screen.getByTestId('dsl-editor') as HTMLTextAreaElement;
      expect(dslEditor.value).not.toBe('');
      expect(dslEditor.value).toContain('tickers');
    });
  });

  it('should show mode-specific example prompts', async () => {
    render(<StrategyClient />);

    // DSL mode - check for DSL examples
    let examples = screen.getAllByTestId(/example-prompt-/);
    expect(examples.length).toBeGreaterThan(0);
    expect(examples[0].textContent).toContain('EMA');

    // Switch to ML mode
    const mlTab = screen.getByTestId('tab-ml');
    fireEvent.click(mlTab);

    await waitFor(() => {
      examples = screen.getAllByTestId(/example-prompt-/);
      expect(examples[0].textContent).toContain('RandomForest');
    });
  });

  it('should handle DSL generate flow with loading state', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/index')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ tickers: ['AAPL'] })
        });
      }
      if (url.includes('/api/ml/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'down' })
        });
      }
      if (url.includes('/api/strategy/generate')) {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ dsl: { rules: 'test' } })
            });
          }, 100);
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    render(<StrategyClient />);

    const promptTextarea = screen.getByTestId('dsl-prompt-textarea');
    const generateBtn = screen.getByTestId('dsl-generate-btn');

    fireEvent.change(promptTextarea, { target: { value: 'test strategy' } });
    fireEvent.click(generateBtn);

    // Should show loading state
    await waitFor(() => {
      expect(generateBtn).toHaveTextContent(/Generating/);
      expect(generateBtn).toBeDisabled();
    });

    // Should complete
    await waitFor(() => {
      expect(generateBtn).not.toHaveTextContent(/Generating/);
    }, { timeout: 2000 });
  });

  it('should handle ML generate with hyperparams', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/index')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ tickers: ['AAPL'] })
        });
      }
      if (url.includes('/api/ml/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok' })
        });
      }
      if (url.includes('/api/strategy/generate')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            code: 'print("ml code")',
            hyperparams: { n_estimators: 150 }
          })
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    render(<StrategyClient />);

    // Switch to ML mode
    const mlTab = screen.getByTestId('tab-ml');
    fireEvent.click(mlTab);

    await waitFor(() => {
      expect(screen.getByTestId('ml-generate-btn')).not.toBeDisabled();
    });

    const mlPrompt = screen.getByTestId('ml-prompt-textarea');
    const mlGenerateBtn = screen.getByTestId('ml-generate-btn');

    fireEvent.change(mlPrompt, { target: { value: 'RandomForest model' } });
    fireEvent.click(mlGenerateBtn);

    await waitFor(() => {
      const mlEditor = screen.getByTestId('ml-editor') as HTMLTextAreaElement;
      expect(mlEditor.value).toContain('ml code');
    });
  });

  it('should prevent double-click on run buttons', async () => {
    let callCount = 0;
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/strategy/run')) {
        callCount++;
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ metrics: { total_return: 0.15 } })
            });
          }, 200);
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ tickers: [], status: 'down' })
      });
    });

    render(<StrategyClient />);

    // Toggle manual mode to prefill DSL
    const manualToggle = screen.getByTestId('manual-checker-toggle');
    fireEvent.click(manualToggle);

    await waitFor(() => {
      const dslEditor = screen.getByTestId('dsl-editor') as HTMLTextAreaElement;
      expect(dslEditor.value).not.toBe('');
    });

    const runBtn = screen.getByTestId('dsl-run-btn');

    // Click twice quickly
    fireEvent.click(runBtn);
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(callCount).toBe(1); // Should only call once
    }, { timeout: 3000 });
  });
});
