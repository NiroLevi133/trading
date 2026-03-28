import OpenAI from 'openai';
import { MarketSnapshot } from '@/lib/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type GroupName = 'trend-following' | 'momentum' | 'sentiment';

export async function routerAgent(market: MarketSnapshot): Promise<GroupName[]> {
  const prompt = `You are a routing agent. Given this market data, select the 1-2 most relevant analysis groups.

Asset: ${market.name} (${market.symbol})
Price: $${market.price.toFixed(2)}
Change 24h: ${market.changePercent.toFixed(2)}%
RSI: ${market.rsi}
MACD: ${market.macdSignal}
Price vs SMA20: ${market.price > market.sma20 ? 'above' : 'below'}
Price vs SMA50: ${market.price > market.sma50 ? 'above' : 'below'}

Available groups:
- trend-following: best when strong directional movement
- momentum: best when RSI is extreme or MACD is clear
- sentiment: best when market is uncertain or volatile

Respond with ONLY a JSON array of 1-2 group names. Example: ["trend-following","momentum"]`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 50,
  });

  try {
    const text = response.choices[0].message.content ?? '["trend-following"]';
    const groups = JSON.parse(text) as GroupName[];
    return groups.slice(0, 2);
  } catch {
    return ['trend-following'];
  }
}
