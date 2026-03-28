import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 });
    }

    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const prompt = `אתה עוזר חכם שעונה על שאלות בנושא כלכלה, שוק ההון, ומצב גיאו-פוליטי — בעברית פשוטה שכל אדם יבין.

חוקי שפה חובה:
- עברית פשוטה בלבד, ללא ז'רגון טכני
- אם אתה לא יודע מהזיכרון — חפש בגוגל ותשתמש בתוצאות
- תשובה ממוקדת ב-3-5 משפטים
- אם השאלה על אירועים עדכניים — ציין את התאריך שהמידע רלוונטי אליו

השאלה: ${question.trim()}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (model as any).generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
    });

    const answer = result.response.text() as string;
    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Ask error:', error);
    return NextResponse.json({ error: 'שגיאה בעיבוד השאלה' }, { status: 500 });
  }
}
