import { NextResponse } from 'next/server';
import { getTotalCostFromDB } from '@/lib/db';
import { getFullCostSummary, initCostLogDb } from '@/lib/dataCollection/costLogger';

export async function GET() {
  try {
    await initCostLogDb();

    const [legacy, full] = await Promise.all([
      getTotalCostFromDB(),   // עלות ניתוחי שוק ישנים
      getFullCostSummary(),   // עלות כל המערכת החדשה
    ]);

    const AGENT_LABELS: Record<string, string> = {
      router:          '🔀 Router (ניתוב)',
      triage:          '⚡ Triage (סריקה מהירה)',
      web_search:      '🌐 Web Search',
      financial:       '📊 ניתוח פיננסי',
      sentiment:       '🧠 ניתוח סנטימנט',
      macro:           '🌍 ניתוח מאקרו',
      market_analysis: '📈 ניתוח שוק (ישן)',
      consensus:       '🤝 קונסנסוס',
    };

    return NextResponse.json({
      // סה"כ המערכת כולה
      totalUsd: full.totalUsd,
      todayUsd: full.todayUsd,
      thisMonthUsd: full.thisMonthUsd,

      // פירוט לפי סוכן
      byAgent: full.byAgent.map(a => ({
        label:     AGENT_LABELS[a.agentType] ?? a.agentType,
        agentType: a.agentType,
        model:     a.model,
        totalUsd:  a.totalUsd,
        callCount: a.callCount,
        avgUsd:    a.callCount > 0
          ? parseFloat((a.totalUsd / a.callCount).toFixed(6))
          : 0,
      })),

      // עלות לפי יום (7 ימים)
      byDay: full.byDay,

      // עלות ניתוחי שוק קלאסיים (backwards compat)
      marketAnalysis: {
        totalUsd: legacy.totalUsd,
        count:    legacy.count,
      },
    });
  } catch (error) {
    console.error('Cost fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch costs' }, { status: 500 });
  }
}
