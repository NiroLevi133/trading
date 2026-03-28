import { NextRequest, NextResponse } from 'next/server';

// Vercel Cron - runs every 30 minutes
// Active hours: 10:00-23:00 Israel time (UTC+3 summer / UTC+2 winter)
// Cron schedule: */30 7-20 * * 1-5  (UTC, weekdays only)

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if within active hours (Israel time, UTC+3)
  const now = new Date();
  const israelHour = (now.getUTCHours() + 3) % 24;
  if (israelHour < 10 || israelHour >= 23) {
    return NextResponse.json({ skipped: true, reason: 'Outside active hours' });
  }

  // Trigger analysis
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get('host')}`;
  const res = await fetch(`${baseUrl}/api/analyze`, { method: 'GET' });

  if (!res.ok) {
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, triggeredAt: now.toISOString() });
}
