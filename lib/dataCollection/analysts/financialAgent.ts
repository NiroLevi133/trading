// ─────────────────────────────────────────────────────────────────────────────
// Financial Agent — Claude Sonnet
// Analyzes market/financial/crypto/commodities data
// Outputs: trading signals, market-moving events, price impact assessment
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { CollectedItem } from '../rssCollector';
import { trackUsage } from '@/lib/pricing';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FINANCIAL_CATEGORIES = ['news_intl', 'news_il', 'market_data', 'crypto', 'commodities'];

export interface FinancialSignal {
  asset: string;        // e.g. "BTC", "S&P 500", "זהב", "שקל"
  direction: 'חיובי' | 'שלילי' | 'ניטרלי';
  strength: 'חלש' | 'בינוני' | 'חזק';
  reason: string;
}

export interface FinancialAnalysis {
  summary: string;
  signals: FinancialSignal[];
  marketMovers: string[];   // top market-moving events
  sentiment: 'שורי' | 'דובי' | 'מעורב' | 'ניטרלי';
  confidence: number;       // 0-100
  keyRisks: string[];
  model: string;
  costUsd: number;
}

function buildFinancialPrompt(items: CollectedItem[]): string {
  const today = new Date().toLocaleDateString('he-IL');

  // Prioritize high-value items
  const relevant = items
    .filter(i => FINANCIAL_CATEGORIES.includes(i.category))
    .slice(0, 60); // Cap to control token usage

  const formatted = relevant
    .map(i => `[${i.sourceName} | ${i.category}]\n${i.title}\n${i.content}`)
    .join('\n\n---\n\n');

  return `אתה אנליסט פיננסי בכיר שמנתח חדשות שוק ההון להיום ${today}.

להלן ${relevant.length} פריטי מידע שנאספו ממקורות פיננסיים:

${formatted}

נתח את המידע ותן:
1. סיכום כללי של מצב השוק (3-4 משפטים פשוטים)
2. אותות מסחר: לכל נכס רלוונטי (מניות, קריפטו, זהב, נפט, שקל) — כיוון (חיובי/שלילי/ניטרלי) + עוצמה + סיבה
3. 3-5 אירועים שהכי משפיעים על השוק היום
4. הסנטימנט הכללי של השוק (שורי/דובי/מעורב/ניטרלי)
5. רמת ביטחון בניתוח (0-100)
6. 2-3 סיכונים עיקריים

ענה אך ורק ב-JSON:
{
  "summary": "...",
  "signals": [{"asset":"...","direction":"חיובי|שלילי|ניטרלי","strength":"חלש|בינוני|חזק","reason":"..."}],
  "marketMovers": ["...","..."],
  "sentiment": "שורי|דובי|מעורב|ניטרלי",
  "confidence": 0-100,
  "keyRisks": ["...","..."]
}`;
}

function parseFinancialResponse(text: string): Partial<FinancialAnalysis> {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      summary: text.slice(0, 300),
      signals: [],
      marketMovers: [],
      sentiment: 'ניטרלי',
      confidence: 40,
      keyRisks: [],
    };
  }
}

export async function runFinancialAgent(items: CollectedItem[]): Promise<FinancialAnalysis> {
  const prompt = buildFinancialPrompt(items);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `אתה אנליסט פיננסי מנוסה שמסביר שוקי הון בשפה פשוטה וברורה.
אל תשתמש במונחים טכניים כמו RSI, MACD, momentum, bullish, bearish.
כתוב בעברית פשוטה כאילו אתה מסביר לחבר שאינו מכיר שוק הון.
ענה אך ורק ב-JSON תקני.`,
    messages: [{ role: 'user', content: prompt }],
  });

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  trackUsage('claude-sonnet-4-6', inputTokens, outputTokens);

  // Sonnet pricing: $3/1M input, $15/1M output
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}';
  const parsed = parseFinancialResponse(text);

  return {
    summary: parsed.summary ?? '',
    signals: parsed.signals ?? [],
    marketMovers: parsed.marketMovers ?? [],
    sentiment: parsed.sentiment ?? 'ניטרלי',
    confidence: parsed.confidence ?? 50,
    keyRisks: parsed.keyRisks ?? [],
    model: 'claude-sonnet-4-6',
    costUsd,
  };
}
