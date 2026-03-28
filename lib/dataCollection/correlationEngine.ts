// ─────────────────────────────────────────────────────────────────────────────
// Correlation Engine — לומד קורלציות בין אירועים לתגובות שוק
//
// כשמופעל טריגר: שומר snapshot של מחירים
// אחרי 2 שעות: מושך מחירים שוב, מחשב דלתא, שומר תוצאה
//
// מייצר סטטיסטיקות:
// "TRUMP_STATEMENT → BTC ממוצע -1.8%, S&P -0.9% (מדגם: 12 אירועים)"
// ─────────────────────────────────────────────────────────────────────────────

import { Pool } from 'pg';
import { TriggerType } from './routerAgent';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.URL_DB, ssl: { rejectUnauthorized: false }, max: 3 });
  return pool;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriceSnapshot {
  btc:    number | null;
  sp500:  number | null;
  nasdaq: number | null;
  shekel: number | null; // USD/ILS
}

export interface CorrelationRecord {
  id?: number;
  runId: number;
  trigger: TriggerType;
  reason: string;
  snapshotBefore: PriceSnapshot;
  snapshotAfter?: PriceSnapshot;
  deltaPercent?: Partial<Record<keyof PriceSnapshot, number>>;
  resolveAfterHours: number;
  resolvedAt?: string;
  createdAt?: string;
}

export interface CorrelationStats {
  trigger: TriggerType;
  sampleSize: number;
  avgDelta: Partial<Record<keyof PriceSnapshot, number>>;
  positiveRate: Partial<Record<keyof PriceSnapshot, number>>; // % of times it went up
}

// ── Schema ────────────────────────────────────────────────────────────────────

export async function initCorrelationDb(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS signal_correlations (
        id                  SERIAL        PRIMARY KEY,
        run_id              INTEGER       NOT NULL,
        trigger             TEXT          NOT NULL,
        reason              TEXT          NOT NULL,
        snapshot_before     JSONB         NOT NULL,
        snapshot_after      JSONB,
        delta_percent       JSONB,
        resolve_after_hours INTEGER       NOT NULL DEFAULT 2,
        resolved_at         TIMESTAMPTZ,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS signal_correlations_trigger_idx
        ON signal_correlations (trigger, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS signal_correlations_unresolved_idx
        ON signal_correlations (resolved_at) WHERE resolved_at IS NULL
    `);
  } finally {
    client.release();
  }
}

// ── Fetch current prices (lightweight — Yahoo Finance) ────────────────────────

export async function fetchPriceSnapshot(): Promise<PriceSnapshot> {
  const symbols = ['BTC-USD', '%5EGSPC', '%5EIXIC', 'ILS%3DX'];
  const keys: (keyof PriceSnapshot)[] = ['btc', 'sp500', 'nasdaq', 'shekel'];
  const snapshot: PriceSnapshot = { btc: null, sp500: null, nasdaq: null, shekel: null };

  await Promise.allSettled(
    symbols.map(async (sym, i) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) snapshot[keys[i]] = price;
      } catch { /* skip */ }
    })
  );

  return snapshot;
}

// ── Record + Resolve ──────────────────────────────────────────────────────────

export async function recordCorrelation(
  runId: number,
  trigger: TriggerType,
  reason: string,
  resolveAfterHours = 2,
): Promise<number> {
  const snapshot = await fetchPriceSnapshot();
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `INSERT INTO signal_correlations
         (run_id, trigger, reason, snapshot_before, resolve_after_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [runId, trigger, reason, JSON.stringify(snapshot), resolveAfterHours]
    );
    return result.rows[0].id as number;
  } finally {
    client.release();
  }
}

// מופעל מה-headline-scan cron — מחפש correlations שמוכנות ל-resolve
export async function resolveMaturedCorrelations(): Promise<number> {
  const client = await getPool().connect();
  let resolved = 0;
  try {
    // מצא כל הרשומות הבלתי-פתורות שהגיע זמנן
    const result = await client.query(`
      SELECT * FROM signal_correlations
      WHERE resolved_at IS NULL
        AND created_at < NOW() - (resolve_after_hours || ' hours')::INTERVAL
      LIMIT 10
    `);

    for (const row of result.rows) {
      const snapshotAfter = await fetchPriceSnapshot();
      const before: PriceSnapshot = row.snapshot_before;

      const delta: Partial<Record<keyof PriceSnapshot, number>> = {};
      for (const key of ['btc', 'sp500', 'nasdaq', 'shekel'] as (keyof PriceSnapshot)[]) {
        const b = before[key];
        const a = snapshotAfter[key];
        if (b && a && b > 0) {
          delta[key] = parseFloat((((a - b) / b) * 100).toFixed(2));
        }
      }

      await client.query(
        `UPDATE signal_correlations
         SET snapshot_after = $2,
             delta_percent  = $3,
             resolved_at    = NOW()
         WHERE id = $1`,
        [row.id, JSON.stringify(snapshotAfter), JSON.stringify(delta)]
      );
      resolved++;
    }
  } finally {
    client.release();
  }
  return resolved;
}

// ── Statistics ────────────────────────────────────────────────────────────────

export async function getCorrelationStats(): Promise<CorrelationStats[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(`
      SELECT
        trigger,
        COUNT(*)::int                                       AS sample_size,
        AVG((delta_percent->>'btc')::float)                AS avg_btc,
        AVG((delta_percent->>'sp500')::float)              AS avg_sp500,
        AVG((delta_percent->>'nasdaq')::float)             AS avg_nasdaq,
        AVG((delta_percent->>'shekel')::float)             AS avg_shekel,
        AVG(CASE WHEN (delta_percent->>'btc')::float > 0 THEN 1.0 ELSE 0.0 END)    AS pos_btc,
        AVG(CASE WHEN (delta_percent->>'sp500')::float > 0 THEN 1.0 ELSE 0.0 END)  AS pos_sp500,
        AVG(CASE WHEN (delta_percent->>'nasdaq')::float > 0 THEN 1.0 ELSE 0.0 END) AS pos_nasdaq
      FROM signal_correlations
      WHERE resolved_at IS NOT NULL
        AND delta_percent IS NOT NULL
      GROUP BY trigger
      ORDER BY sample_size DESC
    `);

    return result.rows.map((r: Record<string, unknown>) => {
      const n = (v: unknown) => (v != null ? parseFloat(Number(v).toFixed(2)) : undefined);
      const pct = (v: unknown) => (v != null ? parseFloat((Number(v) * 100).toFixed(0)) : undefined);
      return {
        trigger: r.trigger as TriggerType,
        sampleSize: Number(r.sample_size),
        avgDelta: { btc: n(r.avg_btc), sp500: n(r.avg_sp500), nasdaq: n(r.avg_nasdaq), shekel: n(r.avg_shekel) },
        positiveRate: { btc: pct(r.pos_btc), sp500: pct(r.pos_sp500), nasdaq: pct(r.pos_nasdaq) },
      };
    });
  } finally {
    client.release();
  }
}

export async function getRecentCorrelations(limit = 20): Promise<CorrelationRecord[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT * FROM signal_correlations ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      runId: r.run_id,
      trigger: r.trigger,
      reason: r.reason,
      snapshotBefore: r.snapshot_before,
      snapshotAfter: r.snapshot_after ?? undefined,
      deltaPercent: r.delta_percent ?? undefined,
      resolveAfterHours: r.resolve_after_hours,
      resolvedAt: r.resolved_at ?? undefined,
      createdAt: r.created_at,
    }));
  } finally {
    client.release();
  }
}
