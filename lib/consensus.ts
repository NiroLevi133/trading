import Anthropic from '@anthropic-ai/sdk';
import { AssetAnalysis, GroupResult, MarketSnapshot, PriceTarget, Signal } from '@/lib/types';
import { trackUsage } from '@/lib/pricing';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function buildConsensus(
  market: MarketSnapshot,
  groups: GroupResult[]
): Promise<AssetAnalysis> {
  const groupSummary = groups
    .map(g => `${g.name}: ${g.signal} (${g.confidence}%) - ${g.summary}`)
    .join('\n');

  const prompt = `אתה סוכן קונצנזוס סופי במערכת ניתוח מסחר רב-סוכנית.

נכס: ${market.name} (${market.symbol}) במחיר $${market.price.toFixed(2)} (${market.changePercent >= 0 ? '+' : ''}${market.changePercent.toFixed(2)}%)

תוצאות ניתוח הקבוצות:
${groupSummary}

המשימה שלך:
1. סנתז את כל הדעות להמלצה סופית.
2. כתוב הסבר פשוט בעברית (2-3 משפטים) שאדם שמעולם לא השקיע יבין — ללא מונחים טכניים כמו RSI, MACD, SMA. השתמש בשפה יומיומית כמו "המניה עולה בעקביות", "המשקיעים אופטימיים", "יש לחץ מכירה".
3. הערך טווח מחיר ריאלי לתקופה של 2-4 שבועות: מחיר נמוך סביר ומחיר גבוה סביר, על בסיס התנועה האחרונה.

זהו ניתוח בלבד - לא ייעוץ פיננסי.

ענה אך ורק עם JSON:
{
  "signal": "BUY"|"SELL"|"HOLD",
  "confidence": 0-100,
  "recommendation": "הסבר פשוט בעברית ל-2-3 משפטים ללא ז'רגון",
  "priceTargetLow": מספר (מחיר נמוך סביר),
  "priceTargetHigh": מספר (מחיר גבוה סביר)
}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  trackUsage('claude-sonnet-4-6', message.usage.input_tokens, message.usage.output_tokens);
  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  const fallbackTarget = (price: number): PriceTarget => ({
    low: parseFloat((price * 0.95).toFixed(2)),
    high: parseFloat((price * 1.05).toFixed(2)),
  });

  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    const low  = Number(json.priceTargetLow);
    const high = Number(json.priceTargetHigh);
    const priceTarget: PriceTarget =
      low > 0 && high > low
        ? { low: parseFloat(low.toFixed(2)), high: parseFloat(high.toFixed(2)) }
        : fallbackTarget(market.price);

    return {
      symbol: market.symbol,
      name: market.name,
      signal: (['BUY', 'SELL', 'HOLD'].includes(json.signal) ? json.signal : 'HOLD') as Signal,
      confidence: Math.min(100, Math.max(0, Number(json.confidence) || 50)),
      recommendation: String(json.recommendation || ''),
      priceTarget,
      groups,
      marketData: market,
      analyzedAt: new Date().toISOString(),
    };
  } catch {
    // Fallback: weighted vote by confidence
    const weights = { BUY: 0, SELL: 0, HOLD: 0 };
    groups.forEach(g => { weights[g.signal] += g.confidence; });
    const signal = (Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0]) as Signal;
    const confidence = Math.round(groups.reduce((s, g) => s + g.confidence, 0) / groups.length);
    return {
      symbol: market.symbol,
      name: market.name,
      signal,
      confidence,
      recommendation: text.slice(0, 400),
      priceTarget: fallbackTarget(market.price),
      groups,
      marketData: market,
      analyzedAt: new Date().toISOString(),
    };
  }
}
