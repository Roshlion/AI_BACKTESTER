/// <reference types="vitest" />
import { describe, expect, it } from 'vitest';
import { normaliseDsl, runBacktest, type StrategyDSL } from '../lib/strategy-engine';
import type { Row } from '../types/row';

describe('Strategy Engine', () => {
  const mockData: Row[] = [
    { ticker: 'TEST', date: '2024-01-01', timestamp: Date.parse('2024-01-01'), open: 100, high: 105, low: 95, close: 102, volume: 1000 },
    { ticker: 'TEST', date: '2024-01-02', timestamp: Date.parse('2024-01-02'), open: 102, high: 108, low: 100, close: 106, volume: 1100 },
    { ticker: 'TEST', date: '2024-01-03', timestamp: Date.parse('2024-01-03'), open: 106, high: 110, low: 104, close: 108, volume: 1200 },
    { ticker: 'TEST', date: '2024-01-04', timestamp: Date.parse('2024-01-04'), open: 108, high: 112, low: 106, close: 110, volume: 1300 },
    { ticker: 'TEST', date: '2024-01-05', timestamp: Date.parse('2024-01-05'), open: 110, high: 115, low: 108, close: 113, volume: 1400 },
  ];

  describe('normaliseDsl', () => {
    it('should normalize a valid SMA crossover strategy', () => {
      const input = {
        name: 'Test SMA Strategy',
        rules: [
          {
            type: 'sma_cross',
            params: {
              fast: 5,
              slow: 10,
              enter: 'fast_above',
              exit: 'fast_below'
            }
          }
        ]
      };

      const result = normaliseDsl(input);
      expect(result.name).toBe('Test SMA Strategy');
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].type).toBe('sma_cross');
      if (result.rules[0].type === 'sma_cross') {
        expect(result.rules[0].params.fast).toBe(5);
        expect(result.rules[0].params.slow).toBe(10);
      }
    });

    it('should normalize RSI strategy with default values', () => {
      const input = {
        rules: [
          {
            type: 'rsi_threshold',
            params: {
              period: 14
            }
          }
        ]
      };

      const result = normaliseDsl(input);
      expect(result.name).toBe('Custom Strategy');
      expect(result.rules[0].type).toBe('rsi_threshold');
      if (result.rules[0].type === 'rsi_threshold') {
        expect(result.rules[0].params.period).toBe(14);
      }
    });

    it('should throw error for invalid strategy', () => {
      expect(() => normaliseDsl(null)).toThrow('Strategy DSL must be an object');
    });

    it('should throw error for strategy with no valid rules', () => {
      const input = {
        rules: [
          {
            type: 'invalid_rule',
            params: {}
          }
        ]
      };

      expect(() => normaliseDsl(input)).toThrow('Strategy contains no usable rules');
    });
  });

  describe('runBacktest', () => {
    it('should run a simple SMA crossover backtest', () => {
      const strategy: StrategyDSL = {
        name: 'Simple SMA',
        rules: [
          {
            type: 'sma_cross',
            params: {
              fast: 2,
              slow: 3,
              enter: 'fast_above',
              exit: 'fast_below'
            }
          }
        ]
      };

      const result = runBacktest(strategy, mockData);

      expect(result.name).toBe('Simple SMA');
      expect(result.equity).toHaveLength(mockData.length);
      expect(result.stats).toHaveProperty('totalReturnPct');
      expect(result.stats).toHaveProperty('trades');
      expect(result.stats).toHaveProperty('winRatePct');
      expect(result.stats).toHaveProperty('avgTradePct');
    });

    it('should handle RSI strategy', () => {
      const strategy: StrategyDSL = {
        name: 'RSI Strategy',
        rules: [
          {
            type: 'rsi_threshold',
            params: {
              period: 3,
              low: 30,
              high: 70,
              enter: 'long',
              exit: 'long'
            }
          }
        ]
      };

      const result = runBacktest(strategy, mockData);

      expect(result.name).toBe('RSI Strategy');
      expect(result.equity).toHaveLength(mockData.length);
      expect(typeof result.stats.totalReturnPct).toBe('number');
    });

    it('should handle empty data gracefully', () => {
      const strategy: StrategyDSL = {
        name: 'Test Strategy',
        rules: [
          {
            type: 'sma_cross',
            params: {
              fast: 5,
              slow: 10
            }
          }
        ]
      };

      const result = runBacktest(strategy, []);

      expect(result.trades).toHaveLength(0);
      expect(result.equity).toHaveLength(0);
      expect(result.stats.trades).toBe(0);
    });
  });
});