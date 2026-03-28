import { NextResponse } from 'next/server';
import { getLatestAnalysis, loadLatestFromDB } from '@/lib/store';

export async function GET() {
  // Try in-memory cache first (fastest)
  let analysis = getLatestAnalysis();

  // If cache is empty (e.g. after server restart), load from DB
  if (!analysis) {
    analysis = await loadLatestFromDB();
  }

  if (!analysis) {
    return NextResponse.json({ empty: true }, { status: 404 });
  }

  return NextResponse.json(analysis);
}
