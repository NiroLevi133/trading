import { TokenUsage, AnalysisCost } from '@/lib/types';

// Price per 1M tokens in USD
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':      { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':     { input: 3.00,  output: 15.00 },
  'gpt-4o-mini':           { input: 0.15,  output: 0.60  },
  'gemini-2.5-flash-lite': { input: 0.075, output: 0.30  },
};

// Global accumulator — reset before each analysis run
const _usages: TokenUsage[] = [];

export function resetCostAccumulator(): void {
  _usages.length = 0;
}

export function trackUsage(model: string, inputTokens: number, outputTokens: number): void {
  const price = PRICES[model] ?? { input: 0, output: 0 };
  const costUsd = (inputTokens / 1_000_000) * price.input
                + (outputTokens / 1_000_000) * price.output;
  _usages.push({ model, inputTokens, outputTokens, costUsd });
}

export function getAccumulatedCost(): AnalysisCost {
  return {
    totalUsd: _usages.reduce((s, u) => s + u.costUsd, 0),
    breakdown: [..._usages],
  };
}
