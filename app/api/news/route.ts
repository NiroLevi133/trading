import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const maxDuration = 30;

// Cache קצר — 10 דקות (לא 30, כי זה חדשות מלחמה)
let cache: { data: object; expiresAt: number } | null = null;

export async function GET() {
  // הגש מ-cache אם תקף
  if (cache && Date.now() < cache.expiresAt) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  const today = new Date().toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  });
  const todayISO = new Date().toISOString().split('T')[0];

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (model as any).generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: `חפש חדשות עדכניות מהיום ${today} (${todayISO}) על:
1. המצב הצבאי בין ישראל, ארה"ב ואיראן
2. עזה / חמאס / הסכמי שחרור
3. כל אירוע ביטחוני משמעותי מהיום

חשוב: אני רוצה רק ידיעות מהיום ${today} — לא מאתמול ולא מהשבוע שעבר.

ענה בדיוק בפורמט JSON הזה, ללא טקסט נוסף:
{
  "status": "משפט אחד על הסטטוס הנוכחי כפי שהוא היום",
  "events": ["ידיעה מהיום 1", "ידיעה מהיום 2", "ידיעה מהיום 3", "ידיעה מהיום 4"],
  "sources": ["מקור 1", "מקור 2"],
  "marketImpact": "משפט אחד על ההשפעה על השווקים היום",
  "riskLevel": "HIGH" | "MEDIUM" | "LOW",
  "dataDate": "${todayISO}"
}` }],
      }],
      tools: [{ googleSearch: {} }],
    });

    const text = result.response.text();
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());

    const data = { ...json, fetchedAt: new Date().toISOString(), isFallback: false };
    cache = { data, expiresAt: Date.now() + 10 * 60 * 1000 }; // 10 דקות
    return NextResponse.json(data);

  } catch (error) {
    console.error('News fetch error:', error);

    // אם יש cache ישן — עדיף לתת אותו עם סימן stale מאשר נתונים בדויים
    if (cache) {
      return NextResponse.json({ ...cache.data, cached: true, stale: true });
    }

    // אין cache בכלל — החזר שגיאה ברורה, לא נתונים ישנים בדויים
    return NextResponse.json({
      status: 'לא ניתן לטעון חדשות כרגע — נסה שוב בעוד דקה',
      events: [],
      sources: [],
      marketImpact: '',
      riskLevel: 'MEDIUM',
      dataDate: todayISO,
      fetchedAt: new Date().toISOString(),
      isFallback: true,
      error: String(error),
    }, { status: 503 });
  }
}
