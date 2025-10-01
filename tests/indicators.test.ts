/// <reference types="vitest" />
import { describe, expect, it } from 'vitest';
import { sma, ema, macd, rsi } from '../lib/indicators';

describe('Technical Indicators', () => {
  const testPrices = [100, 102, 104, 103, 105, 107, 106, 108, 110, 109];

  describe('SMA (Simple Moving Average)', () => {
    it('should calculate SMA correctly', () => {
      const smaValues = sma(testPrices, 3);

      expect(smaValues).toHaveLength(testPrices.length);
      expect(smaValues[0]).toBeNull();
      expect(smaValues[1]).toBeNull();
      expect(smaValues[2]).toBeCloseTo((100 + 102 + 104) / 3, 2);
      expect(smaValues[3]).toBeCloseTo((102 + 104 + 103) / 3, 2);
    });

    it('should handle period longer than data', () => {
      const shortData = [100, 102];
      const smaValues = sma(shortData, 5);

      expect(smaValues).toHaveLength(2);
      expect(smaValues[0]).toBeNull();
      expect(smaValues[1]).toBeNull();
    });
  });

  describe('EMA (Exponential Moving Average)', () => {
    it('should calculate EMA correctly', () => {
      const emaValues = ema(testPrices, 3);

      expect(emaValues).toHaveLength(testPrices.length);
      expect(emaValues[0]).toBeNull();
      expect(emaValues[1]).toBeNull();
      expect(emaValues[2]).not.toBeNull();
    });

    it('should be more responsive than SMA', () => {
      const prices = [100, 100, 100, 110]; // Price jump
      const smaValues = sma(prices, 3);
      const emaValues = ema(prices, 3);

      // EMA should react more to the price jump than SMA
      const emaValue = emaValues[3];
      const smaValue = smaValues[3];
      expect(emaValue).not.toBeNull();
      expect(smaValue).not.toBeNull();
      expect(emaValue!).toBeGreaterThan(smaValue!);
    });
  });

  describe('MACD', () => {
    it('should calculate MACD components', () => {
      const result = macd(testPrices, 3, 6, 3);

      expect(result).toHaveProperty('macd');
      expect(result).toHaveProperty('signal');

      expect(result.macd).toHaveLength(testPrices.length);
      expect(result.signal).toHaveLength(testPrices.length);
    });

    it('should have MACD = fastEMA - slowEMA', () => {
      const prices = [100, 102, 104, 106, 108];
      const fastEMA = ema(prices, 2);
      const slowEMA = ema(prices, 3);
      const macdResult = macd(prices, 2, 3, 2);

      // Check that MACD line equals fastEMA - slowEMA (where both are defined)
      const lastIndex = prices.length - 1;
      const macdValue = macdResult.macd[lastIndex];
      const fastValue = fastEMA[lastIndex];
      const slowValue = slowEMA[lastIndex];
      expect(macdValue).not.toBeNull();
      expect(fastValue).not.toBeNull();
      expect(slowValue).not.toBeNull();
      expect(macdValue!).toBeCloseTo(fastValue! - slowValue!, 2);
    });
  });

  describe('RSI (Relative Strength Index)', () => {
    it('should calculate RSI correctly', () => {
      const rsiValues = rsi(testPrices, 3);

      expect(rsiValues).toHaveLength(testPrices.length);
      expect(rsiValues[0]).toBeNull();

      // RSI should be between 0 and 100
      for (let i = 3; i < rsiValues.length; i++) {
        const value = rsiValues[i];
        if (value == null) continue;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    });

    it('should handle trending up prices', () => {
      const upTrend = [100, 101, 102, 103, 104, 105, 106]; // Consistent uptrend
      const rsiValues = rsi(upTrend, 3);

      // RSI should be high (>50) for consistent uptrend
      const lastRSI = rsiValues[rsiValues.length - 1];
      expect(lastRSI).not.toBeNull();
      expect(lastRSI!).toBeGreaterThan(50);
    });

    it('should handle trending down prices', () => {
      const downTrend = [106, 105, 104, 103, 102, 101, 100]; // Consistent downtrend
      const rsiValues = rsi(downTrend, 3);

      // RSI should be low (<50) for consistent downtrend
      const lastRSI = rsiValues[rsiValues.length - 1];
      expect(lastRSI).not.toBeNull();
      expect(lastRSI!).toBeLessThan(50);
    });
  });
});