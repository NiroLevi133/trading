import { NextResponse } from 'next/server';
import { getAllStockAnalyses, initDb } from '@/lib/db';

export async function GET() {
  try {
    await initDb();
    const stocks = await getAllStockAnalyses();
    return NextResponse.json(stocks);
  } catch (error) {
    console.error('Stocks fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch stocks' }, { status: 500 });
  }
}
