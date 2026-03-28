// ─────────────────────────────────────────────────────────────────────────────
// Intelligence API — מזין את ה-dashboard החי
// מחזיר: runs אחרונים, ניתוחים, correlations, stats, זיכרונות
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getRecentRuns, getLatestAnalyses } from '@/lib/dataCollection/db';
import { getCorrelationStats, getRecentCorrelations } from '@/lib/dataCollection/correlationEngine';
import { getRecentMemories } from '@/lib/dataCollection/memoryAgent';
import { TOTAL_SOURCES } from '@/lib/dataCollection/sources';

export const maxDuration = 15;

export async function GET() {
  try {
    const [runs, analyses, correlationStats, recentCorrelations, memories] =
      await Promise.allSettled([
        getRecentRuns(30),
        getLatestAnalyses(),
        getCorrelationStats(),
        getRecentCorrelations(15),
        getRecentMemories(10),
      ]);

    return NextResponse.json({
      runs:               runs.status               === 'fulfilled' ? runs.value               : [],
      analyses:           analyses.status           === 'fulfilled' ? analyses.value           : [],
      correlationStats:   correlationStats.status   === 'fulfilled' ? correlationStats.value   : [],
      recentCorrelations: recentCorrelations.status === 'fulfilled' ? recentCorrelations.value : [],
      memories:           memories.status           === 'fulfilled' ? memories.value           : [],
      sourcesRegistered:  TOTAL_SOURCES,
      fetchedAt:          new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
