// ─────────────────────────────────────────────────────────────────────────────
// Triage Agent — GPT-4o-mini
//
// קורא 20-40 כותרות RSS חדשות ומחליט:
//   urgencyScore 0-100  → האם השוק עומד להזוז?
//   shouldAnalyze       → האם להפעיל ניתוח מלא?
//   trigger             → איזה סוג ניתוח (WAR_NEWS / TRUMP_STATEMENT / ...)
//   keyHeadlines        → הכותרות שגרמו להחלטה
//
// עלות: ~$0.0005 לסריקה = $0.36 ליום אם רץ כל 2 דקות
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import { TriggerType } from './routerAgent';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// סף ברירת מחדל — אפשר לשנות דרך env
const DEFAULT_THRESHOLD = parseInt(process.env.TRIAGE_THRESHOLD ?? '65', 10);

export interface TriageResult {
  urgencyScore: number;         // 0-100
  shouldAnalyze: boolean;       // true אם urgencyScore >= threshold
  trigger: TriggerType;         // איזה סוג ניתוח להפעיל
  reason: string;               // הסבר קצר בעברית
  keyHeadlines: string[];       // הכותרות שהכריעו
  newHeadlinesCount: number;    // כמה כותרות חדשות נסרקו
  threshold: number;            // הסף שנגד (לשקיפות)
  costUsd: number;
}

// ── RSS quick fetch — כותרות בלבד, ללא תוכן ──────────────────────────────────

const FAST_RSS_SOURCES = [
  // ישראל
  'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=3',
  'https://www.timesofisrael.com/feed/',
  'https://www.calcalist.co.il/rss/',
  // בינלאומי
  'https://feeds.reuters.com/reuters/businessNews',
  'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  'https://feeds.bbci.co.uk/news/business/rss.xml',
  // גיאופוליטיקה
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://breakingdefense.com/feed/',
  // קריפטו
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://cointelegraph.com/rss',
];

function extractTitles(xml: string, max = 8): string[] {
  const titles: string[] = [];
  const re = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && titles.length < max) {
    const t = m[1].trim();
    // דלג על כותרות של הערוץ עצמו (בד"כ הראשונה)
    if (t && t.length > 10 && !t.startsWith('<?')) titles.push(t);
  }
  return titles;
}

export async function fetchFreshHeadlines(): Promise<string[]> {
  const results = await Promise.allSettled(
    FAST_RSS_SOURCES.map(async (url) => {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)' },
      });
      const xml = await res.text();
      return extractTitles(xml, 6);
    })
  );

  const all: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  return all;
}

// ── Seen-headlines deduplication (in-memory, resets on redeploy) ─────────────
// מונע שאותה כותרת תפעיל ניתוח פעמיים

const seenHeadlines = new Set<string>();
const MAX_SEEN = 500;

function filterNew(headlines: string[]): string[] {
  const fresh: string[] = [];
  for (const h of headlines) {
    const key = h.slice(0, 80).toLowerCase();
    if (!seenHeadlines.has(key)) fresh.push(h);
  }
  return fresh;
}

function markAsSeen(headlines: string[]) {
  for (const h of headlines) {
    seenHeadlines.add(h.slice(0, 80).toLowerCase());
  }
  // ניקוי אם גדל מדי
  if (seenHeadlines.size > MAX_SEEN) {
    const arr = [...seenHeadlines];
    seenHeadlines.clear();
    arr.slice(-300).forEach(x => seenHeadlines.add(x));
  }
}

// ── Triage prompt ─────────────────────────────────────────────────────────────

function buildTriagePrompt(headlines: string[]): string {
  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const list = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');

  return `אתה סוכן מיון (triage) של חדשות פיננסיות.
שעה נוכחית: ${now}

קיבלת ${headlines.length} כותרות חדשות:
${list}

שאלה: האם יש כאן משהו שעשוי להזיז שוקי הון בצורה משמעותית בשעות הקרובות?

קריטריונים לציון גבוה (70+):
- הצהרת טראמפ על כלכלה / מכסים / סנקציות
- הפסקת אש / פרוץ מלחמה / מתקפה צבאית
- החלטת ריבית של Fed / ECB / בנק ישראל
- נפילה/עלייה חדה של ביטקוין (5%+)
- נפילת בנק / חברה גדולה / פשיטת רגל
- נתוני מקרו מפתיעים (CPI, תעסוקה)
- אסון טבע / פיגוע גדול שמשפיע על שווקים

קריטריונים לציון נמוך (מתחת ל-40):
- כתבות כלליות ללא עוקץ
- ספורט / בידור / חדשות שגרתיות
- כותרות ניתוח/דעה ללא עובדות חדשות

בחר trigger מתאים:
- TRUMP_STATEMENT — הצהרה/פוסט של טראמפ שמשפיע על שוק
- WAR_NEWS — חדשות ביטחוניות/מלחמה/הפסקת אש
- MACRO_RELEASE — נתוני מקרו / ריבית / בנק מרכזי
- CRYPTO_MOVE — תנועה חדה בקריפטו
- MARKET_OPEN — פתיחת שוק חשובה
- MARKET_IL_OPEN — פתיחת בורסת ישראל
- REGULAR — שגרה, אין דחיפות

ענה אך ורק ב-JSON:
{
  "urgencyScore": 0-100,
  "trigger": "TRIGGER_TYPE",
  "reason": "הסבר קצר בעברית (1 משפט)",
  "keyHeadlines": ["כותרת1", "כותרת2"]
}`;
}

// ── Main triage entry point ───────────────────────────────────────────────────

export async function runTriageAgent(
  headlines?: string[],
  threshold = DEFAULT_THRESHOLD,
): Promise<TriageResult> {
  // אם לא קיבלנו כותרות — שלוף בעצמנו
  const allHeadlines = headlines ?? await fetchFreshHeadlines();
  const newHeadlines = filterNew(allHeadlines);

  // אם אין כותרות חדשות בכלל — החזר תוצאה ריקה בלי לבזבז טוקנים
  if (newHeadlines.length === 0) {
    return {
      urgencyScore: 0,
      shouldAnalyze: false,
      trigger: 'REGULAR',
      reason: 'אין כותרות חדשות מאז הסריקה האחרונה',
      keyHeadlines: [],
      newHeadlinesCount: 0,
      threshold,
      costUsd: 0,
    };
  }

  const prompt = buildTriagePrompt(newHeadlines);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'אתה סוכן מיון פיננסי. ענה אך ורק ב-JSON תקני ללא טקסט נוסף.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0,        // דטרמיניסטי ככל האפשר
    max_tokens: 200,       // תשובה קצרה מאוד
  });

  const inputTokens  = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  // GPT-4o-mini: $0.15/1M input, $0.60/1M output
  const costUsd = (inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000;

  // Parse response
  let urgencyScore = 0;
  let trigger: TriggerType = 'REGULAR';
  let reason = '';
  let keyHeadlines: string[] = [];

  try {
    const text = response.choices[0].message.content ?? '{}';
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    urgencyScore = Math.max(0, Math.min(100, Number(json.urgencyScore) || 0));
    trigger      = (json.trigger as TriggerType) ?? 'REGULAR';
    reason       = String(json.reason ?? '');
    keyHeadlines = Array.isArray(json.keyHeadlines) ? json.keyHeadlines.slice(0, 5) : [];
  } catch {
    reason = 'שגיאת פענוח תשובה';
  }

  const shouldAnalyze = urgencyScore >= threshold;

  // סמן כותרות כנראו — גם אם לא מפעילים ניתוח
  markAsSeen(newHeadlines);

  return {
    urgencyScore,
    shouldAnalyze,
    trigger,
    reason,
    keyHeadlines,
    newHeadlinesCount: newHeadlines.length,
    threshold,
    costUsd,
  };
}
