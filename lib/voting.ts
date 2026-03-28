import Anthropic from '@anthropic-ai/sdk';
import { AgentResult, GroupResult, Signal } from '@/lib/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function groupVote(
  groupName: string,
  agents: AgentResult[]
): Promise<GroupResult> {
  const agentSummary = agents
    .map((a, i) => `Agent ${i + 1}: ${a.signal} (${a.confidence}%) - ${a.reason}`)
    .join('\n');

  const prompt = `אתה רכז הצבעות לקבוצת הניתוח "${groupName}".

3 סוכנים ניתחו את אותו נכס:
${agentSummary}

תפקידך: לסנתז את 3 הדעות להחלטה אחת של הקבוצה.
כתוב את הסיכום בשפה פשוטה וקלילה שאדם שמעולם לא השקיע יבין בקלות.

חוקי שפה — חובה לציית:
❌ אסור: RSI, MACD, SMA, EMA, ממוצע נע, בולינגר, תמיכה, התנגדות, שבירה, נר יפני, bullish, bearish, overbought, oversold, momentum, volume divergence
✅ מותר: "המניה עולה בהתמדה", "יש לחץ למכור", "המחיר גבוה מהממוצע שלו", "הרבה אנשים קנו", "הנכס נראה עייף", "השוק לא בטוח לאן ללכת"

קח בחשבון גם את האותות וגם את רמות הביטחון.
ענה אך ורק עם JSON: {"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"summary":"2-3 משפטים פשוטים בעברית ללא מונחים טכניים"}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    return {
      name: groupName,
      signal: (['BUY', 'SELL', 'HOLD'].includes(json.signal) ? json.signal : 'HOLD') as Signal,
      confidence: Math.min(100, Math.max(0, Number(json.confidence) || 50)),
      summary: String(json.summary || ''),
      agents,
    };
  } catch {
    // Fallback: majority vote
    const counts = { BUY: 0, SELL: 0, HOLD: 0 };
    agents.forEach(a => counts[a.signal]++);
    const signal = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as Signal;
    const confidence = Math.round(agents.reduce((s, a) => s + a.confidence, 0) / agents.length);
    return { name: groupName, signal, confidence, summary: text.slice(0, 300), agents };
  }
}
