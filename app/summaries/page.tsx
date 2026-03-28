'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FullAnalysis, AssetAnalysis } from '@/lib/types';
import { MarketIntelResult } from '@/lib/agents/webSearch';

const ASSETS: { key: keyof Omit<FullAnalysis, 'analyzedAt'>; emoji: string }[] = [
  { key: 'aapl',   emoji: '🍎' },
  { key: 'sp500',  emoji: '📈' },
  { key: 'nasdaq', emoji: '💻' },
  { key: 'btc',    emoji: '₿'  },
];

// ── Data Summary Card ─────────────────────────────────────────────────────────

function SummaryCard({ asset }: { asset: AssetAnalysis }) {
  const { dataSummary } = asset;

  const sections = [
    { icon: '🔍', label: 'איסוף מידע גולמי',     text: dataSummary?.priceMovement },
    { icon: '🧠', label: 'ניתוח סנטימנט',        text: dataSummary?.indicators },
    { icon: '⚡', label: 'זיהוי אותות חשובים',   text: dataSummary?.volumeSpeed },
  ].filter(s => s.text);

  return (
    <div style={{
      background: '#12121a', border: '1px solid #1e1e2e',
      borderRadius: 16, padding: 20,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0' }}>{asset.symbol}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{asset.name}</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            ${asset.marketData.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: asset.marketData.changePercent >= 0 ? '#22c55e' : '#ef4444' }}>
            {asset.marketData.changePercent >= 0 ? '+' : ''}{asset.marketData.changePercent.toFixed(2)}%
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 8, padding: '12px 14px',
          fontSize: 12, color: '#d97706', textAlign: 'center', lineHeight: 1.6,
        }}>
          ⚠️ הניתוח הקודם לא כלל סיכום מורחב.
          <br />חזור לדף הראשי ולחץ &quot;נתח עכשיו&quot; שוב.
        </div>
      ) : sections.map(({ icon, label, text }) => (
        <div key={label} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid #1e1e2e',
          borderRadius: 10, padding: 14,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: '#818cf8',
            marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>{icon}</span><span>{label}</span>
          </div>
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.7, textAlign: 'right' }}>
            {text}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Market Intel Section ──────────────────────────────────────────────────────

function MarketIntelSection() {
  const [intel, setIntel] = useState<(MarketIntelResult & { cached?: boolean; stale?: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchIntel = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/market-intel');
      if (res.ok) setIntel(await res.json());
      else setError(true);
    } catch { setError(true); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchIntel(); }, [fetchIntel]);

  const agents = intel ? [
    { icon: '🔍', label: 'איסוף מידע גולמי',   color: '#60a5fa', text: intel.rawIntelligence },
    { icon: '🧠', label: 'ניתוח סנטימנט שוק',  color: '#a78bfa', text: intel.sentiment },
    { icon: '⚡', label: 'זיהוי אותות חשובים', color: '#34d399', text: intel.signals },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
            🌐 סיכום שוקי הון — חיפוש אינטרנט
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>שוק ישראלי + שוק אמריקאי · 3 סוכני AI</div>
        </div>
        <button
          onClick={fetchIntel}
          disabled={loading}
          style={{
            background: loading ? '#1e1e2e' : 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 8, padding: '7px 12px',
            color: loading ? '#374151' : '#818cf8',
            fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'טוען...' : '🔄 רענן'}
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[120, 120, 120].map((h, i) => (
            <div key={i} style={{
              height: h, background: '#12121a', borderRadius: 12,
              animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6,
            }} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 10, padding: 14,
          fontSize: 13, color: '#fca5a5', textAlign: 'center',
        }}>
          שגיאה בטעינת מידע מהאינטרנט. לחץ רענן לנסות שוב.
        </div>
      )}

      {agents.map(({ icon, label, color, text }) => (
        <div key={label} style={{
          background: '#12121a', border: '1px solid #1e1e2e',
          borderRadius: 14, padding: 18,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
            {intel?.cached && (
              <span style={{ fontSize: 10, color: '#374151', marginRight: 'auto' }}>
                {intel.stale ? 'מאוחסן (ישן)' : 'מאוחסן'}
              </span>
            )}
          </div>
          <div style={{
            fontSize: 13, color: '#cbd5e1',
            lineHeight: 1.8, textAlign: 'right',
            whiteSpace: 'pre-wrap',
          }}>
            {text}
          </div>
        </div>
      ))}

      {intel && !loading && (
        <div style={{ fontSize: 10, color: '#374151', textAlign: 'center' }}>
          עודכן: {new Date(intel.fetchedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          {intel.cached && ' · נתון מאוחסן (מתרענן כל 30 דקות)'}
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[220, 220, 220, 220].map((h, i) => (
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

export default function SummariesPage() {
  const [data, setData] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'data' | 'market'>('market');

  const load = useCallback(async () => {
    const res = await fetch('/api/results');
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      maxWidth: 480, margin: '0 auto',
      padding: `16px 16px max(24px, env(safe-area-inset-bottom))`,
      paddingTop: 'max(16px, env(safe-area-inset-top))',
      minHeight: '100dvh',
      background: '#0a0a0f',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0' }}>סיכומי ניתוח</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>סוכני AI · ניתוח + חיפוש אינטרנט</div>
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

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20,
        background: '#12121a', borderRadius: 10, padding: 4,
      }}>
        {([
          { key: 'market', label: '🌐 שוק' },
          { key: 'data',   label: '📊 נתוני מניות' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
            background: tab === key ? 'rgba(99,102,241,0.2)' : 'transparent',
            color: tab === key ? '#818cf8' : '#64748b',
            fontSize: 13, fontWeight: tab === key ? 700 : 400,
            cursor: 'pointer',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Market Intel Tab */}
      {tab === 'market' && <MarketIntelSection />}

      {/* Data Summaries Tab */}
      {tab === 'data' && (
        <>
          {loading && <Skeleton />}

          {!loading && !data && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b', fontSize: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
              <div>אין ניתוח זמין — חזור לדף הראשי ולחץ &quot;נתח עכשיו&quot;</div>
            </div>
          )}

          {data && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                עדכון אחרון: {formatTime(data.analyzedAt)}
              </div>
              {ASSETS.map(({ key, emoji }) => (
                <div key={key}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    {emoji} {data[key].name}
                  </div>
                  <SummaryCard asset={data[key]} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
