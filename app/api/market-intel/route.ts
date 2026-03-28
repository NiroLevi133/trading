import { NextResponse } from 'next/server';
import { runMarketIntelAgents, MarketIntelResult } from '@/lib/agents/webSearch';

export const maxDuration = 60;

// In-memory cache — 30 min TTL
let cache: { data: MarketIntelResult; expiresAt: number } | null = null;

export async function GET() {
  // Serve from cache if still valid
  if (cache && Date.now() < cache.expiresAt) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  try {
    const data = await runMarketIntelAgents();
    cache = { data, expiresAt: Date.now() + 30 * 60 * 1000 };
    return NextResponse.json(data);
  } catch (error) {
    console.error('Market intel error:', error);
    // Return stale cache if available
    if (cache) {
      return NextResponse.json({ ...cache.data, cached: true, stale: true });
    }
    return NextResponse.json({ error: 'Failed to fetch market intelligence' }, { status: 500 });
  }
}
