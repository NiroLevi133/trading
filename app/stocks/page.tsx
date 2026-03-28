'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AssetAnalysis, Signal, DataSummary, GroupResult } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function signalColor(s: Signal) {
  return s === 'BUY' ? '#22c55e' : s === 'SELL' ? '#ef4444' : '#f59e0b';
}
function signalBg(s: Signal) {
  return s === 'BUY'
    ? 'rgba(34,197,94,0.12)'
    : s === 'SELL'
    ? 'rgba(239,68,68,0.12)'
    : 'rgba(245,158,11,0.12)';
}
function signalBorder(s: Signal) {
  return s === 'BUY'
    ? 'rgba(34,197,94,0.3)'
    : s === 'SELL'
    ? 'rgba(239,68,68,0.3)'
    : 'rgba(245,158,11,0.3)';
}
function signalHe(s: Signal) {
  return s === 'BUY' ? 'קנה' : s === 'SELL' ? 'מכור' : 'החזק';
}

const groupNameHe: Record<string, string> = {
  'trend-following': 'מגמה',
  'momentum': 'מומנטום',
  'sentiment': 'סנטימנט',
};

// ── Expanded Details ──────────────────────────────────────────────────────────

function DataSummarySection({ ds }: { ds: DataSummary }) {
  const sections = [
    { icon: '🔍', label: 'מה קורה עם המנייה', text: ds.priceMovement },
    { icon: '🧠', label: 'מה חושבים המשקיעים', text: ds.indicators },
    { icon: '⚡', label: 'אותות חשובים', text: ds.volumeSpeed },
  ].filter(s => s.text);

  if (sections.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', letterSpacing: 1 }}>
        סיכום נתונים
      </div>
      {sections.map(({ icon, label, text }) => (
        <div key={label} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid #1e1e2e',
          borderRadius: 10, padding: 12,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#818cf8',
            marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span>{icon}</span><span>{label}</span>
          </div>
          <div style={{
            fontSize: 13, color: '#cbd5e1', lineHeight: 1.8,
            textAlign: 'right', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {text}
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupsSection({ groups }: { groups: GroupResult[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', letterSpacing: 1 }}>
        קבוצות ניתוח
      </div>
      {groups.map(g => (
        <div key={g.name} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid #1e1e2e',
          borderRadius: 10, padding: 12,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
              {groupNameHe[g.name] ?? g.name}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: signalColor(g.signal),
                background: signalBg(g.signal), border: `1px solid ${signalBorder(g.signal)}`,
                borderRadius: 6, padding: '2px 8px',
              }}>
                {signalHe(g.signal)}
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{g.confidence}%</span>
            </div>
          </div>
          <div style={{
            fontSize: 12, color: '#94a3b8', lineHeight: 1.7,
            textAlign: 'right', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {g.summary}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stock Card ────────────────────────────────────────────────────────────────

function StockCard({ stock }: { stock: AssetAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const price = stock.marketData.price;
  const change = stock.marketData.changePercent;
  const fmt = (n: number) =>
    n >= 1000
      ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${n.toFixed(2)}`;

  const analyzedAt = new Date(stock.analyzedAt).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style={{
      background: '#12121a',
      border: `1px solid ${signalBorder(stock.signal)}`,
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '16px 18px', cursor: 'pointer', textAlign: 'right',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          {/* Left: signal badge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
            <span style={{
              fontSize: 14, fontWeight: 800,
              color: signalColor(stock.signal),
              background: signalBg(stock.signal),
              border: `1px solid ${signalBorder(stock.signal)}`,
              borderRadius: 8, padding: '4px 12px',
            }}>
              {signalHe(stock.signal)}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>{stock.confidence}% ביטחון</span>
          </div>

          {/* Right: symbol + price */}
          <div style={{ textAlign: 'right', flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#e2e8f0' }}>{stock.symbol}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{stock.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{fmt(price)}</div>
            <div style={{ fontSize: 12, color: change >= 0 ? '#22c55e' : '#ef4444' }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Short recommendation — always shown */}
        <div style={{
          marginTop: 12, fontSize: 13, color: '#cbd5e1',
          lineHeight: 1.7, textAlign: 'right',
        }}>
          {stock.recommendation}
        </div>

        {/* Price target line */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 10, fontSize: 11, color: '#64748b',
        }}>
          <span>יעד: <span style={{ color: '#22c55e' }}>${stock.priceTarget.high.toFixed(2)}</span></span>
          <span>תחתית: <span style={{ color: '#ef4444' }}>${stock.priceTarget.low.toFixed(2)}</span></span>
        </div>

        {/* Expand indicator */}
        <div style={{
          marginTop: 10, fontSize: 11, color: '#818cf8',
          textAlign: 'center',
        }}>
          {expanded ? '▲ סגור' : '▼ פרטים מלאים'}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          borderTop: '1px solid #1e1e2e',
          padding: '0 18px 18px',
        }}>
          {stock.dataSummary
            ? <DataSummarySection ds={stock.dataSummary} />
            : (
              <div style={{
                marginTop: 14,
                fontSize: 12, color: '#d97706',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 8, padding: '10px 12px',
                textAlign: 'center',
              }}>
                ⚠️ אין סיכום נתונים מורחב לניתוח זה
              </div>
            )
          }

          {stock.groups?.length > 0 && (
            <GroupsSection groups={stock.groups} />
          )}

          <div style={{ marginTop: 12, fontSize: 10, color: '#374151', textAlign: 'center' }}>
            נותח: {analyzedAt}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[120, 120, 120].map((h, i) => (
        <div key={i} style={{
          height: h, background: '#12121a', borderRadius: 16,
          animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6,
        }} />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StocksPage() {
  const [stocks, setStocks] = useState<AssetAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/stocks');
      if (res.ok) setStocks(await res.json());
      else setError(true);
    } catch { setError(true); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{
      maxWidth: 480, margin: '0 auto',
      padding: `16px 16px max(24px, env(safe-area-inset-bottom))`,
      paddingTop: 'max(16px, env(safe-area-inset-top))',
      minHeight: '100dvh',
      background: '#0a0a0f',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0' }}>מניות</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>ניתוחים שנשמרו · לחץ על מנייה לפרטים</div>
        </div>
        <Link href="/" style={{
          background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 10, padding: '10px 18px', color: '#818cf8',
          fontSize: 14, fontWeight: 600, textDecoration: 'none',
          minHeight: 44, display: 'flex', alignItems: 'center',
        }}>
          ← חזור
        </Link>
      </div>

      {loading && <Skeleton />}

      {error && !loading && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 10, padding: 14, fontSize: 13, color: '#fca5a5', textAlign: 'center',
        }}>
          שגיאה בטעינת נתונים. <button onClick={load} style={{ color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>נסה שוב</button>
        </div>
      )}

      {!loading && !error && stocks.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: '#64748b', fontSize: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📈</div>
          <div>אין מניות שנסרקו עדיין.</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            חזור לדף הראשי וסרוק מנייה.
          </div>
        </div>
      )}

      {!loading && stocks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {stocks.map(stock => (
            <StockCard key={stock.symbol} stock={stock} />
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: '#374151', textAlign: 'center', marginTop: 24, lineHeight: 1.6 }}>
        ניתוחים אלו הם לצורכי מידע בלבד ואינם ייעוץ פיננסי.
      </div>
    </div>
  );
}
