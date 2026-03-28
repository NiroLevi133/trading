'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FullAnalysis, AssetAnalysis, AgentCounts, Signal, PriceTarget, DataSummary, GroupResult } from '@/lib/types';

// ── Signal helpers ────────────────────────────────────────────────────────────

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

// ── Price Range Bar ───────────────────────────────────────────────────────────

function PriceRangeBar({ current, target, signal }: { current: number; target: PriceTarget; signal: Signal }) {
  const color = signalColor(signal);
  const range = target.high - target.low;
  const pct = range > 0 ? Math.min(100, Math.max(0, ((current - target.low) / range) * 100)) : 50;
  const fmt = (n: number) => n >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;

  const downside = (((current - target.low) / current) * 100).toFixed(1);
  const upside   = (((target.high - current) / current) * 100).toFixed(1);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
        טווח מחיר משוער — 2 עד 4 שבועות
      </div>

      {/* Bar */}
      <div style={{ position: 'relative', height: 6, background: '#1e1e2e', borderRadius: 99, marginBottom: 6 }}>
        {/* Fill */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(to left, ${color}66, ${color}22)`,
          borderRadius: 99,
        }} />
        {/* Current price dot */}
        <div style={{
          position: 'absolute', top: '50%',
          left: `${pct}%`,
          transform: 'translate(-50%, -50%)',
          width: 12, height: 12,
          background: color,
          borderRadius: '50%',
          border: '2px solid #0a0a0f',
          boxShadow: `0 0 6px ${color}`,
        }} />
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{fmt(target.low)}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>סיכון ירידה {downside}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>עכשיו</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{fmt(current)}</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{fmt(target.high)}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>פוטנציאל עלייה {upside}%</div>
        </div>
      </div>
    </div>
  );
}

// ── Confidence Ring ───────────────────────────────────────────────────────────

function ConfidenceRing({ value, signal }: { value: number; signal: Signal }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const filled = (value / 100) * circ;
  const color = signalColor(signal);
  return (
    <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
      <svg width={100} height={100} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={r} fill="none" stroke="#1e1e2e" strokeWidth={8} />
        <circle
          cx={50} cy={50} r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
        <span style={{ fontSize: 10, color: '#64748b' }}>ניקוד</span>
      </div>
    </div>
  );
}

// ── Main Asset Card ───────────────────────────────────────────────────────────

function AssetCard({ data, main }: { data: AssetAnalysis; main?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const color = signalColor(data.signal);
  const change = data.marketData.changePercent;

  if (!main) {
    return (
      <div style={{
        background: '#12121a',
        border: `1px solid ${signalBorder(data.signal)}`,
        borderRadius: 12,
        padding: '12px 14px',
        flex: 1,
        minWidth: 0,
      }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{data.name}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
          ${data.marketData.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: change >= 0 ? '#22c55e' : '#ef4444' }}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, color,
            background: signalBg(data.signal),
            border: `1px solid ${signalBorder(data.signal)}`,
            borderRadius: 6, padding: '2px 7px',
          }}>
            {signalHe(data.signal)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#12121a',
      border: `1px solid ${signalBorder(data.signal)}`,
      borderRadius: 16,
      padding: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: '#64748b' }}>ניתוח נחיל AI</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>{data.symbol}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>{data.name}</div>
        </div>
        <ConfidenceRing value={data.confidence} signal={data.signal} />
      </div>

      {/* Price + Signal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#e2e8f0' }}>
          ${data.marketData.price.toFixed(2)}
        </div>
        <div>
          <div style={{ fontSize: 13, color: change >= 0 ? '#22c55e' : '#ef4444' }}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </div>
          <div style={{
            fontSize: 20, fontWeight: 900, color,
            background: signalBg(data.signal),
            border: `1px solid ${signalBorder(data.signal)}`,
            borderRadius: 8, padding: '4px 14px',
            marginTop: 4,
            textAlign: 'center',
          }}>
            {signalHe(data.signal)}
          </div>
        </div>
      </div>

      {/* Recommendation */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 14,
        fontSize: 14,
        lineHeight: 1.7,
        color: '#cbd5e1',
        textAlign: 'right',
      }}>
        {data.recommendation}
      </div>

      {/* Price Range */}
      <PriceRangeBar
        current={data.marketData.price}
        target={data.priceTarget}
        signal={data.signal}
      />

      {/* Groups toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', background: 'transparent',
          border: '1px solid #1e1e2e', borderRadius: 8,
          padding: '10px 14px', color: '#64748b',
          fontSize: 13, cursor: 'pointer', textAlign: 'right',
          display: 'flex', justifyContent: 'space-between',
          minHeight: 44,
          alignItems: 'center',
        }}
      >
        <span>פירוט קבוצות ({data.groups.length})</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.groups.map((g) => (
            <div key={g.name} style={{
              background: signalBg(g.signal),
              border: `1px solid ${signalBorder(g.signal)}`,
              borderRadius: 10, padding: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                  {groupNameHe[g.name] ?? g.name}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: signalColor(g.signal) }}>
                  {signalHe(g.signal)} · {g.confidence}%
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, textAlign: 'right' }}>{g.summary}</div>

              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {g.agents.map((a) => (
                  <div key={a.id} style={{
                    background: 'rgba(0,0,0,0.2)', borderRadius: 6,
                    padding: '6px 10px', fontSize: 11, color: '#64748b',
                    textAlign: 'right',
                  }}>
                    <span style={{ color: signalColor(a.signal), fontWeight: 600 }}>
                      {signalHe(a.signal)} {a.confidence}%
                    </span>{' '}— {a.reason}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Countdown ─────────────────────────────────────────────────────────────────

function Countdown({ lastAnalyzed }: { lastAnalyzed: string }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const next = new Date(new Date(lastAnalyzed).getTime() + 30 * 60 * 1000);
      const diff = next.getTime() - Date.now();
      if (diff <= 0) { setRemaining('ניתוח עוד מעט...'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastAnalyzed]);

  return (
    <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
      ניתוח הבא בעוד <span style={{ color: '#f59e0b', fontWeight: 600 }}>{remaining}</span>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[200, 100, 100].map((h, i) => (
        <div key={i} style={{
          height: h, background: '#12121a', borderRadius: 16,
          animation: 'pulse 1.5s ease-in-out infinite',
          opacity: 0.6,
        }} />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// ── Cost Button ───────────────────────────────────────────────────────────────

function CostButton({ lastCost }: { lastCost?: number }) {
  const [total, setTotal] = useState<{ totalUsd: number; count: number } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/costs').then(r => r.ok ? r.json() : null).then(d => d && setTotal(d));
  }, []);

  const fmt = (n: number) => n < 0.01 ? `$${(n * 100).toFixed(3)}¢` : `$${n.toFixed(4)}`;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="עלות ניתוחים"
        style={{
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 8, padding: '6px 10px',
          color: '#34d399', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        💰 {total ? fmt(total.totalUsd) : '...'}
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: 16,
        }} onClick={() => setOpen(false)}>
          <div style={{
            background: '#12121a', border: '1px solid #1e1e2e',
            borderRadius: 16, padding: 24, width: '100%', maxWidth: 360,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
              💰 עלות ניתוחים
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)',
                borderRadius: 10, padding: '12px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>סה&quot;כ עד היום</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#34d399' }}>
                  {total ? `$${total.totalUsd.toFixed(4)}` : '...'}
                </span>
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 13, color: '#64748b', padding: '0 4px',
              }}>
                <span>מספר ניתוחים</span>
                <span style={{ color: '#94a3b8' }}>{total?.count ?? '...'}</span>
              </div>

              {lastCost !== undefined && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 13, color: '#64748b', padding: '0 4px',
                }}>
                  <span>ניתוח אחרון</span>
                  <span style={{ color: '#94a3b8' }}>{fmt(lastCost)}</span>
                </div>
              )}

              <div style={{ fontSize: 10, color: '#374151', textAlign: 'center', marginTop: 4 }}>
                מחירים: Haiku $0.80/1M · Sonnet $3/1M · GPT-4o-mini $0.15/1M · Gemini $0.075/1M
              </div>
            </div>

            <button onClick={() => setOpen(false)} style={{
              marginTop: 16, width: '100%',
              background: 'transparent', border: '1px solid #1e1e2e',
              borderRadius: 8, padding: '10px 0',
              color: '#64748b', fontSize: 13, cursor: 'pointer',
            }}>
              סגור
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Geopolitical News Section ─────────────────────────────────────────────────

interface NewsData {
  status: string;
  events: string[];
  marketImpact: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  updatedAt: string;
  fetchedAt: string;
  isFallback?: boolean;
}

function AskAgent() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שגיאה');
      setAnswer(json.answer);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #1e1e2e', paddingTop: 12 }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>💬 שאל את הסוכן</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && ask()}
          placeholder="מה השפעת המלחמה על הדולר?"
          disabled={loading}
          style={{
            flex: 1, background: '#0a0a0f', border: '1px solid #1e1e2e',
            borderRadius: 8, padding: '8px 10px',
            color: '#e2e8f0', fontSize: 13, outline: 'none',
          }}
        />
        <button
          onClick={ask}
          disabled={loading || !question.trim()}
          style={{
            background: loading ? '#1e1e2e' : 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 8, padding: '8px 12px',
            color: loading ? '#374151' : '#818cf8',
            fontSize: 12, fontWeight: 600,
            cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '...' : 'שאל'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{error}</div>}
      {answer && (
        <div style={{
          marginTop: 10, fontSize: 13, color: '#cbd5e1',
          lineHeight: 1.8, textAlign: 'right',
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
          borderRadius: 10, padding: 12,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {answer}
        </div>
      )}
    </div>
  );
}

function NewsSection() {
  const [news, setNews] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/news');
      if (res.ok) setNews(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const riskColor = news?.riskLevel === 'HIGH' ? '#ef4444'
    : news?.riskLevel === 'MEDIUM' ? '#f59e0b' : '#22c55e';
  const riskHe = news?.riskLevel === 'HIGH' ? 'גבוה' : news?.riskLevel === 'MEDIUM' ? 'בינוני' : 'נמוך';

  return (
    <div style={{
      background: '#0f0a0a',
      border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 12,
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '12px 14px', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>🌍</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>
            ישראל · ארה&quot;ב · איראן
          </span>
          {news && !loading && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: riskColor,
              background: `${riskColor}18`,
              border: `1px solid ${riskColor}44`,
              borderRadius: 4, padding: '2px 6px',
            }}>
              סיכון {riskHe}
            </span>
          )}
          {loading && (
            <span style={{ fontSize: 10, color: '#64748b' }}>טוען...</span>
          )}
        </div>
        <span style={{ fontSize: 12, color: '#64748b' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Status line (always visible when loaded) */}
      {news && !loading && (
        <div style={{
          padding: '0 14px 10px',
          fontSize: 12, color: '#94a3b8', lineHeight: 1.5, textAlign: 'right',
        }}>
          {news.status}
        </div>
      )}

      {/* Expanded content */}
      {expanded && news && !loading && (
        <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Events */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {news.events.map((e, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, textAlign: 'right',
              }}>
                <span style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }}>•</span>
                <span>{e}</span>
              </div>
            ))}
          </div>

          {/* Market impact */}
          <div style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 8, padding: '8px 12px',
            fontSize: 12, color: '#fca5a5', textAlign: 'right', lineHeight: 1.6,
          }}>
            📉 {news.marketImpact}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={(e) => { e.stopPropagation(); fetchNews(); }}
              style={{
                background: 'transparent', border: '1px solid #1e1e2e',
                borderRadius: 6, padding: '4px 10px',
                color: '#64748b', fontSize: 11, cursor: 'pointer',
              }}
            >
              🔄 רענן
            </button>
            <span style={{ fontSize: 10, color: '#374151' }}>
              {news.isFallback ? 'נתוני גיבוי' : `עודכן: ${news.updatedAt}`}
            </span>
          </div>

          <AskAgent />
        </div>
      )}
    </div>
  );
}

// ── Agent Count Stepper ───────────────────────────────────────────────────────

function Stepper({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: value <= min ? '#1e1e2e' : 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            color: value <= min ? '#374151' : '#818cf8',
            fontSize: 16, cursor: value <= min ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >−</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', minWidth: 16, textAlign: 'center' }}>
          {value}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: value >= max ? '#1e1e2e' : 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            color: value >= max ? '#374151' : '#818cf8',
            fontSize: 16, cursor: value >= max ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >+</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// ── Symbol Scanner ────────────────────────────────────────────────────────────

function ScannedStockCard({ stock, onClose }: { stock: AssetAnalysis; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const price = stock.marketData.price;
  const change = stock.marketData.changePercent;
  const fmt = (n: number) =>
    n >= 1000
      ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${n.toFixed(2)}`;

  const groupNameHe: Record<string, string> = {
    'trend-following': 'מגמה',
    'momentum': 'מומנטום',
    'sentiment': 'סנטימנט',
  };

  return (
    <div style={{
      background: '#12121a',
      border: `1px solid ${signalBorder(stock.signal)}`,
      borderRadius: 14, marginTop: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{
              fontSize: 14, fontWeight: 800,
              color: signalColor(stock.signal),
              background: signalBg(stock.signal),
              border: `1px solid ${signalBorder(stock.signal)}`,
              borderRadius: 8, padding: '3px 10px',
            }}>
              {signalHe(stock.signal)} · {stock.confidence}%
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              יעד: <span style={{ color: '#22c55e' }}>{fmt(stock.priceTarget.high)}</span>
              {' / '}
              <span style={{ color: '#ef4444' }}>{fmt(stock.priceTarget.low)}</span>
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0' }}>{stock.symbol}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{stock.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{fmt(price)}</div>
            <div style={{ fontSize: 12, color: change >= 0 ? '#22c55e' : '#ef4444' }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div style={{
          fontSize: 13, color: '#cbd5e1', lineHeight: 1.8,
          textAlign: 'right', background: 'rgba(255,255,255,0.03)',
          border: '1px solid #1e1e2e', borderRadius: 10, padding: 12,
        }}>
          {stock.recommendation}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              flex: 1, background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 8, padding: '7px 0',
              color: '#818cf8', fontSize: 12, cursor: 'pointer',
            }}
          >
            {expanded ? '▲ סגור פרטים' : '▼ פרטים מלאים'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #1e1e2e',
              borderRadius: 8, padding: '7px 12px',
              color: '#374151', fontSize: 12, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: '1px solid #1e1e2e', padding: '0 16px 16px' }}>
          {/* Data summaries */}
          {stock.dataSummary && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8' }}>סיכום נתונים</div>
              {([
                { icon: '🔍', label: 'מה קורה עם המנייה', text: stock.dataSummary.priceMovement },
                { icon: '🧠', label: 'מה חושבים המשקיעים', text: stock.dataSummary.indicators },
                { icon: '⚡', label: 'אותות חשובים', text: stock.dataSummary.volumeSpeed },
              ] as { icon: string; label: string; text: string }[]).filter(s => s.text).map(({ icon, label, text }) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid #1e1e2e',
                  borderRadius: 10, padding: 12,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#818cf8', marginBottom: 6 }}>
                    {icon} {label}
                  </div>
                  <div style={{
                    fontSize: 13, color: '#cbd5e1', lineHeight: 1.8,
                    textAlign: 'right', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Groups */}
          {stock.groups?.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8' }}>קבוצות ניתוח</div>
              {stock.groups.map((g: GroupResult) => (
                <div key={g.name} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid #1e1e2e',
                  borderRadius: 10, padding: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                      {groupNameHe[g.name] ?? g.name}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: signalColor(g.signal),
                      background: signalBg(g.signal), border: `1px solid ${signalBorder(g.signal)}`,
                      borderRadius: 6, padding: '2px 8px',
                    }}>
                      {signalHe(g.signal)} · {g.confidence}%
                    </span>
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
          )}
        </div>
      )}
    </div>
  );
}

function SymbolScanner() {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AssetAnalysis | null>(null);

  const scan = async () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/stock?symbol=${encodeURIComponent(s)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.details ?? json.error ?? 'שגיאה בניתוח');
      }
      const json: AssetAnalysis = await res.json();
      setResult(json);
      setSymbol('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        background: '#12121a', border: '1px solid #1e1e2e',
        borderRadius: 12, padding: 14,
      }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>🔎 סריקת מנייה חופשית</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !loading && scan()}
            placeholder="TSLA, NVDA, AMZN..."
            disabled={loading}
            style={{
              flex: 1, background: '#0a0a0f', border: '1px solid #1e1e2e',
              borderRadius: 8, padding: '9px 12px',
              color: '#e2e8f0', fontSize: 14, outline: 'none',
              fontFamily: 'monospace',
            }}
          />
          <button
            onClick={scan}
            disabled={loading || !symbol.trim()}
            style={{
              background: loading ? '#1e1e2e' : 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.4)',
              borderRadius: 8, padding: '9px 16px',
              color: loading ? '#374151' : '#818cf8',
              fontSize: 13, fontWeight: 600,
              cursor: loading || !symbol.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'סורק...' : 'סרוק'}
          </button>
        </div>
        {error && (
          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{error}</div>
        )}
        {loading && (
          <div style={{ fontSize: 12, color: '#818cf8', marginTop: 8 }}>
            מנתח עם {9} סוכני AI... (~30 שניות)
          </div>
        )}
      </div>

      {result && (
        <ScannedStockCard stock={result} onClose={() => setResult(null)} />
      )}
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [counts, setCounts] = useState<AgentCounts>({
    summaryCount: 3,
    trendCount: 5,
    momentumCount: 5,
    sentimentCount: 5,
  });

  const totalAgents = counts.summaryCount + counts.trendCount + counts.momentumCount + counts.sentimentCount;

  const loadCached = useCallback(async () => {
    const res = await fetch('/api/results');
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setLastFetch(json.analyzedAt);
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        summaryCount:  String(counts.summaryCount),
        trendCount:    String(counts.trendCount),
        momentumCount: String(counts.momentumCount),
        sentimentCount:String(counts.sentimentCount),
      });
      const res = await fetch(`/api/analyze?${params}`);
      if (!res.ok) throw new Error('הניתוח נכשל, נסה שוב');
      const json: FullAnalysis = await res.json();
      setData(json);
      setLastFetch(json.analyzedAt);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [counts]);

  useEffect(() => { loadCached(); }, [loadCached]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0' }}>מנתח מסחר</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>נחיל AI · 3 קבוצות · {totalAgents} סוכנים</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <CostButton lastCost={data?.cost?.totalUsd} />
          <Link href="/stocks" style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 10, padding: '10px 14px',
            color: '#f59e0b', fontSize: 13, fontWeight: 600,
            textDecoration: 'none', minHeight: 44,
            display: 'flex', alignItems: 'center',
          }}>
            מניות
          </Link>
          <Link href="/summaries" style={{
            background: 'rgba(15,118,110,0.15)',
            border: '1px solid rgba(20,184,166,0.3)',
            borderRadius: 10, padding: '10px 14px',
            color: '#2dd4bf', fontSize: 13, fontWeight: 600,
            textDecoration: 'none', minHeight: 44,
            display: 'flex', alignItems: 'center',
          }}>
            סיכומים
          </Link>
          <button
            onClick={runAnalysis}
            disabled={loading}
            style={{
              background: loading ? '#1e1e2e' : 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.4)',
              borderRadius: 10, padding: '10px 18px',
              color: loading ? '#64748b' : '#818cf8',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              minHeight: 44,
            }}
          >
            {loading ? 'מנתח...' : 'נתח עכשיו'}
          </button>
        </div>
      </div>

      {/* Geopolitical news */}
      <NewsSection />

      {/* Symbol scanner */}
      <SymbolScanner />

      {/* Agent settings */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowSettings(v => !v)}
          style={{
            width: '100%', background: 'transparent',
            border: '1px solid #1e1e2e', borderRadius: 8,
            padding: '8px 14px', color: '#64748b',
            fontSize: 12, cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <span>הגדרות סוכנים</span>
          <span>{showSettings ? '▲' : '▼'}</span>
        </button>

        {showSettings && (
          <div style={{
            background: '#12121a', border: '1px solid #1e1e2e',
            borderTop: 'none', borderRadius: '0 0 8px 8px',
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <Stepper label="סוכני סיכום DATA" value={counts.summaryCount}  min={1} max={3} onChange={v => setCounts(c => ({ ...c, summaryCount: v }))} />
            <Stepper label="סוכני מגמה"       value={counts.trendCount}    min={1} max={5} onChange={v => setCounts(c => ({ ...c, trendCount: v }))} />
            <Stepper label="סוכני מומנטום"    value={counts.momentumCount} min={1} max={5} onChange={v => setCounts(c => ({ ...c, momentumCount: v }))} />
            <Stepper label="סוכני סנטימנט"   value={counts.sentimentCount}min={1} max={5} onChange={v => setCounts(c => ({ ...c, sentimentCount: v }))} />
            <div style={{ fontSize: 11, color: '#374151', textAlign: 'center', marginTop: 4 }}>
              סה״כ {totalAgents} סוכנים פעילים
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#ef4444',
          textAlign: 'right',
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && <Skeleton />}

      {/* Results */}
      {data && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Timestamp */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              עדכון אחרון: {formatTime(data.analyzedAt)}
            </div>
            <Countdown lastAnalyzed={data.analyzedAt} />
          </div>

          {/* AAPL - main card */}
          <AssetCard data={data.aapl} main />

          {/* Market overview */}
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>שוק כללי</div>

          {/* S&P500, NASDAQ, BTC - compact row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <AssetCard data={data.sp500} />
            <AssetCard data={data.nasdaq} />
            <AssetCard data={data.btc} />
          </div>

          {/* Disclaimer */}
          <div style={{
            fontSize: 10, color: '#374151', textAlign: 'center',
            marginTop: 8, lineHeight: 1.6,
          }}>
            המלצות אלו הן לצורכי ניתוח בלבד ואינן מהוות ייעוץ פיננסי.
            ההחלטה הסופית נשארת תמיד בידיך.
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: '#64748b', fontSize: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
          <div>לחץ &quot;נתח עכשיו&quot; להפעלת הניתוח הראשון</div>
        </div>
      )}
    </div>
  );
}
