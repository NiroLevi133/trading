// ─────────────────────────────────────────────────────────────────────────────
// Data Collection DB — schema + CRUD for collection tables
// ─────────────────────────────────────────────────────────────────────────────

import { Pool } from 'pg';
import { CollectedItem } from './rssCollector';
import { TriggerType } from './routerAgent';

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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CollectionRun {
  id: number;
  trigger: TriggerType;
  reason: string;
  started_at: string;
  completed_at: string | null;
  sources_attempted: number;
  sources_succeeded: number;
  items_collected: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}

export interface AnalysisResult {
  id: number;
  collection_run_id: number;
  agent_type: 'financial' | 'sentiment' | 'macro';
  model: string;
  summary: string;
  signals: unknown;        // JSON: array of trading signals
  risk_level: string | null;
  confidence: number | null;
  key_insights: unknown;   // JSON: array of key points
  cost_usd: number;
  analyzed_at: string;
}

// ── Schema initialization ─────────────────────────────────────────────────────

export async function initDataCollectionDb(): Promise<void> {
  const client = await getPool().connect();
  try {
    // Collection runs — one record per collection cycle
    await client.query(`
      CREATE TABLE IF NOT EXISTS collection_runs (
        id                SERIAL      PRIMARY KEY,
        trigger           TEXT        NOT NULL DEFAULT 'REGULAR',
        reason            TEXT        NOT NULL DEFAULT '',
        started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at      TIMESTAMPTZ,
        sources_attempted INTEGER     NOT NULL DEFAULT 0,
        sources_succeeded INTEGER     NOT NULL DEFAULT 0,
        items_collected   INTEGER     NOT NULL DEFAULT 0,
        status            TEXT        NOT NULL DEFAULT 'running',
        error             TEXT
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS collection_runs_started_idx
        ON collection_runs (started_at DESC)
    `);

    // Collected data — individual items from sources
    await client.query(`
      CREATE TABLE IF NOT EXISTS collected_data (
        id                SERIAL      PRIMARY KEY,
        collection_run_id INTEGER     REFERENCES collection_runs(id) ON DELETE CASCADE,
        source_id         TEXT        NOT NULL,
        source_name       TEXT        NOT NULL,
        category          TEXT        NOT NULL,
        title             TEXT        NOT NULL,
        content           TEXT        NOT NULL DEFAULT '',
        url               TEXT        NOT NULL DEFAULT '',
        published_at      TIMESTAMPTZ,
        language          TEXT        NOT NULL DEFAULT 'en',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS collected_data_run_idx
        ON collected_data (collection_run_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS collected_data_category_idx
        ON collected_data (category, created_at DESC)
    `);

    // Analysis results — output from the 3 analyst agents
    await client.query(`
      CREATE TABLE IF NOT EXISTS data_analyses (
        id                SERIAL        PRIMARY KEY,
        collection_run_id INTEGER       REFERENCES collection_runs(id) ON DELETE CASCADE,
        agent_type        TEXT          NOT NULL,
        model             TEXT          NOT NULL,
        summary           TEXT          NOT NULL,
        signals           JSONB,
        risk_level        TEXT,
        confidence        INTEGER,
        key_insights      JSONB,
        cost_usd          NUMERIC(10,6) NOT NULL DEFAULT 0,
        analyzed_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS data_analyses_run_idx
        ON data_analyses (collection_run_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS data_analyses_type_idx
        ON data_analyses (agent_type, analyzed_at DESC)
    `);

    // Source registry — all defined sources with last-fetch tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS data_source_registry (
        id             SERIAL      PRIMARY KEY,
        source_id      TEXT        NOT NULL UNIQUE,
        name           TEXT        NOT NULL,
        category       TEXT        NOT NULL,
        source_type    TEXT        NOT NULL,
        language       TEXT        NOT NULL DEFAULT 'en',
        priority       INTEGER     NOT NULL DEFAULT 2,
        is_active      BOOLEAN     NOT NULL DEFAULT true,
        last_fetched_at TIMESTAMPTZ,
        fail_count     INTEGER     NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }
}

// ── Collection Runs ───────────────────────────────────────────────────────────

export async function startCollectionRun(trigger: TriggerType, reason: string): Promise<number> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `INSERT INTO collection_runs (trigger, reason, status)
       VALUES ($1, $2, 'running')
       RETURNING id`,
      [trigger, reason]
    );
    return result.rows[0].id as number;
  } finally {
    client.release();
  }
}

export async function completeCollectionRun(
  runId: number,
  stats: { sourcesAttempted: number; sourcesSucceeded: number; itemsCollected: number },
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `UPDATE collection_runs
       SET completed_at = NOW(),
           status = 'completed',
           sources_attempted = $2,
           sources_succeeded = $3,
           items_collected = $4
       WHERE id = $1`,
      [runId, stats.sourcesAttempted, stats.sourcesSucceeded, stats.itemsCollected]
    );
  } finally {
    client.release();
  }
}

export async function failCollectionRun(runId: number, error: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `UPDATE collection_runs
       SET completed_at = NOW(), status = 'failed', error = $2
       WHERE id = $1`,
      [runId, error.slice(0, 500)]
    );
  } finally {
    client.release();
  }
}

// ── Collected Data ────────────────────────────────────────────────────────────

export async function saveCollectedItems(runId: number, items: CollectedItem[]): Promise<void> {
  if (items.length === 0) return;
  const client = await getPool().connect();
  try {
    // Bulk insert using unnest
    const values = items.map((item, i) => {
      const base = i * 8;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });

    const params: (string | number | null)[] = [];
    for (const item of items) {
      params.push(
        runId,
        item.sourceId,
        item.sourceName,
        item.category,
        item.title.slice(0, 500),
        item.content.slice(0, 1000),
        item.url.slice(0, 500),
        item.publishedAt,
      );
    }

    await client.query(
      `INSERT INTO collected_data
         (collection_run_id, source_id, source_name, category, title, content, url, published_at)
       VALUES ${values.join(', ')}`,
      params
    );
  } finally {
    client.release();
  }
}

// ── Analysis Results ──────────────────────────────────────────────────────────

export interface SaveAnalysisInput {
  runId: number;
  agentType: 'financial' | 'sentiment' | 'macro';
  model: string;
  summary: string;
  signals?: unknown;
  riskLevel?: string;
  confidence?: number;
  keyInsights?: unknown;
  costUsd?: number;
}

export async function saveAnalysisResult(input: SaveAnalysisInput): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO data_analyses
         (collection_run_id, agent_type, model, summary, signals, risk_level, confidence, key_insights, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.runId,
        input.agentType,
        input.model,
        input.summary,
        JSON.stringify(input.signals ?? []),
        input.riskLevel ?? null,
        input.confidence ?? null,
        JSON.stringify(input.keyInsights ?? []),
        input.costUsd ?? 0,
      ]
    );
  } finally {
    client.release();
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getLatestCollectionRun(): Promise<CollectionRun | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT * FROM collection_runs ORDER BY started_at DESC LIMIT 1`
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

export async function getAnalysesForRun(runId: number): Promise<AnalysisResult[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT * FROM data_analyses WHERE collection_run_id = $1 ORDER BY analyzed_at ASC`,
      [runId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getLatestAnalyses(): Promise<AnalysisResult[]> {
  const client = await getPool().connect();
  try {
    // Latest analysis of each type
    const result = await client.query(`
      SELECT DISTINCT ON (agent_type) *
      FROM data_analyses
      ORDER BY agent_type, analyzed_at DESC
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getRecentRuns(limit = 20): Promise<CollectionRun[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT * FROM collection_runs ORDER BY started_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getItemsForRun(runId: number, category?: string): Promise<CollectedItem[]> {
  const client = await getPool().connect();
  try {
    let query = `SELECT * FROM collected_data WHERE collection_run_id = $1`;
    const params: (number | string)[] = [runId];
    if (category) {
      query += ` AND category = $2`;
      params.push(category);
    }
    query += ` ORDER BY created_at ASC`;
    const result = await client.query(query, params);
    return result.rows.map((r: Record<string, string>) => ({
      sourceId: r.source_id,
      sourceName: r.source_name,
      category: r.category,
      title: r.title,
      content: r.content,
      url: r.url,
      publishedAt: r.published_at,
      language: r.language ?? 'en',
    }));
  } finally {
    client.release();
  }
}

// Update source registry with fetch results
export async function updateSourceRegistry(
  sourceId: string,
  success: boolean,
): Promise<void> {
  const client = await getPool().connect();
  try {
    if (success) {
      await client.query(
        `INSERT INTO data_source_registry (source_id, name, category, source_type, language, last_fetched_at, fail_count)
         VALUES ($1, $1, 'unknown', 'rss', 'en', NOW(), 0)
         ON CONFLICT (source_id) DO UPDATE
         SET last_fetched_at = NOW(), fail_count = 0`,
        [sourceId]
      );
    } else {
      await client.query(
        `INSERT INTO data_source_registry (source_id, name, category, source_type, language, fail_count)
         VALUES ($1, $1, 'unknown', 'rss', 'en', 1)
         ON CONFLICT (source_id) DO UPDATE
         SET fail_count = data_source_registry.fail_count + 1`,
        [sourceId]
      );
    }
  } finally {
    client.release();
  }
}
