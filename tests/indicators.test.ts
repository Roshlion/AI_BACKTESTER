/// <reference types="vitest" />
import { describe, expect, it } from 'vitest';
import { SMA, EMA, MACD, RSI } from '../lib/indicators';

describe('Technical Indicators', () => {
  const testPrices = [100, 102, 104, 103, 105, 107, 106, 108, 110, 109];

  describe('SMA (Simple Moving Average)', () => {
    it('should calculate SMA correctly', () => {
      const sma = SMA(testPrices, 3);

      expect(sma).toHaveLength(testPrices.length);
      expect(sma[0]).toBeNaN(); // First value should be NaN
      expect(sma[1]).toBeNaN(); // Second value should be NaN
      expect(sma[2]).toBeCloseTo((100 + 102 + 104) / 3, 2); // Third value should be average of first 3
      expect(sma[3]).toBeCloseTo((102 + 104 + 103) / 3, 2); // Fourth value should be average of 2nd, 3rd, 4th
    });

    it('should handle period longer than data', () => {
      const shortData = [100, 102];
      const sma = SMA(shortData, 5);

      expect(sma).toHaveLength(2);
      expect(sma[0]).toBeNaN();
      expect(sma[1]).toBeNaN();
    });
  });

  describe('EMA (Exponential Moving Average)', () => {
    it('should calculate EMA correctly', () => {
      const ema = EMA(testPrices, 3);

      expect(ema).toHaveLength(testPrices.length);
      expect(ema[0]).toBeNaN(); // First values should be NaN
      expect(ema[1]).toBeNaN();
      expect(typeof ema[2]).toBe('number'); // Should start calculating from period
      expect(ema[2]).not.toBeNaN();
    });

    it('should be more responsive than SMA', () => {
      const prices = [100, 100, 100, 110]; // Price jump
      const sma = SMA(prices, 3);
      const ema = EMA(prices, 3);

      // EMA should react more to the price jump than SMA
      expect(ema[3]).toBeGreaterThan(sma[3]);
    });
  });

  describe('MACD', () => {
    it('should calculate MACD components', () => {
      const result = MACD(testPrices, 3, 6, 3);

      expect(result).toHaveProperty('macd');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('hist');

      expect(result.macd).toHaveLength(testPrices.length);
      expect(result.signal).toHaveLength(testPrices.length);
      expect(result.hist).toHaveLength(testPrices.length);
    });

    it('should have MACD = fastEMA - slowEMA', () => {
      const prices = [100, 102, 104, 106, 108];
      const fastEMA = EMA(prices, 2);
      const slowEMA = EMA(prices, 3);
      const macd = MACD(prices, 2, 3, 2);

      // Check that MACD line equals fastEMA - slowEMA (where both are defined)
      const lastIndex = prices.length - 1;
      expect(macd.macd[lastIndex]).toBeCloseTo(fastEMA[lastIndex] - slowEMA[lastIndex], 2);
    });
  });

  describe('RSI (Relative Strength Index)', () => {
    it('should calculate RSI correctly', () => {
      const rsi = RSI(testPrices, 3);

      expect(rsi).toHaveLength(testPrices.length);
      expect(rsi[0]).toBeNaN(); // First value should be NaN

      // RSI should be between 0 and 100
      for (let i = 3; i < rsi.length; i++) {
        if (!isNaN(rsi[i])) {
          expect(rsi[i]).toBeGreaterThanOrEqual(0);
          expect(rsi[i]).toBeLessThanOrEqual(100);
        }
      }
    });

    it('should handle trending up prices', () => {
      const upTrend = [100, 101, 102, 103, 104, 105, 106]; // Consistent uptrend
      const rsi = RSI(upTrend, 3);

      // RSI should be high (>50) for consistent uptrend
      const lastRSI = rsi[rsi.length - 1];
      expect(lastRSI).toBeGreaterThan(50);
    });

    it('should handle trending down prices', () => {
      const downTrend = [106, 105, 104, 103, 102, 101, 100]; // Consistent downtrend
      const rsi = RSI(downTrend, 3);

      // RSI should be low (<50) for consistent downtrend
      const lastRSI = rsi[rsi.length - 1];
      expect(lastRSI).toBeLessThan(50);
    });
  });
});