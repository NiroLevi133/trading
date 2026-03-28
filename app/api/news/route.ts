import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const maxDuration = 30;

export async function GET() {
  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (model as any).generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: `חפש את החדשות העדכניות ביותר על המצב הצבאי-גיאופוליטי בין ישראל, ארצות הברית ואיראן.
ענה בדיוק בפורמט JSON הזה, ללא טקסט נוסף:
{
  "status": "משפט אחד קצר על הסטטוס הנוכחי",
  "events": ["אירוע 1", "אירוע 2", "אירוע 3"],
  "marketImpact": "משפט אחד על ההשפעה על השווקים",
  "riskLevel": "HIGH",
  "updatedAt": "תאריך עדכון אחרון"
}` }],
      }],
      tools: [{ googleSearch: {} }],
    });

    const text = result.response.text();
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());

    return NextResponse.json({ ...json, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('News fetch error:', error);
    // Return fallback data if Gemini grounding fails
    return NextResponse.json({
      status: 'מצב מלחמה בין ישראל–ארה"ב ואיראן — יום 28 למבצע',
      events: [
        'ארה"ב וישראל תקפו מתקנים גרעיניים באיראן כולל נתנז',
        'איראן סגרה את מצר הורמוז — 20% מאספקת הנפט העולמית',
        'טראמפ הקפיא תקיפות ל-10 ימים (עד 6 באפריל) לצורך משא ומתן',
        'נפט ברנט זינק ל-~120$ לחבית; S&P 500 ירד ~6% מהשיא',
      ],
      marketImpact: 'סיכון גבוה — אי-ודאות גיאופוליטית לוחצת על השווקים',
      riskLevel: 'HIGH',
      updatedAt: new Date().toLocaleDateString('he-IL'),
      fetchedAt: new Date().toISOString(),
      isFallback: true,
    });
  }
}
