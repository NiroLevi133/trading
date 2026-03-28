import { NextRequest, NextResponse } from 'next/server';
import { fetchSingleMarket } from '@/lib/data/market';
import { runDataSummary, runTrendFollowing, runMomentum, runSentiment } from '@/lib/agents/groups';
import { groupVote } from '@/lib/voting';
import { buildConsensus } from '@/lib/consensus';
import { resetCostAccumulator, getAccumulatedCost } from '@/lib/pricing';
import { saveStockAnalysis, initDb } from '@/lib/db';
import { AssetAnalysis, GroupResult } from '@/lib/types';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  try {
    await initDb();
    resetCostAccumulator();

    const market = await fetchSingleMarket(symbol);

    const { summary, dataSummary } = await runDataSummary(market, 3);

    const trendAgents    = await runTrendFollowing(market, summary, 3);
    const momentumAgents = await runMomentum(market, summary, 3);
    const sentimentAgents = await runSentiment(market, summary, 3);

    const groups: GroupResult[] = await Promise.all([
      groupVote('trend-following', trendAgents),
      groupVote('momentum',        momentumAgents),
      groupVote('sentiment',       sentimentAgents),
    ]);

    const analysis = await buildConsensus(market, groups);
    const fullAnalysis: AssetAnalysis = { ...analysis, dataSummary };

    const cost = getAccumulatedCost();
    await saveStockAnalysis(fullAnalysis, cost.totalUsd);

    return NextResponse.json({ ...fullAnalysis, cost });
  } catch (error) {
    console.error('Stock analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: String(error) },
      { status: 500 }
    );
  }
}
