/**
 * KV storage operations for S-5 Cache Warmer
 * - Region rotation (round-robin)
 * - Persisting execution summaries
 * - Error logging
 * - Status & history aggregation for the dashboard
 */

import { REGIONS, REGION_ORDER } from './config.js';

/**
 * Determine which region to process next (round-robin).
 * Uses REGION_ORDER if provided, otherwise falls back to Object.keys(REGIONS).
 */
export async function getNextRegion(env) {
  const regionKeys = Array.isArray(REGION_ORDER) && REGION_ORDER.length > 0
    ? REGION_ORDER
    : Object.keys(REGIONS);

  if (regionKeys.length === 0) {
    throw new Error('No regions configured');
  }

  try {
    const lastIndexValue = await env.CACHE_WARMER_KV.get('last_region_index');
    const lastIndex = lastIndexValue !== null ? parseInt(lastIndexValue, 10) : -1;
    const nextIndex = (lastIndex + 1) % regionKeys.length;
    const nextRegion = regionKeys[nextIndex];

    await env.CACHE_WARMER_KV.put('last_region_index', String(nextIndex));
    return nextRegion;
  } catch (err) {
    console.error('Failed to read/write region index; defaulting to first region:', err);
    return regionKeys[0];
  }
}

/**
 * Persist a summarized result for a run.
 * The Durable Object already computes all metrics; we just store them.
 */
export async function storeResults(region, results, durationSeconds, env) {
  const timestamp = Date.now();
  const key = `results_${region}_${timestamp}`;

  const summary = {
    region,
    timestamp,
    timestampISO: new Date(timestamp).toISOString(),
    duration: Number(durationSeconds),

    // Core counters
    success: results.success || 0,
    failures: results.failures || 0,
    cacheHit: results.cacheHit || 0,
    cacheMiss: results.cacheMiss || 0,
    cacheExpired: results.cacheExpired || 0,
    cacheOther: results.cacheOther || 0,
    hitRate: results.hitRate || '0.00',

    // Exact colo verification
    coloMatched: results.coloMatched || 0,
    coloMismatched: results.coloMismatched || 0,
    coloMatchRate: results.coloMatchRate || '0.00',
    coloBreakdown: results.coloBreakdown || {},

    // Regional verification (optional, provided by DO when configured)
    regionMatched: results.regionMatched || 0,
    regionMismatched: results.regionMismatched || 0,
    regionMatchRate: results.regionMatchRate || '0.00',

    // For dashboard progress bars
    totalUrls: results.totalUrls || 0
  };

  // Keep 30 days of results
  await env.CACHE_WARMER_KV.put(key, JSON.stringify(summary), { expirationTtl: 60 * 60 * 24 * 30 });
  // Also store a "latest" pointer used by the dashboard status
  await env.CACHE_WARMER_KV.put(`latest_${region}`, JSON.stringify(summary));
}

/**
 * Log structured errors. Dashboard can read these later if needed.
 */
export async function logError(region, error, env) {
  const key = `error_${region}_${Date.now()}`;
  const payload = {
    region,
    error: error?.message || String(error),
    stack: error?.stack || null,
    timestamp: Date.now(),
    timestampISO: new Date().toISOString()
  };
  // Keep 7 days of errors
  await env.CACHE_WARMER_KV.put(key, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 7 });
}

/**
 * Get current status for all configured regions.
 * Reads the latest summary for each region + current progress cursor.
 */
export async function getStatus(env) {
  const regions = Object.keys(REGIONS);

  const status = {
    lastUpdated: new Date().toISOString(),
    regions: {}
  };

  for (const region of regions) {
    try {
      const [latestJson, progressStr] = await Promise.all([
        env.CACHE_WARMER_KV.get(`latest_${region}`),
        env.CACHE_WARMER_KV.get(`progress_${region}`)
      ]);

      let stats = null;
      if (latestJson) {
        try {
          stats = JSON.parse(latestJson);
        } catch (parseErr) {
          console.error(`Failed to parse latest stats for ${region}:`, parseErr);
        }
      }

      status.regions[region] = {
        stats,                                    // may be null if never run
        currentProgress: progressStr ?? '0',      // number as string; default 0
        coloCode: REGIONS[region]                 // representative colo for UI badge
      };
    } catch (err) {
      console.error(`Status error for region ${region}:`, err);
      status.regions[region] = {
        stats: null,
        currentProgress: '0',
        coloCode: REGIONS[region]
      };
    }
  }

  return status;
}

/**
 * Fetch historical execution data.
 * If region is null, aggregates across ALL regions.
 * `limit` caps the number of keys returned per region (KV-side).
 */
export async function getHistoricalData(env, region = null, limit = 100) {
  const targetRegions = region ? [region] : Object.keys(REGIONS);
  const allResults = [];

  for (const reg of targetRegions) {
    try {
      const prefix = `results_${reg}_`;
      const list = await env.CACHE_WARMER_KV.list({ prefix, limit });

      if (list && Array.isArray(list.keys)) {
        for (const k of list.keys) {
          const name = k.name || k;
          if (!name) continue;

          try {
            const data = await env.CACHE_WARMER_KV.get(name);
            if (data) {
              try {
                const parsed = JSON.parse(data);
                allResults.push(parsed);
              } catch (parseErr) {
                console.error(`Parse error for key ${name}:`, parseErr);
              }
            }
          } catch (getErr) {
            console.error(`KV get failed for key ${name}:`, getErr);
            // continue to next key
          }
        }
      }
    } catch (listErr) {
      console.error(`KV list failed for region ${reg}:`, listErr);
      // continue to next region
    }
  }

  // Sort newest-first
  allResults.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Aggregate totals for the dashboard header
  const totals = {
    totalExecutions: allResults.length,
    totalSuccess: allResults.reduce((s, r) => s + (r.success || 0), 0),
    totalFailures: allResults.reduce((s, r) => s + (r.failures || 0), 0),
    totalCacheHit: allResults.reduce((s, r) => s + (r.cacheHit || 0), 0),
    totalCacheMiss: allResults.reduce((s, r) => s + (r.cacheMiss || 0), 0),
    totalCacheExpired: allResults.reduce((s, r) => s + (r.cacheExpired || 0), 0),
    averageHitRate: (allResults.length > 0)
      ? (allResults.reduce((s, r) => s + (parseFloat(r.hitRate || '0') || 0), 0) / allResults.length).toFixed(2)
      : '0.00'
  };

  return {
    totals,
    results: allResults,
    regions: targetRegions
  };
}
