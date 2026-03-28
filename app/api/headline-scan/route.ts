import { NextRequest, NextResponse } from 'next/server';
import { runTriageAgent } from '@/lib/dataCollection/triageAgent';

export const maxDuration = 30;

// ── GET — מופעל על ידי Vercel Cron כל 2 דקות ─────────────────────────────────
//
// הזרימה:
//   1. שלוף כותרות RSS (ללא AI — חינמי)
//   2. שלח ל-GPT-4o-mini לדירוג (~$0.0005)
//   3. אם urgencyScore >= threshold → הפעל ניתוח מלא
//   4. החזר תוצאה (כולל אם הופעל ניתוח)

export async function GET(req: NextRequest) {
  // אימות Vercel Cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // פעיל רק בשעות מסחר (ישראל UTC+3): 07:00-24:00
  const israelHour = (new Date().getUTCHours() + 3) % 24;
  if (israelHour < 7) {
    return NextResponse.json({ skipped: true, reason: 'Outside active hours' });
  }

  // שלב 1+2: triage
  const triage = await runTriageAgent();

  const response = {
    scannedAt: new Date().toISOString(),
    newHeadlines: triage.newHeadlinesCount,
    urgencyScore: triage.urgencyScore,
    threshold: triage.threshold,
    trigger: triage.trigger,
    reason: triage.reason,
    keyHeadlines: triage.keyHeadlines,
    triageCostUsd: triage.costUsd,
    analysisTriggered: false,
    analysisCostUsd: 0,
  };

  // שלב 3: אם חשוב מספיק — הפעל ניתוח מלא
  if (triage.shouldAnalyze) {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get('host')}`;

    const analysisRes = await fetch(`${baseUrl}/api/data-collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: triage.trigger,
        hint: triage.reason,
        signals: triage.keyHeadlines,
      }),
    });

    if (analysisRes.ok) {
      const analysisData = await analysisRes.json();
      response.analysisTriggered = true;
      response.analysisCostUsd   = analysisData.totalCostUsd ?? 0;
    }
  }

  return NextResponse.json(response);
}
