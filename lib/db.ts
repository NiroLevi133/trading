import { Pool } from 'pg';
import { FullAnalysis } from '@/lib/types';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.URL_DB,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS analyses (
        id        SERIAL      PRIMARY KEY,
        data      JSONB       NOT NULL,
        analyzed_at TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS analyses_analyzed_at_idx ON analyses (analyzed_at DESC)
    `);
  } finally {
    client.release();
  }
}

export async function saveAnalysisToDB(analysis: FullAnalysis): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      'INSERT INTO analyses (data, analyzed_at) VALUES ($1, $2)',
      [JSON.stringify(analysis), analysis.analyzedAt]
    );
  } finally {
    client.release();
  }
}

export async function getLatestAnalysisFromDB(): Promise<FullAnalysis | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT data FROM analyses ORDER BY analyzed_at DESC LIMIT 1'
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].data as FullAnalysis;
  } finally {
    client.release();
  }
}
