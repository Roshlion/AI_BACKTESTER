import * as React from 'react';

/**
 * Hook for handling async actions with loading state and single-flight protection
 * Prevents concurrent executions and tracks errors
 */
export function useAsyncAction<T extends any[]>(fn: (...args: T) => Promise<any>) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (...args: T) => {
      if (loading) return; // Single-flight: prevent concurrent executions
      setLoading(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e: any) {
        const errorMessage = e?.message || 'Action failed';
        setError(errorMessage);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [fn, loading]
  );

  return { run, loading, error, setError };
}
