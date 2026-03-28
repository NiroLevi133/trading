// ─────────────────────────────────────────────────────────────────────────────
// Memory Agent — זיכרון היסטורי
//
// שומר אירועים עם תוצאות שוק ומחזיר הקשר רלוונטי לאנליסטים:
// "זו הפעם השלישית השבוע שטראמפ מאיים במכסים —
//  בשתי הפעמים הקודמות נאסד"ק ירד 1.5% תוך 3 שעות"
// ─────────────────────────────────────────────────────────────────────────────

import { Pool } from 'pg';
import { TriggerType } from './routerAgent';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.URL_DB, ssl: { rejectUnauthorized: false }, max: 3 });
  return pool;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarketOutcome {
  btcDelta:    number | null;   // % change after resolution
  sp500Delta:  number | null;
  nasdaqDelta: number | null;
  shekelDelta: number | null;
  resolvedAfterHours: number;
}

export interface MemoryEvent {
  id?: number;
  trigger: TriggerType;
  reason: string;
  keywords: string[];           // מילות מפתח מופקות מהכותרות
  summary: string;              // תיאור קצר של האירוע
  outcome?: MarketOutcome;      // מה קרה בשוק אחר-כך (מולא אחרי resolution)
  correlationRunId?: number;    // קישור ל-correlation engine
  createdAt?: string;
}

// ── Schema ────────────────────────────────────────────────────────────────────

export async function initMemoryDb(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS market_memories (
        id               SERIAL        PRIMARY KEY,
        trigger          TEXT          NOT NULL,
        reason           TEXT          NOT NULL,
        keywords         TEXT[]        NOT NULL DEFAULT '{}',
        summary          TEXT          NOT NULL DEFAULT '',
        outcome_json     JSONB,
        correlation_run_id INTEGER,
        created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS market_memories_trigger_idx
        ON market_memories (trigger, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS market_memories_created_idx
        ON market_memories (created_at DESC)
    `);
  } finally {
    client.release();
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveMemoryEvent(event: MemoryEvent): Promise<number> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `INSERT INTO market_memories (trigger, reason, keywords, summary, correlation_run_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [event.trigger, event.reason, event.keywords, event.summary, event.correlationRunId ?? null]
    );
    return result.rows[0].id as number;
  } finally {
    client.release();
  }
}

export async function updateMemoryOutcome(id: number, outcome: MarketOutcome): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `UPDATE market_memories SET outcome_json = $2 WHERE id = $1`,
      [id, JSON.stringify(outcome)]
    );
  } finally {
    client.release();
  }
}

// ── Query — מצא זיכרונות דומים ───────────────────────────────────────────────

export async function querySimilarMemories(
  trigger: TriggerType,
  keywords: string[],
  limit = 5,
): Promise<MemoryEvent[]> {
  const client = await getPool().connect();
  try {
    // מצא אירועים מאותו סוג + חפיפת מילות מפתח, מהשבוע האחרון
    const result = await client.query(
      `SELECT * FROM market_memories
       WHERE trigger = $1
         AND created_at > NOW() - INTERVAL '30 days'
         AND id != (SELECT COALESCE(MAX(id), 0) FROM market_memories)
       ORDER BY (
         SELECT COUNT(*) FROM unnest(keywords) k WHERE k = ANY($2::text[])
       ) DESC, created_at DESC
       LIMIT $3`,
      [trigger, keywords, limit]
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as number,
      trigger: r.trigger as TriggerType,
      reason: r.reason as string,
      keywords: (r.keywords ?? []) as string[],
      summary: r.summary as string,
      outcome: (r.outcome_json ?? undefined) as MarketOutcome | undefined,
      createdAt: r.created_at as string,
    }));
  } finally {
    client.release();
  }
}

export async function getRecentMemories(limit = 20): Promise<MemoryEvent[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT * FROM market_memories ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as number,
      trigger: r.trigger as TriggerType,
      reason: r.reason as string,
      keywords: (r.keywords ?? []) as string[],
      summary: r.summary as string,
      outcome: (r.outcome_json ?? undefined) as MarketOutcome | undefined,
      createdAt: r.created_at as string,
    }));
  } finally {
    client.release();
  }
}

// ── Extract keywords from headlines ──────────────────────────────────────────

const MARKET_KEYWORDS = [
  'trump','tariff','fed','rate','inflation','cpi','war','ceasefire','hamas',
  'iran','sanctions','bitcoin','crash','rally','recession','gdp','oil','gold',
  'israel','nasdaq','sp500','dollar','שקל','ריבית','מלחמה','הפסקת אש',
  'אינפלציה','נפט','זהב','ביטקוין','טראמפ','מכסים','ירידה','עלייה',
];

export function extractKeywords(headlines: string[]): string[] {
  const text = headlines.join(' ').toLowerCase();
  return MARKET_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
}

// ── Build memory context string for analysts ──────────────────────────────────

export function buildMemoryContext(memories: MemoryEvent[]): string {
  if (memories.length === 0) return '';

  const withOutcome = memories.filter(m => m.outcome);
  if (withOutcome.length === 0) {
    return `\n📚 היסטוריה: ${memories.length} אירוע דומה קרה לאחרונה אך עדיין ללא תוצאות מדודות.\n`;
  }

  const lines = withOutcome.slice(0, 3).map(m => {
    const o = m.outcome!;
    const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString('he-IL') : '';
    const deltas = [
      o.btcDelta    != null ? `BTC ${o.btcDelta > 0 ? '+' : ''}${o.btcDelta.toFixed(1)}%` : '',
      o.sp500Delta  != null ? `S&P ${o.sp500Delta > 0 ? '+' : ''}${o.sp500Delta.toFixed(1)}%` : '',
      o.nasdaqDelta != null ? `נאסד"ק ${o.nasdaqDelta > 0 ? '+' : ''}${o.nasdaqDelta.toFixed(1)}%` : '',
      o.shekelDelta != null ? `שקל ${o.shekelDelta > 0 ? '+' : ''}${o.shekelDelta.toFixed(1)}%` : '',
    ].filter(Boolean).join(' | ');
    return `• ${date}: "${m.reason}" → ${deltas} (אחרי ${o.resolvedAfterHours}ש')`;
  });

  return `\n📚 היסטוריה — אירועים דומים בעבר:\n${lines.join('\n')}\n`;
}
