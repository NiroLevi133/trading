import { GoogleGenerativeAI } from '@google/generative-ai';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface MarketIntelResult {
  israeli: string;
  american: string;
  crossMarket: string;
  fetchedAt: string;
}

const SIMPLE_LANGUAGE_RULE = `
חוקי שפה — חובה לציית:
- כתוב בעברית פשוטה שכל אדם יבין, גם מי שלא מכיר שוק הון
- אל תשתמש במונחים טכניים כמו: RSI, MACD, EMA, תמיכה, התנגדות, momentum, bullish, bearish
- במקום זאת: "המניות עלו", "המשקיעים חששו", "הרבה אנשים מכרו", "השוק עלה בחדות"
- משפטים קצרים וברורים
- אם חייב להזכיר מדד — הסבר אותו בסוגריים: "S&P 500 (מדד 500 החברות הגדולות בארה״ב)"
`;

async function searchAgent(prompt: string): Promise<string> {
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (model as any).generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
  });

  return result.response.text() as string;
}

export async function runMarketIntelAgents(): Promise<MarketIntelResult> {
  const today = new Date().toLocaleDateString('he-IL');

  const [israeli, american, crossMarket] = await Promise.all([

    // Agent 1 — Israeli Market
    searchAgent(`אתה כתב כלכלי שמסביר את השוק הישראלי בשפה פשוטה לקורא הממוצע.
${SIMPLE_LANGUAGE_RULE}

חפש את החדשות הכלכליות העדכניות ביותר להיום ${today} על השוק הישראלי:
- מה קרה היום בבורסה בתל אביב? (ת"א 35, ת"א 125)
- אילו מניות ישראליות בלטו — עלו או ירדו בחדות?
- מה האווירה הכללית — האם המשקיעים אופטימיים או חוששים?
- אירועים כלכליים בישראל שהשפיעו על השוק (ריבית, אינפלציה, חדשות חברות)

כתוב 4-5 נקודות בעברית פשוטה וברורה, כאילו אתה מסביר לחבר.`),

    // Agent 2 — American Market
    searchAgent(`אתה כתב כלכלי שמסביר את השוק האמריקאי בשפה פשוטה לקורא הממוצע.
${SIMPLE_LANGUAGE_RULE}

חפש את החדשות הכלכליות העדכניות ביותר להיום ${today} על השוק האמריקאי:
- מה קרה היום עם S&P 500 (מדד 500 החברות הגדולות), נאסד"ק (מדד הטכנולוגיה), ודאו ג'ונס?
- אילו חברות גדולות בלטו — עלו או ירדו? למה?
- מה האווירה בוול סטריט — פחד, אופטימיות, או אי-ודאות?
- אירועים שהשפיעו: נתוני מקרו-כלכלה, החלטות ריבית, ידיעות על חברות ענק

כתוב 4-5 נקודות בעברית פשוטה וברורה, כאילו אתה מסביר לחבר.`),

    // Agent 3 — Cross-Market Signals
    searchAgent(`אתה אנליסט שמחפש דברים יוצאי דופן ומעניינים בשווקים — ומסביר אותם בפשטות.
${SIMPLE_LANGUAGE_RULE}

חפש אירועים חריגים ומפתיעים מהיום ${today} שקשורים לשוק הישראלי והאמריקאי יחד:
- האם יש קשר בין מה שקרה בישראל למה שקרה בארה"ב היום?
- מה היה הכי מפתיע היום בשוקי ההון?
- האם משהו חריג קרה — זינוק, קריסה, עסקה גדולה, אירוע לא צפוי?
- מה כדאי לעקוב אחריו בימים הקרובים?

כתוב 3-4 נקודות מעניינות בעברית פשוטה, כאילו אתה מספר לחבר משהו מפתיע.`),
  ]);

  return { israeli, american, crossMarket, fetchedAt: new Date().toISOString() };
}
