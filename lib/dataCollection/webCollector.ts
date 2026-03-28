// ─────────────────────────────────────────────────────────────────────────────
// Web Collector — uses Gemini Google Search grounding to collect from
// dynamic sources (social media, paywalled sites, real-time data)
//
// Strategy: batch sources by category → one Gemini call per category batch
// This keeps costs minimal while covering many sources at once.
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenerativeAI } from '@google/generative-ai';
import { DataSource, SourceCategory } from './sources';
import { CollectedItem } from './rssCollector';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Build a single search prompt for a batch of web sources ──────────────────

function buildBatchPrompt(category: SourceCategory, sources: DataSource[]): string {
  const today = new Date().toLocaleDateString('he-IL');
  const sourceList = sources.map(s => `- ${s.name}: ${s.url}`).join('\n');

  const categoryPrompts: Record<SourceCategory, string> = {
    news_il: `חפש חדשות כלכליות עדכניות מהיום ${today} מהמקורות הבאים:
${sourceList}

תמצת 8-10 כותרות חשובות מהיום. לכל כותרת ציין: כותרת, מקור, ותקציר קצר (1-2 משפטים).
פורמט: JSON מערך של { title, source, summary, url }`,

    news_intl: `Search for the most important financial and market news from today ${today} from these sources:
${sourceList}

Summarize 8-10 key headlines. For each: title, source, brief summary (1-2 sentences), url.
Format: JSON array of { title, source, summary, url }`,

    social: `Search for the latest statements, posts and discussions from these sources regarding markets and economy today ${today}:
${sourceList}

Find 6-8 important posts/statements. For each: title/headline, source, summary (1-2 sentences), url.
Format: JSON array of { title, source, summary, url }`,

    crypto: `Search for the latest cryptocurrency news from today ${today} from these sources:
${sourceList}

Summarize 6-8 key crypto news items. For each: title, source, summary (1-2 sentences), url.
Format: JSON array of { title, source, summary, url }`,

    macro: `Search for latest macroeconomic data, central bank statements and economic reports from today ${today}:
${sourceList}

Find 6-8 important macro developments. For each: title, source, summary (1-2 sentences), url.
Format: JSON array of { title, source, summary, url }`,

    commodities: `Search for the latest commodities market news from today ${today}:
${sourceList}

Find 5-7 key commodities updates (oil, gold, gas). For each: title, source, summary, current price if available, url.
Format: JSON array of { title, source, summary, url }`,

    geopolitical: `Search for the most significant geopolitical events today ${today} that could affect financial markets:
${sourceList}

Find 6-8 key geopolitical developments. For each: title, source, summary (1-2 sentences), url.
Format: JSON array of { title, source, summary, url }`,

    tech: `Search for the most market-relevant technology news from today ${today}:
${sourceList}

Find 5-7 tech news items affecting stock markets. For each: title, source, summary, url.
Format: JSON array of { title, source, summary, url }`,

    regulation: `Search for latest financial regulation news, SEC/CFTC actions, and policy changes from today ${today}:
${sourceList}

Find 4-6 regulatory developments. For each: title, source, summary, url.
Format: JSON array of { title, source, summary, url }`,

    market_data: `Search for the latest market data, analysis, and trading signals from today ${today}:
${sourceList}

Find 6-8 market data points (VIX level, sector performance, unusual activity). For each: title, source, summary, url.
Format: JSON array of { title, source, summary, url }`,
  };

  return categoryPrompts[category];
}

// ── Parse Gemini JSON response ────────────────────────────────────────────────

function parseGeminiResponse(
  text: string,
  category: SourceCategory,
  sources: DataSource[],
): CollectedItem[] {
  try {
    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title?: string;
      source?: string;
      summary?: string;
      url?: string;
    }>;

    return parsed
      .filter(item => item.title)
      .map(item => ({
        sourceId: `web-${category}`,
        sourceName: item.source ?? category,
        category,
        title: item.title ?? '',
        content: item.summary ?? '',
        url: item.url ?? '',
        publishedAt: new Date().toISOString(),
        language: sources[0]?.language ?? 'en',
      }));
  } catch {
    return [];
  }
}

// ── Fetch one category batch via Gemini ───────────────────────────────────────

async function fetchCategoryBatch(
  category: SourceCategory,
  sources: DataSource[],
): Promise<CollectedItem[]> {
  const webSources = sources.filter(s => s.source_type === 'web_search');
  if (webSources.length === 0) return [];

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const prompt = buildBatchPrompt(category, webSources);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (model as any).generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
    });

    const text: string = result.response.text();
    return parseGeminiResponse(text, category, webSources);
  } catch {
    return [];
  }
}

// ── Collect from all web search sources (batched by category) ─────────────────

export async function collectFromWebSources(
  sources: DataSource[],
  categories: SourceCategory[],
): Promise<{ items: CollectedItem[]; categoriesFetched: number }> {
  // Group web sources by category, filtered to requested categories
  const grouped = new Map<SourceCategory, DataSource[]>();
  for (const cat of categories) {
    const catSources = sources.filter(
      s => s.source_type === 'web_search' && s.category === cat
    );
    if (catSources.length > 0) {
      grouped.set(cat, catSources);
    }
  }

  if (grouped.size === 0) return { items: [], categoriesFetched: 0 };

  // Run all category batches in parallel (each is one Gemini call)
  const results = await Promise.allSettled(
    Array.from(grouped.entries()).map(([cat, srcs]) => fetchCategoryBatch(cat, srcs))
  );

  const allItems: CollectedItem[] = [];
  let categoriesFetched = 0;

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allItems.push(...result.value);
      categoriesFetched++;
    }
  }

  return { items: allItems, categoriesFetched };
}
