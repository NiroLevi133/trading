// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator — main pipeline:
//   1. Router Agent → decides what to collect
//   2. RSS Collector + Web Collector → gather data from sources
//   3. Memory Agent → adds historical context to analysts
//   4. 3 Analyst Agents (parallel) → analyze by domain
//   5. Correlation Engine → records signal for outcome tracking
//   6. Save everything to DB
// ─────────────────────────────────────────────────────────────────────────────

import { DATA_SOURCES } from './sources';
import { runRouter, RouterContext, CollectionPlan } from './routerAgent';
import { collectFromRSSSources } from './rssCollector';
import { collectFromWebSources } from './webCollector';
import { CollectedItem } from './rssCollector';
import { runFinancialAgent, FinancialAnalysis } from './analysts/financialAgent';
import { runSentimentAgent, SentimentAnalysis } from './analysts/sentimentAgent';
import { runMacroAgent, MacroAnalysis } from './analysts/macroAgent';
import {
  initDataCollectionDb,
  startCollectionRun,
  completeCollectionRun,
  failCollectionRun,
  saveCollectedItems,
  saveAnalysisResult,
  getLatestCollectionRun,
} from './db';
import {
  initMemoryDb,
  saveMemoryEvent,
  querySimilarMemories,
  extractKeywords,
  buildMemoryContext,
} from './memoryAgent';
import {
  initCorrelationDb,
  recordCorrelation,
  resolveMaturedCorrelations,
} from './correlationEngine';

export interface OrchestratorResult {
  runId: number;
  trigger: string;
  reason: string;
  itemsCollected: number;
  sourcesSucceeded: number;
  analyses: {
    financial?: FinancialAnalysis;
    sentiment?: SentimentAnalysis;
    macro?: MacroAnalysis;
  };
  totalCostUsd: number;
  durationMs: number;
}

// ── Filter items by category for each analyst ─────────────────────────────────

function filterForFinancial(items: CollectedItem[], plan: CollectionPlan): CollectedItem[] {
  const financialCats = new Set(['news_intl', 'news_il', 'market_data', 'crypto', 'commodities']);
  return items.filter(i => financialCats.has(i.category));
}

function filterForSentiment(items: CollectedItem[], plan: CollectionPlan): CollectedItem[] {
  const sentimentCats = new Set(['news_il', 'news_intl', 'social', 'geopolitical']);
  return items.filter(i => sentimentCats.has(i.category));
}

function filterForMacro(items: CollectedItem[], plan: CollectionPlan): CollectedItem[] {
  const macroCats = new Set(['macro', 'geopolitical', 'regulation', 'commodities']);
  return items.filter(i => macroCats.has(i.category));
}

// ── Main orchestration pipeline ───────────────────────────────────────────────

export async function runDataCollectionPipeline(
  context: RouterContext = {},
): Promise<OrchestratorResult> {
  const startTime = Date.now();

  // Ensure DB tables exist (all modules)
  await Promise.all([
    initDataCollectionDb(),
    initMemoryDb(),
    initCorrelationDb(),
  ]);

  // Step 1: Router decides the plan
  const plan = await runRouter(context);
  console.log(`[Orchestrator] Trigger: ${plan.trigger} — ${plan.reason}`);
  console.log(`[Orchestrator] Categories: ${plan.categories.join(', ')}`);
  console.log(`[Orchestrator] Analysts: ${plan.analysts.join(', ')}`);

  // Start DB run record
  const runId = await startCollectionRun(plan.trigger, plan.reason);

  try {
    // Filter sources to only those in the plan's categories
    const planCategories = new Set(plan.categories);

    // Also include priority sources even if their category isn't in plan
    const prioritySourceIds = new Set(plan.prioritySources ?? []);
    const activeSources = DATA_SOURCES.filter(
      s => planCategories.has(s.category) || prioritySourceIds.has(s.id)
    );

    console.log(`[Orchestrator] Active sources: ${activeSources.length}`);

    // Step 2: Collect data in parallel (RSS + Web)
    const [rssResult, webResult] = await Promise.all([
      collectFromRSSSources(activeSources, plan.maxItemsPerCategory),
      collectFromWebSources(activeSources, plan.categories),
    ]);

    const allItems: CollectedItem[] = [...rssResult.items, ...webResult.items];
    const totalSucceeded = rssResult.succeeded + webResult.categoriesFetched;
    const totalAttempted = activeSources.length;

    console.log(`[Orchestrator] Collected ${allItems.length} items (RSS: ${rssResult.items.length}, Web: ${webResult.items.length})`);

    // Save raw items to DB
    await saveCollectedItems(runId, allItems);

    // Step 2.5: Memory — שלוף זיכרונות דומים מהעבר כהקשר לאנליסטים
    const headlines = allItems.map(i => i.title);
    const keywords  = extractKeywords(headlines);
    const pastMemories = await querySimilarMemories(plan.trigger, keywords, 5).catch(() => []);
    const memoryContext = buildMemoryContext(pastMemories);
    if (memoryContext) console.log(`[Orchestrator] Memory context: ${pastMemories.length} past events`);

    // Step 3: Run analyst agents in parallel (only the ones the router selected)
    const analystMap = {
      financial: () => runFinancialAgent(filterForFinancial(allItems, plan), memoryContext),
      sentiment: () => runSentimentAgent(filterForSentiment(allItems, plan), memoryContext),
      macro:     () => runMacroAgent(filterForMacro(allItems, plan), memoryContext),
    };

    const analysesToRun = plan.analysts;
    const analysisResults = await Promise.allSettled(
      analysesToRun.map(type => analystMap[type]())
    );

    // Map results back to analyst types
    const analyses: OrchestratorResult['analyses'] = {};
    let totalCostUsd = 0;

    for (let i = 0; i < analysesToRun.length; i++) {
      const type = analysesToRun[i];
      const result = analysisResults[i];

      if (result.status === 'fulfilled') {
        const analysis = result.value as FinancialAnalysis | SentimentAnalysis | MacroAnalysis;

        // Save to DB
        await saveAnalysisResult({
          runId,
          agentType: type,
          model: analysis.model,
          summary: analysis.summary,
          signals: 'signals' in analysis ? analysis.signals : undefined,
          riskLevel: 'riskLevel' in analysis ? analysis.riskLevel : undefined,
          confidence: 'confidence' in analysis ? analysis.confidence
                    : 'globalRiskScore' in analysis ? analysis.globalRiskScore : undefined,
          keyInsights: 'keyTopics' in analysis ? analysis.keyTopics
                     : 'keyRisks' in analysis ? analysis.keyRisks
                     : 'macroTrends' in analysis ? analysis.macroTrends : undefined,
          costUsd: analysis.costUsd,
        });

        totalCostUsd += analysis.costUsd;

        if (type === 'financial') analyses.financial = analysis as FinancialAnalysis;
        if (type === 'sentiment') analyses.sentiment = analysis as SentimentAnalysis;
        if (type === 'macro')     analyses.macro     = analysis as MacroAnalysis;

        console.log(`[Orchestrator] ${type} agent done. Cost: $${analysis.costUsd.toFixed(5)}`);
      } else {
        console.error(`[Orchestrator] ${type} agent failed:`, result.reason);
      }
    }

    // Complete the run
    await completeCollectionRun(runId, {
      sourcesAttempted: totalAttempted,
      sourcesSucceeded: totalSucceeded,
      itemsCollected: allItems.length,
    });

    // Step 4: שמור אירוע בזיכרון + הפעל correlation tracking
    await Promise.allSettled([
      saveMemoryEvent({
        trigger: plan.trigger,
        reason: plan.reason,
        keywords,
        summary: analyses.financial?.summary ?? analyses.sentiment?.summary ?? plan.reason,
        correlationRunId: runId,
      }),
      recordCorrelation(runId, plan.trigger, plan.reason, 2),
      // נסה לסגור correlations ישנות שהגיע זמנן
      resolveMaturedCorrelations(),
    ]);

    const durationMs = Date.now() - startTime;
    console.log(`[Orchestrator] Done in ${durationMs}ms. Total cost: $${totalCostUsd.toFixed(5)}`);

    return {
      runId,
      trigger: plan.trigger,
      reason: plan.reason,
      itemsCollected: allItems.length,
      sourcesSucceeded: totalSucceeded,
      analyses,
      totalCostUsd,
      durationMs,
    };
  } catch (error) {
    await failCollectionRun(runId, String(error));
    throw error;
  }
}

// ── Quick status check ────────────────────────────────────────────────────────

export async function getCollectionStatus() {
  await initDataCollectionDb();
  return getLatestCollectionRun();
}
