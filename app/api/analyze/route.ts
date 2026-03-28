import { NextRequest, NextResponse } from 'next/server';
import { fetchAllMarkets } from '@/lib/data/market';
import { runDataSummary, runTrendFollowing, runMomentum, runSentiment } from '@/lib/agents/groups';
import { groupVote } from '@/lib/voting';
import { buildConsensus } from '@/lib/consensus';
import { saveAnalysis } from '@/lib/store';  // now async
import { AgentCounts, AssetAnalysis, FullAnalysis, GroupResult, MarketSnapshot } from '@/lib/types';

export const maxDuration = 60;

async function analyzeAsset(market: MarketSnapshot, counts: AgentCounts): Promise<AssetAnalysis> {
  const { summaryCount, trendCount, momentumCount, sentimentCount } = counts;

  // First: run data summary agents to produce neutral context for all groups
  const { summary, dataSummary } = await runDataSummary(market, summaryCount);

  // Then: run all 3 groups sequentially to avoid rate limits, passing the summary
  const trendAgents     = await runTrendFollowing(market, summary, trendCount);
  const momentumAgents  = await runMomentum(market, summary, momentumCount);
  const sentimentAgents = await runSentiment(market, summary, sentimentCount);

  const groups: GroupResult[] = await Promise.all([
    groupVote('trend-following', trendAgents),
    groupVote('momentum',        momentumAgents),
    groupVote('sentiment',       sentimentAgents),
  ]);

  const analysis = await buildConsensus(market, groups);
  return { ...analysis, dataSummary };
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const counts: AgentCounts = {
    summaryCount:  Math.min(3, Math.max(1, parseInt(p.get('summaryCount')  ?? '3'))),
    trendCount:    Math.min(5, Math.max(1, parseInt(p.get('trendCount')    ?? '5'))),
    momentumCount: Math.min(5, Math.max(1, parseInt(p.get('momentumCount') ?? '5'))),
    sentimentCount:Math.min(5, Math.max(1, parseInt(p.get('sentimentCount')?? '5'))),
  };

  try {
    // Fetch all market data in parallel
    const markets = await fetchAllMarkets();

    // Analyze assets sequentially to avoid Claude concurrent rate limits
    const aapl   = await analyzeAsset(markets.aapl,   counts);
    const sp500  = await analyzeAsset(markets.sp500,  counts);
    const nasdaq = await analyzeAsset(markets.nasdaq, counts);
    const btc    = await analyzeAsset(markets.btc,    counts);

    const analysis: FullAnalysis = {
      aapl,
      sp500,
      nasdaq,
      btc,
      analyzedAt: new Date().toISOString(),
    };

    await saveAnalysis(analysis);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: String(error) },
      { status: 500 }
    );
  }
}
