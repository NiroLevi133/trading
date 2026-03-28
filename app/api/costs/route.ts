import { NextResponse } from 'next/server';
import { getTotalCostFromDB } from '@/lib/db';

export async function GET() {
  try {
    const { totalUsd, count } = await getTotalCostFromDB();
    return NextResponse.json({ totalUsd, count });
  } catch (error) {
    console.error('Cost fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch costs' }, { status: 500 });
  }
}
