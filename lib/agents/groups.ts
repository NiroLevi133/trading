import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentResult, DataSummary, MarketSnapshot, Signal } from '@/lib/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const LANGUAGE_RULE = `חוקי שפה קריטיים — חובה לציית:
❌ אסור לכתוב: RSI, MACD, SMA, EMA, ממוצע נע, בולינגר, פיבונאצ'י, תמיכה, התנגדות, שבירה, נר יפני, דוג'י, momentum, bullish, bearish, overbought, oversold, volume divergence, price action
✅ במקום זאת השתמש בביטויים כמו: "המניה עולה", "המניה יורדת", "קצב השינוי מואץ", "הרבה אנשים קנו", "מעט קונים", "המחיר יציב", "יש לחץ למכור", "המחיר גבוה מהממוצע שלו", "הנכס עייף אחרי עליות", "נראה שהשוק מאמין בנכס".`;

const JSON_INSTRUCTION = `${LANGUAGE_RULE}

ענה אך ורק עם JSON תקני, ללא טקסט נוסף:
{"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"reason":"1-2 משפטים קצרים בעברית פשוטה ללא מונחים טכניים"}`;

function parseSignalResponse(text: string): AgentResult {
  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    return {
      id: crypto.randomUUID(),
      signal: (['BUY', 'SELL', 'HOLD'].includes(json.signal) ? json.signal : 'HOLD') as Signal,
      confidence: Math.min(100, Math.max(0, Number(json.confidence) || 50)),
      reason: String(json.reason || ''),
    };
  } catch {
    const signal: Signal = text.includes('BUY') ? 'BUY' : text.includes('SELL') ? 'SELL' : 'HOLD';
    return { id: crypto.randomUUID(), signal, confidence: 50, reason: text.slice(0, 200) };
  }
}

function marketData(m: MarketSnapshot): string {
  const aboveBelow20 = m.price > m.sma20 ? 'מעל' : 'מתחת';
  const aboveBelow50 = m.price > m.sma50 ? 'מעל' : 'מתחת';
  return `נכס: ${m.name} (${m.symbol})
מחיר: $${m.price.toFixed(2)} | שינוי יומי: ${m.changePercent >= 0 ? '+' : ''}${m.changePercent.toFixed(2)}%
המחיר נמצא ${aboveBelow20} הממוצע של 20 הימים האחרונים ($${m.sma20.toFixed(2)})
המחיר נמצא ${aboveBelow50} הממוצע של 50 הימים האחרונים ($${m.sma50.toFixed(2)})
RSI: ${m.rsi} | MACD: ${m.macdSignal} | נפח: ${m.volume.toLocaleString()}
10 מחירי סגירה אחרונים (מהישן לחדש): ${m.prices30d.slice(-10).map(p => p.toFixed(2)).join(', ')}`;
}

// ── Data Summary (Claude Haiku) ─────────────────────────────────────────────

export async function runDataSummary(
  m: MarketSnapshot,
  count: number = 3
): Promise<{ summary: string; dataSummary: DataSummary }> {
  const data = marketData(m);

  const configs = [
    {
      key: 'priceMovement' as const,
      system: `אתה סוכן AI שתפקידו לאסוף, לנקות ולסכם מידע גולמי על נכס פיננסי — Raw Intelligence Collector.
מטרה: לייצר תמונת מידע עובדתית, נקייה מרעש, ללא פרשנות או הסקת מסקנות.
כללים:
- חלץ עובדות בלבד (מי, מה, מתי, כמה)
- הפרד בין עובדות לבין טענות לא מבוססות
- ציין מידע חסר כ"מידע חסר" ולא כהנחה
- אל תנתח משמעות, אל תעריך השפעה, אל תסיק מסקנות`,
      user: `איסוף מידע גולמי על ${m.name} (${m.symbol}):

עובדות מחיר:
- מחיר נוכחי: $${m.price.toFixed(2)}
- שינוי יומי: ${m.changePercent >= 0 ? '+' : ''}${m.changePercent.toFixed(2)}%
- נפח מסחר: ${m.volume.toLocaleString()}

עובדות ממוצעים:
- ממוצע 20 יום: $${m.sma20.toFixed(2)} — מחיר נמצא ${m.price > m.sma20 ? 'מעליו' : 'מתחתיו'}
- ממוצע 50 יום: $${m.sma50.toFixed(2)} — מחיר נמצא ${m.price > m.sma50 ? 'מעליו' : 'מתחתיו'}

10 מחירי סגירה אחרונים: ${m.prices30d.slice(-10).map(p => p.toFixed(2)).join(', ')}

הצג את העובדות בלבד, 3-4 נקודות, בעברית. אל תנתח ואל תסיק מסקנות.`,
    },
    {
      key: 'indicators' as const,
      system: `אתה סוכן AI שתפקידו לנתח את הסנטימנט של מידע קיים בלבד — Neutral Sentiment Analyzer.
מטרה: להבין את הטון והרגש של השוק כפי שהוא משתקף בנתונים, ללא פרשנות כלכלית.
כללים:
- זהה פער בין עובדות לניסוח (לדוגמה: נתונים חיוביים עם אינדיקטורים שליליים)
- מדוד עוצמת הרגש: חלש / בינוני / חזק
- זהה נוכחות פחד או חמדנות בנתונים
- אל תשתמש בנתונים חדשים, אל תיתן המלצות`,
      user: `ניתוח סנטימנט של ${m.name} (${m.symbol}) לפי הנתונים הבאים:

מדדי עייפות ודחף:
- RSI: ${m.rsi} ${m.rsi > 70 ? '(גבוה — אזור קנייה יתר)' : m.rsi < 30 ? '(נמוך — אזור מכירה יתר)' : '(טווח נורמלי)'}
- MACD: ${m.macdSignal} ${m.macdSignal === 'bullish' ? '(כוח קנייה גובר)' : m.macdSignal === 'bearish' ? '(כוח מכירה גובר)' : '(ניטרלי)'}

תנועת מחיר: ${m.changePercent >= 0 ? '+' : ''}${m.changePercent.toFixed(2)}% היום
מיקום ביחס לממוצעים: ${m.price > m.sma20 && m.price > m.sma50 ? 'מעל שני הממוצעים' : m.price < m.sma20 && m.price < m.sma50 ? 'מתחת לשני הממוצעים' : 'בין הממוצעים'}

נתח את הסנטימנט הגלום בנתונים: טון (חיובי/שלילי/ניטרלי), עוצמה (חלשה/בינונית/חזקה), ורגש דומיננטי. 3-4 נקודות בעברית.`,
    },
    {
      key: 'volumeSpeed' as const,
      system: `אתה סוכן AI שתפקידו לזהות מידע משמעותי בלבד מתוך נתונים קיימים — Signal Extractor.
מטרה: לחלץ אותות חזקים שיכולים להיות רלוונטיים לניתוח, מבלי להביע דעה או המלצה.
כללים:
- סנן מידע רגיל, השאר רק חריגים ויוצאי דופן
- חפש שינויים, קפיצות, חריגות
- דרג חשיבות לפי נדירות ועוצמה
- אל תסכם מידע כללי, אל תנתח סנטימנט, אל תיתן המלצות`,
      user: `זיהוי אותות חשובים ב-${m.name} (${m.symbol}):

נתוני חריגות לבדיקה:
- שינוי יומי: ${m.changePercent >= 0 ? '+' : ''}${m.changePercent.toFixed(2)}% — האם חריג?
- נפח: ${m.volume.toLocaleString()} — האם חריג ביחס לרגיל?
- RSI: ${m.rsi} — האם קרוב לגבול (30/70)?
- MACD: ${m.macdSignal} — האם יש שינוי כיוון?
- פער ממוצע 20 יום: ${((m.price - m.sma20) / m.sma20 * 100).toFixed(1)}%
- פער ממוצע 50 יום: ${((m.price - m.sma50) / m.sma50 * 100).toFixed(1)}%
- 10 מחירים אחרונים: ${m.prices30d.slice(-10).map(p => p.toFixed(2)).join(', ')}

חלץ רק אותות חריגים ויוצאי דופן — מה בנתונים שלא שגרתי. 3-4 נקודות בעברית.`,
    },
  ];

  const sliced = configs.slice(0, Math.min(count, 3));
  const results = await Promise.all(sliced.map(async ({ system, user }) => {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  }));

  const dataSummary: DataSummary = {
    priceMovement: results[0] ?? '',
    indicators:    results[1] ?? '',
    volumeSpeed:   results[2] ?? '',
  };

  const lines = sliced.map((c, i) => {
    const label = c.key === 'priceMovement' ? '📈 תנועת מחיר'
                : c.key === 'indicators'    ? '📊 אינדיקטורים'
                :                             '📦 נפח ומהירות';
    return `${label}: ${results[i]}`;
  });

  const summary = `=== סיכום נייטרלי של הנתונים ===\n${lines.join('\n')}\n=================================`;

  return { summary, dataSummary };
}

// ── Trend Following (Gemini Flash) ──────────────────────────────────────────

export async function runTrendFollowing(m: MarketSnapshot, summary: string, count: number = 5): Promise<AgentResult[]> {
  const data = marketData(m);
  const context = `${summary}\n\n${data}`;
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompts = [
    `אתה מומחה לזיהוי כיוון מחיר בטווח קצר.
השווה את 5 המחירים האחרונים לעומת 5 המחירים לפניהם — האם המחיר עולה, יורד, או תקוע במקום?
הסבר את המסקנה שלך כאילו אתה מסביר לחבר: "בימים האחרונים המניה...".

${context}

${JSON_INSTRUCTION}`,

    `אתה מומחה לניתוח מיקום מחיר ביחס לממוצעים ארוכי טווח.
בדוק: האם המחיר הנוכחי גבוה מהממוצע של 20 יום ומ-50 יום? מה המשמעות של זה — האם המניה "חמה" ועולה לאורך זמן, או "קרה" ויורדת?
הסבר בשפה פשוטה כאילו אתה מסביר לחבר שלא מכיר שוק הון.

${context}

${JSON_INSTRUCTION}`,

    `אתה מומחה לניתוח עוצמת מגמה.
בדוק את 10 המחירים האחרונים: האם העלייה/ירידה מואצת (כל יום הפערים גדולים יותר) או מתמתנת (הפערים מצטמצמים)? מה זה אומר על כוח המגמה?
הסבר כאילו אתה מסביר לחבר: "המגמה...".

${context}

${JSON_INSTRUCTION}`,

    `אתה מומחה לזיהוי עקביות תנועת מחיר.
בדוק את 10 המחירים האחרונים: האם העלייה/ירידה קורית ברצף עקבי (כל יום בכיוון אחד), או שיש הפסקות ותנודות לכיוון ההפוך?
תנועה עקבית = המגמה אמינה. תנועה מקוטעת = המגמה חלשה ופחות בטוחה.
הסבר כאילו אתה מסביר לחבר אם הכיוון "בטוח" או "לא בטוח" להסתמך עליו.

${context}

${JSON_INSTRUCTION}`,

    `אתה מומחה לזיהוי שינויי כיוון בשוק לפני שהם קורים.
בדוק את 10 המחירים האחרונים: האם השיאים האחרונים גבוהים מהשיאים הקודמים (עלייה בריאה), או שהשיאים מתחילים לרדת (אות שהעלייה נחלשת)?
לחלופין — האם השפלים האחרונים נמוכים יותר (ירידה מואצת), או שהשפלים מתחילים לעלות (סימן שהירידה מתמתנת)?
הסבר כאילו אתה מסביר לחבר: "הכיוון של השוק...".

${context}

${JSON_INSTRUCTION}`,
  ];

  return Promise.all(prompts.slice(0, Math.min(count, prompts.length)).map(async (prompt) => {
    const result = await model.generateContent(prompt);
    return parseSignalResponse(result.response.text());
  }));
}

// ── Momentum (GPT-4o-mini) ──────────────────────────────────────────────────

export async function runMomentum(m: MarketSnapshot, summary: string, count: number = 5): Promise<AgentResult[]> {
  const data = marketData(m);
  const context = `${summary}\n\n${data}`;

  const configs = [
    {
      system: `אתה מומחה לניתוח עייפות ועוצמה של נכסים פיננסיים.
RSI הוא מדד שמראה אם נכס "נקנה יותר מדי" (מעל 70 — כנראה יתוקן בקרוב) או "נמכר יותר מדי" (מתחת ל-30 — כנראה יעלה בקרוב).
הסבר בשפה פשוטה כאילו אתה מסביר לחבר.`,
      user: `RSI של הנכס הוא ${m.rsi}.
האם הנכס "התחמם יותר מדי" ועלול לרדת, "נמכר יותר מדי" ועלול לעלות, או באזור נורמלי?

${context}

${JSON_INSTRUCTION}`,
    },
    {
      system: `אתה מומחה לניתוח כיוון הדחף של נכסים פיננסיים.
MACD הוא מדד שמראה אם כוח הקנייה גובר על כוח המכירה או להפך — כמו "מי מנצח במשיכת החבל".
הסבר בשפה פשוטה כאילו אתה מסביר לחבר.`,
      user: `אות ה-MACD של הנכס הוא: ${m.macdSignal}.
האם כוח הקנייה גובר, כוח המכירה גובר, או שאין כרגע כיוון ברור?

${context}

${JSON_INSTRUCTION}`,
    },
    {
      system: `אתה מומחה לניתוח קצב שינוי מחיר.
בדוק את 10 המחירים האחרונים: האם המחיר עולה בהתמדה, יורד בהתמדה, קופץ בחוסר יציבות, או תקוע בטווח צר?
הסבר בשפה פשוטה כאילו אתה מסביר לחבר מה "הוייב" של הנכס לאחרונה.`,
      user: `${context}

${JSON_INSTRUCTION}`,
    },
    {
      system: `אתה מומחה לזיהוי פריצות — רגעים בהם נכס יוצא מדשדוש ומתחיל תנועה חדשה וחזקה.
פריצה מזוהה כשהמחיר זז בחדות אחרי תקופה של יציבות, במיוחד כשנפח המסחר עולה ביחד עם המחיר.
חשוב: פריצה ללא נפח גבוה — פחות אמינה. פריצה עם נפח גבוה — סימן שהיא אמיתית.
הסבר כאילו אתה מסביר לחבר אם "משהו מתחיל לזוז" ואם זה נראה רציני.`,
      user: `בדוק האם יש סימנים לפריצה מדשדוש — מחיר שיצא מטווח צר בפתאומיות.
השווה את השינוי היומי הנוכחי לתנועות הקודמות וקחי בחשבון גם את הנפח.

${context}

${JSON_INSTRUCTION}`,
    },
    {
      system: `אתה מומחה לזיהוי דעיכה — רגעים בהם תנועה חזקה מאבדת כוח לפני שהיא מתהפכת.
דעיכה מזוהה כשהמחיר עדיין נע בכיוון, אבל הצעדים נהיים קטנים יותר יום אחרי יום — כמו מכונית שנגמר לה הדלק לאט לאט.
סימנים נוספים: הנפח יורד בזמן שהמחיר עולה, או שהמחיר מתקשה לשמור על הרמה.
הסבר כאילו אתה מסביר לחבר אם "הגז נגמר" ואם הריצה הנוכחית עייפה.`,
      user: `בדוק האם יש סימנים לדעיכה — תנועה שמאטה ומאבדת עוצמה לאחר ריצה.
שים לב לגודל הצעדים בין מחיר למחיר: האם הם מצטמצמים?

${context}

${JSON_INSTRUCTION}`,
    },
  ];

  return Promise.all(configs.slice(0, Math.min(count, configs.length)).map(async ({ system, user }) => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });
    return parseSignalResponse(response.choices[0].message.content ?? '');
  }));
}

// ── Sentiment (Claude Haiku) ────────────────────────────────────────────────

export async function runSentiment(m: MarketSnapshot, summary: string, count: number = 5): Promise<AgentResult[]> {
  const data = marketData(m);
  const context = `${summary}\n\n${data}`;

  const configs = [
    {
      system: `אתה מומחה לקריאת "שפת גוף" של מחירים.
בדוק את תנועות המחיר האחרונות: האם יש דפוס של עלייה מתמדת, ירידה מתמדת, תנודות גדולות (סימן לחוסר ודאות), או יציבות?
הסבר את מה שאתה רואה כאילו אתה מסביר לחבר.`,
      user: `${context}

${JSON_INSTRUCTION}`,
    },
    {
      system: `אתה מומחה לניתוח נפח מסחר — כמה אנשים קנו ומכרו היום.
נפח גבוה ביחס לרגיל = הרבה אנשים מעורבים = המהלך רציני.
נפח נמוך = מעט אנשים מעורבים = המהלך עשוי להיות "רעש" זמני.
הסבר את המשמעות בשפה פשוטה כאילו אתה מסביר לחבר.`,
      user: `נפח המסחר היום: ${m.volume.toLocaleString()}.
האם הנפח מחזק את כיוון המחיר, או סותר אותו?

${context}

${JSON_INSTRUCTION}`,
    },
    {
      system: `אתה מומחה לתמונה הכוללת — מסכם את כל הסימנים יחד.
קח את כל הנתונים ותן תמונה כוללת אחת: מה "האווירה" סביב הנכס הזה עכשיו? האם יש ביטחון, פחד, שאננות?
הסבר כאילו אתה מסביר לחבר מה "הוייב" בשוק לגבי הנכס הזה.`,
      user: `${context}

סכם את כל הסימנים לתמונה אחת: מה מרגיש השוק לגבי הנכס הזה כרגע?

${JSON_INSTRUCTION}`,
    },
    {
      system: `אתה מומחה לזיהוי רגשות שוק — האם המשקיעים מונעים מפחד או מחמדנות.
פחד: תנודות גדולות, ירידות חדות, אנשים מוכרים מהר מבלי לחכות.
חמדנות: עליות מהירות, כולם רוצים להיכנס, הנכס "חם" מדי ויתכן שיתוקן.
מאוזן: תנועה הדרגתית וסבירה, ללא קיצוניות בשני הכיוונים.
הסבר כאילו אתה מסביר לחבר מה "הרגש" שמניע את השוק עכשיו ומה המשמעות שלו.`,
      user: `${context}

מה הרגש הדומיננטי שמניע את המסחר בנכס הזה — פחד, חמדנות, או איזון?
שים לב לגודל השינוי היומי, לנפח, ולמהירות התנועה האחרונה.

${JSON_INSTRUCTION}`,
    },
    {
      system: `אתה מומחה לזיהוי חוסר ודאות בשוק — רגעים שבהם הכיוון לא ברור ואין הסכמה בין הקונים למוכרים.
סימני חוסר ודאות: אותות שסותרים אחד את השני (מחיר עולה אבל נפח יורד), תנודות גדולות בלי כיוון ברור, שינויי כיוון תכופים.
כשהשוק לא בטוח — עדיף לחכות. כשהשוק ברור — אפשר לפעול.
הסבר כאילו אתה מסביר לחבר אם "השוק יודע לאן הוא הולך" או שהוא מבולבל.`,
      user: `${context}

האם יש אותות סותרים שמעידים על חוסר ודאות בשוק? השווה בין כיוון המחיר לנפח ולתנודתיות.

${JSON_INSTRUCTION}`,
    },
  ];

  return Promise.all(configs.slice(0, Math.min(count, configs.length)).map(async ({ system, user }) => {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 150,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    return parseSignalResponse(text);
  }));
}
