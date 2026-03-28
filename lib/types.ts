export type Signal = 'BUY' | 'SELL' | 'HOLD';

export interface AgentResult {
  id: string;
  signal: Signal;
  confidence: number;
  reason: string;
}

export interface GroupResult {
  name: string;
  signal: Signal;
  confidence: number;
  summary: string;
  agents: AgentResult[];
}

export interface MarketSnapshot {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  prices30d: number[];
  sma20: number;
  sma50: number;
  rsi: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
}

export interface PriceTarget {
  low: number;
  high: number;
}

export interface DataSummary {
  priceMovement: string;
  indicators: string;
  volumeSpeed: string;
}

export interface AgentCounts {
  summaryCount: number;
  trendCount: number;
  momentumCount: number;
  sentimentCount: number;
}

export interface AssetAnalysis {
  symbol: string;
  name: string;
  signal: Signal;
  confidence: number;
  recommendation: string;
  priceTarget: PriceTarget;
  groups: GroupResult[];
  marketData: MarketSnapshot;
  dataSummary?: DataSummary;
  analyzedAt: string;
}

export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AnalysisCost {
  totalUsd: number;
  breakdown: TokenUsage[];
}

export interface FullAnalysis {
  aapl: AssetAnalysis;
  sp500: AssetAnalysis;
  nasdaq: AssetAnalysis;
  btc: AssetAnalysis;
  analyzedAt: string;
  cost?: AnalysisCost;
}
