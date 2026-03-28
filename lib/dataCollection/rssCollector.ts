// ─────────────────────────────────────────────────────────────────────────────
// RSS Collector — fetches & parses RSS/Atom feeds without external dependencies
// ─────────────────────────────────────────────────────────────────────────────

import { DataSource } from './sources';

export interface CollectedItem {
  sourceId: string;
  sourceName: string;
  category: string;
  title: string;
  content: string;
  url: string;
  publishedAt: string | null;
  language: string;
}

// ── Simple XML helpers ────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  // Try CDATA variant first
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`, 's');
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain text variant
  const plainRe = new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, 's');
  const plainMatch = xml.match(plainRe);
  if (plainMatch) return stripHtml(plainMatch[1].trim());

  return '';
}

function extractAtomLink(xml: string): string {
  // <link href="..."/> or <link rel="alternate" href="..."/>
  const m = xml.match(/<link[^>]+href="([^"]+)"/);
  if (m) return m[1];
  // Plain <link>url</link>
  return extractTag(xml, 'link');
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  try {
    return new Date(raw).toISOString();
  } catch {
    return null;
  }
}

// ── Parse RSS 2.0 or Atom feed ────────────────────────────────────────────────

function parseFeed(xml: string, source: DataSource, maxItems: number): CollectedItem[] {
  const isAtom = /<feed[\s>]/.test(xml);
  const itemPattern = isAtom
    ? /<entry[\s>]([\s\S]*?)<\/entry>/g
    : /<item[\s>]([\s\S]*?)<\/item>/g;

  const items: CollectedItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];

    const title = extractTag(block, 'title');
    if (!title) continue;

    const url = isAtom
      ? extractAtomLink(block)
      : extractTag(block, 'link') || extractAtomLink(block);

    const description =
      extractTag(block, 'description') ||
      extractTag(block, 'summary') ||
      extractTag(block, 'content');

    const pubRaw =
      extractTag(block, 'pubDate') ||
      extractTag(block, 'published') ||
      extractTag(block, 'updated') ||
      extractTag(block, 'dc:date');

    items.push({
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      title,
      content: description.slice(0, 500), // cap size
      url,
      publishedAt: parseDate(pubRaw),
      language: source.language,
    });
  }

  return items;
}

// ── Fetch a single RSS source ─────────────────────────────────────────────────

async function fetchRSSSource(source: DataSource, maxItems: number): Promise<CollectedItem[]> {
  try {
    const res = await fetch(source.url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!res.ok) return [];

    const xml = await res.text();
    return parseFeed(xml, source, maxItems);
  } catch {
    // Silently skip failing sources
    return [];
  }
}

// ── Batch fetch RSS sources in parallel (with concurrency limit) ──────────────

export async function collectFromRSSSources(
  sources: DataSource[],
  maxItemsPerSource: number = 8,
  concurrency: number = 15,
): Promise<{ items: CollectedItem[]; succeeded: number; attempted: number }> {
  const rssSources = sources.filter(s => s.source_type === 'rss');

  let succeeded = 0;
  const allItems: CollectedItem[] = [];

  // Process in batches
  for (let i = 0; i < rssSources.length; i += concurrency) {
    const batch = rssSources.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(src => fetchRSSSource(src, maxItemsPerSource))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allItems.push(...result.value);
        succeeded++;
      }
    }
  }

  return {
    items: allItems,
    succeeded,
    attempted: rssSources.length,
  };
}
