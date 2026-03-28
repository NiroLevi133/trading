import { GoogleGenerativeAI } from '@google/generative-ai';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface MarketIntelResult {
  rawIntelligence: string;
  sentiment: string;
  signals: string;
  fetchedAt: string;
}

async function searchAgent(systemPrompt: string, userQuery: string): Promise<string> {
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (model as any).generateContent({
    contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userQuery}` }] }],
    tools: [{ googleSearch: {} }],
  });

  return result.response.text() as string;
}

export async function runMarketIntelAgents(): Promise<MarketIntelResult> {
  const today = new Date().toLocaleDateString('he-IL');

  const [rawIntelligence, sentiment, signals] = await Promise.all([

    // Agent 1 — Raw Intelligence Collector
    searchAgent(
      `אתה סוכן AI שתפקידו לאסוף ולסכם מידע גולמי על שוקי ההון — Raw Intelligence Collector.
מטרה: לייצר תמונת מידע עובדתית בלבד, ללא פרשנות.
כללים: חלץ עובדות בלבד (מי, מה, מתי, כמה), הפרד עובדות מטענות, אל תנתח ואל תסיק מסקנות.`,
      `חפש וסכם עובדות עדכניות להיום ${today} על:
1. השוק האמריקאי: S&P 500, NASDAQ, Dow Jones — מה קרה היום? אירועים, נתונים, הכרזות.
2. השוק הישראלי: ת"א 35, ת"א 125, מניות ישראליות — מה קרה היום?
3. אירועים כלכליים גלובליים משמעותיים שהשפיעו על השווקים.

הצג עובדות בלבד, 4-6 נקודות, בעברית. אל תנתח.`
    ),

    // Agent 2 — Neutral Sentiment Analyzer
    searchAgent(
      `אתה סוכן AI שתפקידו לנתח סנטימנט שוק מחדשות ומקורות עדכניים — Neutral Sentiment Analyzer.
מטרה: להבין את הטון והרגש של השוק כפי שהוא משתקף בכלי התקשורת, ללא פרשנות כלכלית.
כללים: זהה טון (חיובי/שלילי/ניטרלי), עוצמה (חלשה/בינונית/חזקה), אל תיתן המלצות.`,
      `חפש כתבות, דוחות וניתוחים עדכניים מהיום ${today} על:
1. הסנטימנט בשוק האמריקאי — האם המשקיעים פסימיים, אופטימיים, או לא בטוחים?
2. הסנטימנט בשוק הישראלי — מה האווירה בבורסה בת"א?
3. האם יש פחד, חמדנות, או שוויון נפש בשוקי ההון כרגע?

נתח את הסנטימנט: טון, עוצמה, רגש דומיננטי. 4-5 נקודות בעברית.`
    ),

    // Agent 3 — Signal Extractor
    searchAgent(
      `אתה סוכן AI שתפקידו לזהות אותות חשובים ויוצאי דופן בשווקים — Signal Extractor.
מטרה: לחלץ רק מה שחריג ולא שגרתי. לסנן רעש.
כללים: התמקד בחריגות, שינויים חדים, פעילות לא רגילה. אל תסכם מידע כללי.`,
      `חפש אותות חריגים ויוצאי דופן מהיום ${today} ב:
1. השוק האמריקאי: תנועות חריגות, מניות שזינקו/קרסו, נפח מסחר חריג, פעילות שחקנים גדולים.
2. השוק הישראלי: חריגות בת"א 35, עסקאות חריגות, פעילות מוסדית יוצאת דופן.
3. אירועים לא צפויים שהפתיעו את השוק.

חלץ רק מה שחריג ומשמעותי. 4-5 נקודות בעברית.`
    ),
  ]);

  return {
    rawIntelligence,
    sentiment,
    signals,
    fetchedAt: new Date().toISOString(),
  };
}
