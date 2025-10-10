export type StrategyMode = 'dsl' | 'ml';

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export interface DslIndicators {
  sma?: { periods: number[] };
  ema?: { periods: number[] };
  rsi?: { enabled: boolean; period?: number };
  macd?: { enabled: boolean; fast?: number; slow?: number; signal?: number };
}

export interface StrategyGenerateReq extends DateRange {
  mode: StrategyMode;
  tickers: string[];                 // required (>=1)
  indicators?: DslIndicators;        // DSL only
  prompt?: string;                   // DSL or ML
  hyperparams?: Record<string, any>; // ML only
}

export interface StrategyRunReq extends DateRange {
  mode: StrategyMode;
  tickers: string[];                 // required
  dsl?: any;                         // DSL mode - DSL object or string
  ml?: { code?: string; hyperparams?: Record<string, any>; modelType?: string }; // ML mode
  portfolio?: any;                   // Portfolio configuration (optional, defaults applied in route)
}
