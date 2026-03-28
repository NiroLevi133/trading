// ─────────────────────────────────────────────────────────────────────────────
// Macro Agent — Gemini 2.5 Flash
// Analyzes geopolitical events, central bank actions, macro trends
// Outputs: macro risk assessment, global risk score, systemic risks
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenerativeAI } from '@google/generative-ai';
import { CollectedItem } from '../rssCollector';
import { trackUsage } from '@/lib/pricing';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MACRO_CATEGORIES = ['macro', 'geopolitical', 'regulation', 'commodities'];

export interface GeopoliticalEvent {
  region: string;      // e.g. "ישראל-עזה", "רוסיה-אוקראינה", "ארה"ב-סין"
  event: string;       // Brief description
  marketImpact: 'גבוה' | 'בינוני' | 'נמוך';
}

export interface CentralBankSignal {
  bank: string;        // e.g. "Fed", "בנק ישראל", "ECB"
  signal: 'הידוק' | 'הקלה' | 'ניטרלי' | 'לא ברור';
  detail: string;
}

export interface MacroAnalysis {
  summary: string;
  globalRiskScore: number;          // 0 (no risk) to 100 (extreme risk)
  riskLevel: 'נמוך' | 'מתון' | 'גבוה' | 'קיצוני';
  geopoliticalEvents: GeopoliticalEvent[];
  centralBankSignals: CentralBankSignal[];
  macroTrends: string[];            // Top macro trends
  commodityOutlook: string;         // Oil, gold, energy outlook
  israelRiskFactors: string[];      // Israel-specific macro risks
  globalOpportunities: string[];    // Any macro tailwinds
  model: string;
  costUsd: number;
}

function buildMacroPrompt(items: CollectedItem[]): string {
  const today = new Date().toLocaleDateString('he-IL');

  const relevant = items
    .filter(i => MACRO_CATEGORIES.includes(i.category))
    .slice(0, 50);

  const geopolitical = relevant.filter(i => i.category === 'geopolitical');
  const macro = relevant.filter(i => i.category === 'macro');
  const regulation = relevant.filter(i => i.category === 'regulation');
  const commodities = relevant.filter(i => i.category === 'commodities');

  const format = (arr: CollectedItem[]) =>
    arr.slice(0, 15).map(i => `• [${i.sourceName}] ${i.title}: ${i.content.slice(0, 150)}`).join('\n');

  return `You are a senior macro analyst assessing global risks for ${today}.

GEOPOLITICAL EVENTS (${geopolitical.length} items):
${format(geopolitical) || 'No data'}

MACRO/CENTRAL BANKS (${macro.length} items):
${format(macro) || 'No data'}

COMMODITIES (${commodities.length} items):
${format(commodities) || 'No data'}

REGULATION (${regulation.length} items):
${format(regulation) || 'No data'}

Analyze and respond in Hebrew (simple language, no jargon) with JSON only:
{
  "summary": "3-4 sentences macro overview in Hebrew",
  "globalRiskScore": 0-100,
  "riskLevel": "נמוך|מתון|גבוה|קיצוני",
  "geopoliticalEvents": [
    {"region":"...","event":"...","marketImpact":"גבוה|בינוני|נמוך"}
  ],
  "centralBankSignals": [
    {"bank":"...","signal":"הידוק|הקלה|ניטרלי|לא ברור","detail":"..."}
  ],
  "macroTrends": ["trend1","trend2","trend3"],
  "commodityOutlook": "outlook for oil, gold, energy",
  "israelRiskFactors": ["risk1","risk2"],
  "globalOpportunities": ["opp1","opp2"]
}`;
}

function parseMacroResponse(text: string): Partial<MacroAnalysis> {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      summary: text.slice(0, 300),
      globalRiskScore: 50,
      riskLevel: 'מתון',
      geopoliticalEvents: [],
      centralBankSignals: [],
      macroTrends: [],
      commodityOutlook: '',
      israelRiskFactors: [],
      globalOpportunities: [],
    };
  }
}

export async function runMacroAgent(items: CollectedItem[]): Promise<MacroAnalysis> {
  const prompt = buildMacroPrompt(items);
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const result = await model.generateContent(prompt);
  const meta = result.response.usageMetadata;

  const inputTokens = meta?.promptTokenCount ?? 0;
  const outputTokens = meta?.candidatesTokenCount ?? 0;
  if (meta) trackUsage('gemini-2.5-flash-lite', inputTokens, outputTokens);

  // Gemini Flash Lite pricing: $0.075/1M input, $0.30/1M output
  const costUsd = (inputTokens * 0.075 + outputTokens * 0.30) / 1_000_000;

  const text = result.response.text();
  const parsed = parseMacroResponse(text);

  return {
    summary: parsed.summary ?? '',
    globalRiskScore: Math.max(0, Math.min(100, parsed.globalRiskScore ?? 50)),
    riskLevel: parsed.riskLevel ?? 'מתון',
    geopoliticalEvents: parsed.geopoliticalEvents ?? [],
    centralBankSignals: parsed.centralBankSignals ?? [],
    macroTrends: parsed.macroTrends ?? [],
    commodityOutlook: parsed.commodityOutlook ?? '',
    israelRiskFactors: parsed.israelRiskFactors ?? [],
    globalOpportunities: parsed.globalOpportunities ?? [],
    model: 'gemini-2.5-flash-lite',
    costUsd,
  };
}
