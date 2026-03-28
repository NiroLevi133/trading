// ─────────────────────────────────────────────────────────────────────────────
// Sentiment Agent — GPT-4o-mini
// Analyzes news headlines + social media for market sentiment
// Outputs: sentiment score, dominant narrative, fear/greed level, key topics
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import { CollectedItem } from '../rssCollector';
import { trackUsage } from '@/lib/pricing';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SENTIMENT_CATEGORIES = ['news_il', 'news_intl', 'social', 'geopolitical'];

export interface SentimentAnalysis {
  summary: string;
  sentimentScore: number;       // -100 (extreme fear) to +100 (extreme greed)
  fearGreedLevel: 'פאניקה' | 'פחד' | 'ניטרלי' | 'אופטימיות' | 'חמדנות קיצונית';
  dominantNarrative: string;    // The main story driving the market mood
  israelSentiment: string;      // Specific Israeli market sentiment
  usSentiment: string;          // Specific US market sentiment
  keyTopics: string[];          // Top 5 trending topics
  unusualSignals: string[];     // Any anomalies or outliers detected
  model: string;
  costUsd: number;
}

function buildSentimentPrompt(items: CollectedItem[]): string {
  const today = new Date().toLocaleDateString('he-IL');

  const relevant = items
    .filter(i => SENTIMENT_CATEGORIES.includes(i.category))
    .slice(0, 50);

  // Separate Israeli vs international
  const israelItems = relevant.filter(i => i.category === 'news_il' || i.language === 'he');
  const intlItems = relevant.filter(i => i.category !== 'news_il' && i.language !== 'he');
  const socialItems = relevant.filter(i => i.category === 'social');

  const format = (arr: CollectedItem[]) =>
    arr.map(i => `• ${i.sourceName}: ${i.title}`).join('\n');

  return `נתח את הסנטימנט של שוק ההון בהתבסס על כותרות ומידע מהיום ${today}.

🇮🇱 חדשות ישראל (${israelItems.length} פריטים):
${format(israelItems) || 'אין מידע'}

🌍 חדשות בינלאומיות (${intlItems.length} פריטים):
${format(intlItems) || 'אין מידע'}

📱 רשתות חברתיות (${socialItems.length} פריטים):
${format(socialItems) || 'אין מידע'}

תנתח:
1. ציון סנטימנט כללי: -100 (פאניקה) עד +100 (חמדנות קיצונית)
2. רמת פחד/חמדנות
3. הנרטיב הדומיננטי — הסיפור הגדול שמניע את האווירה בשוק
4. סנטימנט ספציפי לישראל (1-2 משפטים)
5. סנטימנט ספציפי לארה"ב (1-2 משפטים)
6. 5 נושאים מרכזיים שהשוק מדבר עליהם היום
7. אותות חריגים — דברים יוצאי דופן שקורים

ענה ב-JSON בלבד:
{
  "summary": "3-4 משפטים על האווירה הכללית",
  "sentimentScore": -100 עד 100,
  "fearGreedLevel": "פאניקה|פחד|ניטרלי|אופטימיות|חמדנות קיצונית",
  "dominantNarrative": "הסיפור הגדול של היום",
  "israelSentiment": "...",
  "usSentiment": "...",
  "keyTopics": ["...","...","...","...","..."],
  "unusualSignals": ["...","..."]
}`;
}

function parseSentimentResponse(text: string): Partial<SentimentAnalysis> {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      summary: text.slice(0, 300),
      sentimentScore: 0,
      fearGreedLevel: 'ניטרלי',
      dominantNarrative: '',
      israelSentiment: '',
      usSentiment: '',
      keyTopics: [],
      unusualSignals: [],
    };
  }
}

export async function runSentimentAgent(items: CollectedItem[]): Promise<SentimentAnalysis> {
  const prompt = buildSentimentPrompt(items);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `אתה מומחה לניתוח סנטימנט שוק ההון.
כתוב בעברית פשוטה וברורה, ללא מונחים טכניים.
ענה אך ורק ב-JSON תקני.`,
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 1000,
  });

  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  if (response.usage) trackUsage('gpt-4o-mini', inputTokens, outputTokens);

  // GPT-4o-mini pricing: $0.15/1M input, $0.60/1M output
  const costUsd = (inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000;

  const text = response.choices[0].message.content ?? '{}';
  const parsed = parseSentimentResponse(text);

  return {
    summary: parsed.summary ?? '',
    sentimentScore: Math.max(-100, Math.min(100, parsed.sentimentScore ?? 0)),
    fearGreedLevel: parsed.fearGreedLevel ?? 'ניטרלי',
    dominantNarrative: parsed.dominantNarrative ?? '',
    israelSentiment: parsed.israelSentiment ?? '',
    usSentiment: parsed.usSentiment ?? '',
    keyTopics: parsed.keyTopics ?? [],
    unusualSignals: parsed.unusualSignals ?? [],
    model: 'gpt-4o-mini',
    costUsd,
  };
}
