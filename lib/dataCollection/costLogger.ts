// ─────────────────────────────────────────────────────────────────────────────
// Unified Cost Logger — כל קריאה ל-AI נרשמת כאן
//
// סוכנים שמשתמשים בזה:
//   router      — Claude Haiku
//   triage      — GPT-4o-mini
//   webSearch   — Gemini Flash Lite
//   financial   — Claude Sonnet
//   sentiment   — GPT-4o-mini
//   macro       — Gemini Flash Lite
//   (+ הסוכנים הישנים דרך pricing.ts)
// ─────────────────────────────────────────────────────────────────────────────

import { Pool } from 'pg';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.URL_DB, ssl: { rejectUnauthorized: false }, max: 3 });
  return pool;
}

export type AgentType =
  | 'router'
  | 'triage'
  | 'web_search'
  | 'financial'
  | 'sentiment'
  | 'macro'
  | 'market_analysis'   // הסוכנים הישנים (trend/momentum/sentiment/summary)
  | 'consensus';        // buildConsensus

// ── Schema ────────────────────────────────────────────────────────────────────

export async function initCostLogDb(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_cost_log (
        id           SERIAL        PRIMARY KEY,
        agent_type   TEXT          NOT NULL,
        model        TEXT          NOT NULL,
        input_tokens  INTEGER       NOT NULL DEFAULT 0,
        output_tokens INTEGER       NOT NULL DEFAULT 0,
        cost_usd     NUMERIC(10,7) NOT NULL DEFAULT 0,
        run_id       INTEGER,
        created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS agent_cost_log_type_idx
        ON agent_cost_log (agent_type, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS agent_cost_log_date_idx
        ON agent_cost_log (created_at DESC)
    `);
  } finally {
    client.release();
  }
}

// ── Log a single AI call ──────────────────────────────────────────────────────

export async function logAgentCost(
  agentType: AgentType,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  runId?: number,
): Promise<void> {
  try {
    const client = await getPool().connect();
    try {
      await client.query(
        `INSERT INTO agent_cost_log (agent_type, model, input_tokens, output_tokens, cost_usd, run_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [agentType, model, inputTokens, outputTokens, costUsd, runId ?? null]
      );
    } finally {
      client.release();
    }
  } catch {
    // לא לפוצץ את הסוכן בגלל שגיאת לוג
  }
}

// ── Totals ────────────────────────────────────────────────────────────────────

export interface CostSummary {
  totalUsd: number;
  byAgent: { agentType: string; model: string; totalUsd: number; callCount: number }[];
  byDay: { date: string; totalUsd: number }[];
  todayUsd: number;
  thisMonthUsd: number;
}

export async function getFullCostSummary(): Promise<CostSummary> {
  const client = await getPool().connect();
  try {
    const [totals, byAgent, byDay, today, month] = await Promise.all([
      // סה"כ כולל — כל המקורות
      client.query(`
        SELECT
          COALESCE(
            (SELECT SUM(cost_usd) FROM agent_cost_log), 0
          ) +
          COALESCE(
            (SELECT SUM(cost_usd) FROM analyses), 0
          ) +
          COALESCE(
            (SELECT SUM(cost_usd) FROM data_analyses), 0
          ) AS grand_total
      `),

      // פירוט לפי סוכן
      client.query(`
        SELECT agent_type, model,
               SUM(cost_usd)::float  AS total_usd,
               COUNT(*)::int         AS call_count
        FROM agent_cost_log
        GROUP BY agent_type, model
        ORDER BY total_usd DESC
      `),

      // פירוט לפי יום (7 ימים אחרונים)
      client.query(`
        SELECT DATE(created_at AT TIME ZONE 'Asia/Jerusalem')::text AS date,
               SUM(cost_usd)::float AS total_usd
        FROM agent_cost_log
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY 1
        ORDER BY 1 DESC
      `),

      // היום
      client.query(`
        SELECT COALESCE(SUM(cost_usd), 0)::float AS total
        FROM agent_cost_log
        WHERE created_at > CURRENT_DATE AT TIME ZONE 'Asia/Jerusalem'
      `),

      // החודש
      client.query(`
        SELECT COALESCE(SUM(cost_usd), 0)::float AS total
        FROM agent_cost_log
        WHERE created_at > DATE_TRUNC('month', NOW())
      `),
    ]);

    return {
      totalUsd:    parseFloat(totals.rows[0].grand_total),
      byAgent: byAgent.rows.map((r: Record<string, unknown>) => ({
        agentType: String(r.agent_type),
        model:     String(r.model),
        totalUsd:  parseFloat(String(r.total_usd)),
        callCount: Number(r.call_count),
      })),
      byDay: byDay.rows.map((r: Record<string, unknown>) => ({
        date:     String(r.date),
        totalUsd: parseFloat(String(r.total_usd)),
      })),
      todayUsd:      parseFloat(today.rows[0].total),
      thisMonthUsd:  parseFloat(month.rows[0].total),
    };
  } finally {
    client.release();
  }
}
