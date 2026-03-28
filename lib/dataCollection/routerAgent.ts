// ─────────────────────────────────────────────────────────────────────────────
// Router Agent — decides which sources to collect + which analysts to activate
//
// Triggers:
//   MARKET_OPEN     — שני-שישי 16:30 ישראל: פתיחת וול סטריט
//   MARKET_IL_OPEN  — שני-שישי 10:00 ישראל: פתיחת בורסת ת"א
//   TRUMP_STATEMENT — זוהה פוסט/נאום של טראמפ
//   WAR_NEWS        — חדשות ביטחוניות/מלחמה/הפסקת אש
//   CRYPTO_MOVE     — תנועה חדה בביטקוין/קריפטו
//   MACRO_RELEASE   — פרסום נתוני מקרו (CPI, NFP, ריבית)
//   REGULAR         — סריקה שגרתית (כל 30 דקות)
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { logAgentCost } from './costLogger';
import { SourceCategory } from './sources';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type TriggerType =
  | 'MARKET_OPEN'
  | 'MARKET_IL_OPEN'
  | 'TRUMP_STATEMENT'
  | 'WAR_NEWS'
  | 'CRYPTO_MOVE'
  | 'MACRO_RELEASE'
  | 'REGULAR';

export interface CollectionPlan {
  trigger: TriggerType;
  reason: string;
  // Which categories to collect, in priority order
  categories: SourceCategory[];
  // Which analysts to run (cost optimization: not always all 3)
  analysts: ('financial' | 'sentiment' | 'macro')[];
  // Max items to collect per category (cost control)
  maxItemsPerCategory: number;
  // Priority sources to include (by id) regardless of category
  prioritySources?: string[];
}

// ── Static rule-based trigger detection ──────────────────────────────────────

function detectTriggerFromContext(context: RouterContext): TriggerType {
  const hour = new Date().getHours(); // Israel time assumed
  const dayOfWeek = new Date().getDay(); // 0=Sunday, 6=Saturday
  const isWeekday = dayOfWeek >= 0 && dayOfWeek <= 4; // Sun-Thu for Israel

  // Explicit overrides take priority
  if (context.explicitTrigger) return context.explicitTrigger;

  // Check keywords in recent signals
  const signalText = (context.recentSignals ?? []).join(' ').toLowerCase();
  if (signalText.includes('trump') || signalText.includes('tariff')) return 'TRUMP_STATEMENT';
  if (signalText.includes('war') || signalText.includes('ceasefire') || signalText.includes('מלחמה') || signalText.includes('הפסקת אש')) return 'WAR_NEWS';
  if (signalText.includes('bitcoin') || signalText.includes('crypto') || signalText.includes('btc')) return 'CRYPTO_MOVE';
  if (signalText.includes('cpi') || signalText.includes('nfp') || signalText.includes('fed') || signalText.includes('rate')) return 'MACRO_RELEASE';

  // Time-based triggers (Israel time UTC+3)
  if (isWeekday && hour === 10) return 'MARKET_IL_OPEN';
  if (isWeekday && hour === 16) return 'MARKET_OPEN'; // 16:30 Israel = 13:30 UTC

  return 'REGULAR';
}

// ── Preset collection plans per trigger ──────────────────────────────────────

const COLLECTION_PLANS: Record<TriggerType, Omit<CollectionPlan, 'trigger' | 'reason'>> = {
  MARKET_OPEN: {
    // Wall Street opening — focus on US market data + social buzz + macro
    categories: ['market_data', 'news_intl', 'social', 'macro', 'commodities'],
    analysts: ['financial', 'sentiment'],
    maxItemsPerCategory: 8,
    prioritySources: ['trump-x', 'vix-fear-index', 'bonds-yields', 'dollar-index', 'sp500-sector-rotation', 'fed-powell-x'],
  },

  MARKET_IL_OPEN: {
    // Israeli market opening — focus on local news + shekel + TA-35
    categories: ['news_il', 'market_data', 'geopolitical', 'macro'],
    analysts: ['financial', 'sentiment'],
    maxItemsPerCategory: 8,
    prioritySources: ['globes', 'calcalist', 'themarker', 'israel-shekel', 'taavura-ta35', 'bank-of-israel', 'israel-war-news'],
  },

  TRUMP_STATEMENT: {
    // Trump tweet/speech detected — immediate broad US impact scan
    categories: ['social', 'news_intl', 'market_data', 'macro', 'commodities'],
    analysts: ['financial', 'sentiment', 'macro'],
    maxItemsPerCategory: 10,
    prioritySources: ['trump-x', 'us-treasury-secretary', 'us-sanctions', 'vix-fear-index', 'dollar-index', 'reuters-business', 'cnbc-top'],
  },

  WAR_NEWS: {
    // War/ceasefire/military escalation — geopolitical + Israeli + commodities (oil)
    categories: ['geopolitical', 'news_il', 'news_intl', 'commodities', 'market_data'],
    analysts: ['sentiment', 'macro'],
    maxItemsPerCategory: 10,
    prioritySources: ['israel-war-news', 'iran-intl', 'aljazeera', 'middle-east-eye', 'oil-crude-today', 'gold-price-today', 'israel-pm-x', 'breaking-defense'],
  },

  CRYPTO_MOVE: {
    // Sharp crypto movement — focus crypto + social buzz + macro
    categories: ['crypto', 'social', 'market_data', 'regulation'],
    analysts: ['financial', 'sentiment'],
    maxItemsPerCategory: 8,
    prioritySources: ['coindesk', 'cointelegraph', 'the-block', 'crypto-social-buzz', 'binance-news', 'crypto-regulation', 'reddit-wsb'],
  },

  MACRO_RELEASE: {
    // Economic data release — macro + markets + bonds/rates
    categories: ['macro', 'market_data', 'news_intl', 'commodities'],
    analysts: ['financial', 'macro'],
    maxItemsPerCategory: 8,
    prioritySources: ['us-cpi-ppi', 'us-jobs-data', 'fed-press', 'us-treasury-news', 'bonds-yields', 'dollar-index', 'vix-fear-index', 'ecb-press'],
  },

  REGULAR: {
    // Routine scan — balanced but lightweight
    categories: ['news_il', 'news_intl', 'market_data', 'geopolitical'],
    analysts: ['sentiment'],
    maxItemsPerCategory: 5,
    prioritySources: ['globes', 'reuters-business', 'cnbc-top', 'vix-fear-index', 'israel-war-news'],
  },
};

// ── Router Context ────────────────────────────────────────────────────────────

export interface RouterContext {
  // Optional: force a specific trigger
  explicitTrigger?: TriggerType;
  // Recent headlines / signals from a quick scan (optional)
  recentSignals?: string[];
  // Last collection timestamp ISO string
  lastCollectedAt?: string;
  // Any external event hint (e.g., webhook keyword)
  eventHint?: string;
}

// ── AI-powered router (Claude Haiku) for smart context detection ──────────────

async function detectTriggerWithAI(context: RouterContext): Promise<{ trigger: TriggerType; reason: string }> {
  // If there are recent signals to analyze, use AI
  if (!context.recentSignals?.length && !context.eventHint) {
    const trigger = detectTriggerFromContext(context);
    return { trigger, reason: `זוהה לפי שעה ויום בשבוע (${new Date().toLocaleTimeString('he-IL')})` };
  }

  const signalSummary = [
    context.eventHint ? `רמז חיצוני: ${context.eventHint}` : '',
    context.recentSignals?.length ? `כותרות אחרונות:\n${context.recentSignals.slice(0, 15).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const nowHe = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: `אתה סוכן ניתוב שמחליט מה הטריגר הכי רלוונטי עכשיו לשוקי ההון.
הטריגרים האפשריים:
- MARKET_OPEN: פתיחת שוק וול סטריט (16:30 ישראל)
- MARKET_IL_OPEN: פתיחת בורסת תל אביב (10:00 ישראל)
- TRUMP_STATEMENT: פוסט/נאום של טראמפ שמשפיע על שוקי ההון
- WAR_NEWS: חדשות ביטחוניות/מלחמה/הפסקת אש שמשפיעות על השוק
- CRYPTO_MOVE: תנועה חדה בקריפטו
- MACRO_RELEASE: פרסום נתוני מקרו (CPI, ריבית, תעסוקה)
- REGULAR: סריקה שגרתית

ענה אך ורק ב-JSON: {"trigger":"TRIGGER_TYPE","reason":"הסבר קצר בעברית"}`,
    messages: [{
      role: 'user',
      content: `שעה נוכחית: ${nowHe}\n\n${signalSummary}\n\nאיזה טריגר הכי רלוונטי עכשיו?`,
    }],
  });

  // Log router cost
  const inTok = message.usage.input_tokens;
  const outTok = message.usage.output_tokens;
  const costUsd = (inTok * 0.80 + outTok * 4.00) / 1_000_000;
  logAgentCost('router', 'claude-haiku-4-5', inTok, outTok, costUsd).catch(() => {});

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    const trigger: TriggerType = parsed.trigger ?? 'REGULAR';
    return { trigger, reason: parsed.reason ?? 'זוהה אוטומטית' };
  } catch {
    const trigger = detectTriggerFromContext(context);
    return { trigger, reason: 'זוהה לפי שעה (fallback)' };
  }
}

// ── Main Router Entry Point ───────────────────────────────────────────────────

export async function runRouter(context: RouterContext = {}): Promise<CollectionPlan> {
  const { trigger, reason } = await detectTriggerWithAI(context);
  const plan = COLLECTION_PLANS[trigger];

  return {
    trigger,
    reason,
    ...plan,
  };
}

// ── Quick scan: fetch a few top headlines to help router decide ───────────────
// Called before routing when we have no recent signals

export async function quickScan(): Promise<string[]> {
  // Fetch a couple of fast RSS feeds to extract recent headlines
  const fastSources = [
    'https://feeds.reuters.com/reuters/businessNews',
    'https://www.timesofisrael.com/feed/',
    'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  ];

  const headlines: string[] = [];

  await Promise.allSettled(
    fastSources.map(async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const xml = await res.text();
        // Extract titles quickly with regex
        const titleMatches = xml.matchAll(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/g);
        let count = 0;
        for (const m of titleMatches) {
          const title = (m[1] ?? m[2] ?? '').trim();
          if (title && !title.startsWith('<?') && count < 5) {
            headlines.push(title);
            count++;
          }
        }
      } catch {
        // Skip failed sources
      }
    })
  );

  return headlines;
}
