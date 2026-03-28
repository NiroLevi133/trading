import { NextRequest, NextResponse } from 'next/server';
import { runDataCollectionPipeline, getCollectionStatus } from '@/lib/dataCollection/orchestrator';
import { getLatestAnalyses, getRecentRuns } from '@/lib/dataCollection/db';
import { TOTAL_SOURCES } from '@/lib/dataCollection/sources';
import { TriggerType } from '@/lib/dataCollection/routerAgent';

export const maxDuration = 120; // Data collection can take up to 2 min

// ── GET — status + latest results ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action') ?? 'status';

  try {
    if (action === 'status') {
      const [latestRun, analyses, recentRuns] = await Promise.all([
        getCollectionStatus(),
        getLatestAnalyses(),
        getRecentRuns(10),
      ]);

      return NextResponse.json({
        latestRun,
        analyses,
        recentRuns,
        sourcesRegistered: TOTAL_SOURCES,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[data-collection GET]', error);
    return NextResponse.json(
      { error: 'Status fetch failed', details: String(error) },
      { status: 500 }
    );
  }
}

// ── POST — trigger a collection run ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const context = {
      explicitTrigger: body.trigger as TriggerType | undefined,
      recentSignals: body.signals as string[] | undefined,
      eventHint: body.hint as string | undefined,
    };

    const result = await runDataCollectionPipeline(context);

    return NextResponse.json({
      success: true,
      runId: result.runId,
      trigger: result.trigger,
      reason: result.reason,
      itemsCollected: result.itemsCollected,
      sourcesSucceeded: result.sourcesSucceeded,
      totalCostUsd: result.totalCostUsd,
      durationMs: result.durationMs,
      analyses: {
        financial: result.analyses.financial
          ? {
              summary: result.analyses.financial.summary,
              sentiment: result.analyses.financial.sentiment,
              confidence: result.analyses.financial.confidence,
              signalsCount: result.analyses.financial.signals.length,
              marketMovers: result.analyses.financial.marketMovers,
              keyRisks: result.analyses.financial.keyRisks,
            }
          : null,
        sentiment: result.analyses.sentiment
          ? {
              summary: result.analyses.sentiment.summary,
              sentimentScore: result.analyses.sentiment.sentimentScore,
              fearGreedLevel: result.analyses.sentiment.fearGreedLevel,
              dominantNarrative: result.analyses.sentiment.dominantNarrative,
              keyTopics: result.analyses.sentiment.keyTopics,
            }
          : null,
        macro: result.analyses.macro
          ? {
              summary: result.analyses.macro.summary,
              globalRiskScore: result.analyses.macro.globalRiskScore,
              riskLevel: result.analyses.macro.riskLevel,
              geopoliticalEventsCount: result.analyses.macro.geopoliticalEvents.length,
              macroTrends: result.analyses.macro.macroTrends,
              commodityOutlook: result.analyses.macro.commodityOutlook,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('[data-collection POST]', error);
    return NextResponse.json(
      { error: 'Collection failed', details: String(error) },
      { status: 500 }
    );
  }
}
