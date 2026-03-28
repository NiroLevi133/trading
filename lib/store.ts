import { FullAnalysis } from '@/lib/types';
import { initDb, saveAnalysisToDB, getLatestAnalysisFromDB } from '@/lib/db';

// In-memory cache for the current server instance
let cache: FullAnalysis | null = null;
let dbReady = false;

async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initDb();
    dbReady = true;
  }
}

export function getLatestAnalysis(): FullAnalysis | null {
  return cache;
}

// Loads latest from DB into cache — call when cache is empty (e.g. after server restart)
export async function loadLatestFromDB(): Promise<FullAnalysis | null> {
  try {
    await ensureDb();
    const analysis = await getLatestAnalysisFromDB();
    if (analysis) cache = analysis;
    return analysis;
  } catch (err) {
    console.error('DB load error:', err);
    return null;
  }
}

export async function saveAnalysis(analysis: FullAnalysis): Promise<void> {
  cache = analysis;
  try {
    await ensureDb();
    await saveAnalysisToDB(analysis);
  } catch (err) {
    console.error('DB save error:', err);
    // Cache is already updated — don't throw
  }
}
