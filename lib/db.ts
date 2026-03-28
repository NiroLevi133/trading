import { Pool } from 'pg';
import { AssetAnalysis, FullAnalysis } from '@/lib/types';

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
        id          SERIAL      PRIMARY KEY,
        data        JSONB       NOT NULL,
        analyzed_at TIMESTAMPTZ NOT NULL,
        cost_usd    NUMERIC(10,6) DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS analyses_analyzed_at_idx ON analyses (analyzed_at DESC)
    `);
    // Add cost_usd column if it doesn't exist (for existing tables)
    await client.query(`
      ALTER TABLE analyses ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,6) DEFAULT 0
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_analyses (
        id          SERIAL        PRIMARY KEY,
        symbol      TEXT          NOT NULL,
        data        JSONB         NOT NULL,
        analyzed_at TIMESTAMPTZ   NOT NULL,
        cost_usd    NUMERIC(10,6) DEFAULT 0,
        created_at  TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS stock_analyses_symbol_idx ON stock_analyses (symbol, analyzed_at DESC)
    `);
  } finally {
    client.release();
  }
}

export async function saveAnalysisToDB(analysis: FullAnalysis): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      'INSERT INTO analyses (data, analyzed_at, cost_usd) VALUES ($1, $2, $3)',
      [JSON.stringify(analysis), analysis.analyzedAt, analysis.cost?.totalUsd ?? 0]
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

export async function saveStockAnalysis(analysis: AssetAnalysis, costUsd: number): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      'INSERT INTO stock_analyses (symbol, data, analyzed_at, cost_usd) VALUES ($1, $2, $3, $4)',
      [analysis.symbol, JSON.stringify(analysis), analysis.analyzedAt, costUsd]
    );
  } finally {
    client.release();
  }
}

export async function getAllStockAnalyses(): Promise<AssetAnalysis[]> {
  const client = await getPool().connect();
  try {
    // Latest analysis per symbol
    const result = await client.query(`
      SELECT DISTINCT ON (symbol) data
      FROM stock_analyses
      ORDER BY symbol, analyzed_at DESC
    `);
    return result.rows.map(r => r.data as AssetAnalysis);
  } finally {
    client.release();
  }
}

export async function getTotalCostFromDB(): Promise<{ totalUsd: number; count: number }> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT COALESCE(SUM(cost_usd), 0) AS total, COUNT(*) AS count FROM analyses'
    );
    return {
      totalUsd: parseFloat(result.rows[0].total),
      count: parseInt(result.rows[0].count),
    };
  } finally {
    client.release();
  }
}
