'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CollectionRun {
  id: number;
  trigger: string;
  reason: string;
  started_at: string;
  completed_at: string | null;
  items_collected: number;
  sources_succeeded: number;
  status: 'running' | 'completed' | 'failed';
}

interface Analysis {
  agent_type: 'financial' | 'sentiment' | 'macro';
  summary: string;
  signals: unknown;
  risk_level: string | null;
  confidence: number | null;
  key_insights: unknown;
  analyzed_at: string;
}

interface CorrelationStat {
  trigger: string;
  sampleSize: number;
  avgDelta: { btc?: number; sp500?: number; nasdaq?: number; shekel?: number };
  positiveRate: { btc?: number; sp500?: number; nasdaq?: number };
}

interface CorrelationRecord {
  id: number;
  trigger: string;
  reason: string;
  deltaPercent?: { btc?: number; sp500?: number; nasdaq?: number };
  resolvedAt?: string;
  createdAt: string;
}

interface Memory {
  id: number;
  trigger: string;
  reason: string;
  outcome?: { btcDelta?: number; sp500Delta?: number; resolvedAfterHours: number };
  createdAt: string;
}

interface IntelligenceData {
  runs: CollectionRun[];
  analyses: Analysis[];
  correlationStats: CorrelationStat[];
  recentCorrelations: CorrelationRecord[];
  memories: Memory[];
  sourcesRegistered: number;
  fetchedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  TRUMP_STATEMENT: '🇺🇸 טראמפ',
  WAR_NEWS:        '⚔️ מלחמה',
  MACRO_RELEASE:   '🏦 מאקרו',
  CRYPTO_MOVE:     '₿ קריפטו',
  MARKET_OPEN:     '📈 פתיחה',
  MARKET_IL_OPEN:  '🇮🇱 ת"א',
  REGULAR:         '🔄 שגרה',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

function Delta({ v }: { v?: number }) {
  if (v == null) return <span className="text-gray-500">—</span>;
  const color = v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
  return <span className={color}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/intelligence');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefresh(new Date().toLocaleTimeString('he-IL'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000); // רענון כל 30 שניות
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-400 text-lg">טוען נתוני אינטליגנציה...</div>
      </div>
    );
  }

  const latestRun = data?.runs?.[0];
  const recentRuns = data?.runs?.slice(0, 20) ?? [];
  const todayRuns  = recentRuns.filter(r => {
    const d = new Date(r.started_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  const financial = data?.analyses?.find(a => a.agent_type === 'financial');
  const sentiment = data?.analyses?.find(a => a.agent_type === 'sentiment');
  const macro     = data?.analyses?.find(a => a.agent_type === 'macro');

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">מרכז אינטליגנציה</h1>
          <p className="text-gray-400 text-sm mt-1">
            {data?.sourcesRegistered} מקורות | עדכון אחרון: {lastRefresh}
          </p>
        </div>
        <button
          onClick={load}
          className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium"
        >
          רענן
        </button>
      </div>

      {/* Status Bar */}
      {latestRun && (
        <div className={`rounded-xl p-4 mb-6 border ${
          latestRun.status === 'running'   ? 'border-yellow-500 bg-yellow-950' :
          latestRun.status === 'completed' ? 'border-green-700 bg-green-950'  :
                                             'border-red-700 bg-red-950'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${
                latestRun.status === 'running' ? 'bg-yellow-400 animate-pulse' :
                latestRun.status === 'completed' ? 'bg-green-400' : 'bg-red-400'
              }`} />
              <span className="font-semibold">
                {TRIGGER_LABELS[latestRun.trigger] ?? latestRun.trigger}
              </span>
              <span className="text-gray-300 text-sm">{latestRun.reason}</span>
            </div>
            <div className="text-gray-400 text-sm text-left">
              {formatDate(latestRun.started_at)} {formatTime(latestRun.started_at)}
              <span className="mr-3">{latestRun.items_collected} פריטים</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Timeline — today's runs */}
        <div className="lg:col-span-1 bg-gray-900 rounded-xl p-4">
          <h2 className="font-semibold mb-3 text-gray-200">
            ציר זמן היום
            <span className="text-gray-500 text-sm mr-2">({todayRuns.length} ריצות)</span>
          </h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {todayRuns.length === 0 && (
              <p className="text-gray-500 text-sm">אין ריצות היום עדיין</p>
            )}
            {todayRuns.map(run => (
              <div key={run.id} className="flex items-start gap-2 text-sm">
                <span className="text-gray-500 min-w-[40px]">{formatTime(run.started_at)}</span>
                <span>{TRIGGER_LABELS[run.trigger] ?? run.trigger}</span>
                <span className="text-gray-400 truncate flex-1">{run.reason}</span>
                <span className={`text-xs ${
                  run.status === 'completed' ? 'text-green-400' :
                  run.status === 'running'   ? 'text-yellow-400 animate-pulse' :
                                              'text-red-400'
                }`}>
                  {run.status === 'completed' ? '✓' : run.status === 'running' ? '⟳' : '✗'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Latest Analyses */}
        <div className="lg:col-span-2 space-y-4">

          {/* Financial */}
          {financial && (
            <div className="bg-gray-900 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-blue-400">📊 ניתוח פיננסי</h3>
                <span className="text-gray-500 text-xs">{formatTime(financial.analyzed_at)}</span>
              </div>
              <p className="text-gray-200 text-sm leading-relaxed">{financial.summary}</p>
              {financial.confidence != null && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full"
                      style={{ width: `${financial.confidence}%` }}
                    />
                  </div>
                  <span className="text-gray-400 text-xs">ביטחון {financial.confidence}%</span>
                </div>
              )}
            </div>
          )}

          {/* Sentiment */}
          {sentiment && (
            <div className="bg-gray-900 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-purple-400">🧠 סנטימנט</h3>
                <span className="text-gray-500 text-xs">{formatTime(sentiment.analyzed_at)}</span>
              </div>
              <p className="text-gray-200 text-sm leading-relaxed">{sentiment.summary}</p>
              {sentiment.confidence != null && (
                <div className="mt-2">
                  <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`absolute top-0 h-3 rounded-full transition-all ${
                        sentiment.confidence > 50 ? 'bg-green-500 left-1/2' : 'bg-red-500 right-1/2'
                      }`}
                      style={{ width: `${Math.abs(sentiment.confidence - 50)}%` }}
                    />
                    <div className="absolute left-1/2 top-0 h-3 w-px bg-gray-600" />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>פחד קיצוני</span>
                    <span>חמדנות קיצונית</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Macro */}
          {macro && (
            <div className="bg-gray-900 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-orange-400">🌍 מאקרו גיאופוליטי</h3>
                <div className="flex items-center gap-2">
                  {macro.risk_level && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      macro.risk_level === 'קיצוני' ? 'bg-red-900 text-red-300' :
                      macro.risk_level === 'גבוה'   ? 'bg-orange-900 text-orange-300' :
                      macro.risk_level === 'מתון'   ? 'bg-yellow-900 text-yellow-300' :
                                                      'bg-green-900 text-green-300'
                    }`}>
                      סיכון {macro.risk_level}
                    </span>
                  )}
                  <span className="text-gray-500 text-xs">{formatTime(macro.analyzed_at)}</span>
                </div>
              </div>
              <p className="text-gray-200 text-sm leading-relaxed">{macro.summary}</p>
            </div>
          )}

          {!financial && !sentiment && !macro && (
            <div className="bg-gray-900 rounded-xl p-8 text-center text-gray-500">
              אין ניתוחים עדיין — הפעל סריקה ראשונה
            </div>
          )}
        </div>
      </div>

      {/* Correlation Stats */}
      {(data?.correlationStats?.length ?? 0) > 0 && (
        <div className="mt-6 bg-gray-900 rounded-xl p-4">
          <h2 className="font-semibold mb-3 text-gray-200">
            📐 קורלציות למדות
            <span className="text-gray-500 text-sm mr-2">(תגובת שוק אחרי 2 שעות)</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-right border-b border-gray-800">
                  <th className="pb-2 pr-2">טריגר</th>
                  <th className="pb-2 px-3">מדגם</th>
                  <th className="pb-2 px-3">BTC</th>
                  <th className="pb-2 px-3">S&P 500</th>
                  <th className="pb-2 px-3">נאסד&quot;ק</th>
                  <th className="pb-2 px-3">% חיובי BTC</th>
                </tr>
              </thead>
              <tbody>
                {data!.correlationStats.map(stat => (
                  <tr key={stat.trigger} className="border-b border-gray-800/50">
                    <td className="py-2 pr-2 font-medium">
                      {TRIGGER_LABELS[stat.trigger] ?? stat.trigger}
                    </td>
                    <td className="py-2 px-3 text-gray-400 text-center">{stat.sampleSize}</td>
                    <td className="py-2 px-3 text-center"><Delta v={stat.avgDelta.btc} /></td>
                    <td className="py-2 px-3 text-center"><Delta v={stat.avgDelta.sp500} /></td>
                    <td className="py-2 px-3 text-center"><Delta v={stat.avgDelta.nasdaq} /></td>
                    <td className="py-2 px-3 text-center text-gray-300">
                      {stat.positiveRate.btc != null ? `${stat.positiveRate.btc}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Memory */}
      {(data?.memories?.length ?? 0) > 0 && (
        <div className="mt-6 bg-gray-900 rounded-xl p-4">
          <h2 className="font-semibold mb-3 text-gray-200">📚 זיכרון היסטורי</h2>
          <div className="space-y-2">
            {data!.memories.slice(0, 6).map(m => (
              <div key={m.id} className="flex items-start gap-3 text-sm border-b border-gray-800/50 pb-2">
                <span className="text-gray-500 min-w-[80px]">
                  {formatDate(m.createdAt)} {formatTime(m.createdAt)}
                </span>
                <span className="text-gray-400">{TRIGGER_LABELS[m.trigger] ?? m.trigger}</span>
                <span className="text-gray-200 flex-1">{m.reason}</span>
                {m.outcome && (
                  <span className="text-xs text-gray-500">
                    BTC <Delta v={m.outcome.btcDelta} />
                    {' '}S&P <Delta v={m.outcome.sp500Delta} />
                    {' '}({m.outcome.resolvedAfterHours}ש')
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-gray-600 text-xs mt-6">
        מתרענן אוטומטית כל 30 שניות
      </p>
    </div>
  );
}
