/**
 * S-5 Multi-Region Cache Warmer
 * Main entry point and routing
 * 
 * Uses Durable Objects for regional cache warming.
 * Each DO instance runs in a specific region for better routing.
 */

import { REGIONS, DO_REGION_HINTS, REGION_ORDER } from './config.js';
import { getAllUrls } from './warmer.js';
import { getNextRegion, logError, getStatus, getHistoricalData } from './storage.js';
import { generateDashboard } from './dashboard.js';

// Export Durable Object class directly for wrangler
// Must be exported from main entry point for DO bindings to work
export { CacheWarmerDO } from './warmer-do.js';

/**
 * Call regional Durable Object for cache warming
 * Uses location hints to ensure DO runs in the target region
 */
async function callRegionalDO(env, regionName, urls, { testMode = false } = {}) {
  const targetHint = DO_REGION_HINTS[regionName];
  const targetColo = REGIONS[regionName]; // Used only for UI display/comparison

  if (!targetHint) {
    throw new Error(`No location hint defined for region: ${regionName}`);
  }

  // One object per region-hint ensures the instance is created near that region
  // Using location hint is KEY to regional placement!
  const id = env.CACHE_WARMER_DO.idFromName(`warm:${targetHint}`);
  const stub = env.CACHE_WARMER_DO.get(id, { locationHint: targetHint });

  console.log(`Routing to DO with location hint: ${targetHint} for region ${regionName} (target colo: ${targetColo})`);

  const body = {
    urls,
    regionName,
    targetHint,
    targetColo,
    totalUrls: env.__TOTAL_URLS__ || 0, // not used; we override below when known
    rateLimitMs: parseInt(env.RATE_LIMIT_MS) || 2000,
    cacheTtlSeconds: 14400,
    userAgent: 'S5-Cache-Warmer/1.0'
  };

  const res = await stub.fetch('https://do/warm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`DO warm failed (${regionName}/${targetHint}): ${res.status} - ${errorText}`);
  }

  let results;
  try {
    results = await res.json();
  } catch (parseError) {
    const text = await res.text();
    throw new Error(`Failed to parse DO response as JSON: ${parseError.message}. Response: ${text.substring(0, 200)}`);
  }
  
  if (!results || typeof results !== 'object') {
    throw new Error(`Invalid DO response: expected object, got ${typeof results}`);
  }
  
  // Ensure all required properties exist with fallbacks
  return {
    success: results.success ?? 0,
    failures: results.failures ?? 0,
    cacheHit: results.cacheHit ?? 0,
    cacheMiss: results.cacheMiss ?? 0,
    cacheExpired: results.cacheExpired ?? 0,
    cacheOther: results.cacheOther ?? 0,
    coloMatched: results.coloMatched ?? 0,
    coloMismatched: results.coloMismatched ?? 0,
    hitRate: results.hitRate ?? '0.00',
    coloMatchRate: results.coloMatchRate ?? '0.00',
    coloBreakdown: results.coloBreakdown ?? {},
    region: results.region ?? regionName,
    targetColo: results.targetColo ?? targetColo,
    duration: results.duration ?? '0.00s',
    urls: results.urls ?? [] // Include URLs if present
  };
}

export default {
  /**
   * Scheduled handler - runs on cron trigger
   * Routes cache warming to the appropriate Durable Object based on region
   */
  async scheduled(event, env, ctx) {
    const startTime = Date.now();
    console.log('=== Cache Warmer Execution Started ===');
    console.log('Trigger time:', new Date(event.scheduledTime).toISOString());
    console.log('Cron pattern:', event.cron);
    
    try {
      const region = await getNextRegion(env);
      const coloCode = REGIONS[region];
      
      console.log(`Target region: ${region} (${coloCode})`);
      
      // Get all URLs (in main Worker)
      const allUrls = await getAllUrls();
      console.log(`Total URLs discovered: ${allUrls.length}`);
      
      // Stash total URL count for DO to compute progress correctly
      env.__TOTAL_URLS__ = allUrls.length;
      
      // Track progress in KV
      const progressKey = `progress_${region}`;
      const lastIndex = parseInt(await env.CACHE_WARMER_KV.get(progressKey) || '0');
      
      const startIndex = lastIndex;
      const endIndex = Math.min(startIndex + parseInt(env.MAX_URLS_PER_RUN), allUrls.length);
      const urlsToWarm = allUrls.slice(startIndex, endIndex);
      
      const progress = ((endIndex / allUrls.length) * 100).toFixed(1);
      console.log(`Processing URLs ${startIndex + 1}-${endIndex} of ${allUrls.length} (${progress}% complete)`);
      
      // Route to Durable Object with location hint for regional placement
      let results;
      try {
        results = await callRegionalDO(env, region, urlsToWarm);
      } catch (error) {
        console.error(`Error calling DO for region ${region}:`, error);
        throw error;
      }
      
      // Validate results structure (after normalization, hitRate should always exist)
      if (!results) {
        console.error('No results returned from DO');
        throw new Error(`Durable Object returned no results`);
      }
      
      // Update progress
      const newIndex = endIndex >= allUrls.length ? 0 : endIndex;
      await env.CACHE_WARMER_KV.put(progressKey, newIndex.toString());
      
      if (newIndex === 0) {
        console.log(`✓ Completed full cycle for ${region}, resetting to start`);
      }
      
      console.log('=== Execution Summary ===');
      console.log(`Duration: ${results.duration || 'N/A'}`);
      console.log(`Success: ${results.success}, Failures: ${results.failures}`);
      console.log(`Cache Status - HIT: ${results.cacheHit}, MISS: ${results.cacheMiss}, EXPIRED: ${results.cacheExpired}`);
      console.log(`Hit Rate: ${results.hitRate}%`);
      console.log(`Colo Verification - Matched: ${results.coloMatched}, Mismatched: ${results.coloMismatched}`);
      console.log(`Colo Match Rate: ${results.coloMatchRate}%`);
      
    } catch (error) {
      console.error('!!! Fatal Error in Cache Warmer !!!');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      
      await logError('system', error, env);
      throw error;
    }
  },
  
  /**
   * HTTP handler - provides status endpoint and manual triggers
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Dashboard - visual interface
    if (url.pathname === '/dashboard') {
      const html = await generateDashboard(env);
      return new Response(html, {
        headers: { 
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache'
        }
      });
    }
    
    // Status - JSON API
    if (url.pathname === '/status') {
      const status = await getStatus(env);
      return new Response(JSON.stringify(status, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
    }
    
    // Historical data API
    if (url.pathname === '/history') {
      const region = url.searchParams.get('region');
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const history = await getHistoricalData(env, region, limit);
      return new Response(JSON.stringify(history, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
    }
    
    // Manual trigger for testing (processes fewer URLs to avoid timeout)
    if (url.pathname === '/trigger') {
      const testMode = url.searchParams.get('test') !== 'false'; // Default to test mode
      const urlCount = testMode ? 5 : parseInt(env.MAX_URLS_PER_RUN);
      
      console.log(`Manual trigger initiated (${testMode ? 'TEST' : 'FULL'} mode - ${urlCount} URLs)`);
      
      try {
        const region = await getNextRegion(env);
        const coloCode = REGIONS[region];
        
        console.log(`Target region: ${region} (${coloCode})`);
        
        const allUrls = await getAllUrls();
        
        // Stash total URL count for DO to compute progress correctly
        env.__TOTAL_URLS__ = allUrls.length;
        
        const urlsToWarm = allUrls.slice(0, urlCount);
        
        console.log(`Processing ${urlsToWarm.length} URLs for verification via Durable Object`);
        
        // Route to Durable Object with location hint for regional placement
        let results;
        try {
          results = await callRegionalDO(env, region, urlsToWarm, { testMode });
        } catch (error) {
          console.error(`Error calling DO for region ${region}:`, error);
          throw error;
        }
        
        // Validate results structure (after normalization, hitRate should always exist)
        if (!results) {
          console.error('No results returned from DO');
          throw new Error(`Durable Object returned no results`);
        }
        
        // Ensure all fields exist with safe defaults
        const safeResults = {
          success: results.success ?? 0,
          cacheHit: results.cacheHit ?? 0,
          cacheMiss: results.cacheMiss ?? 0,
          cacheExpired: results.cacheExpired ?? 0,
          hitRate: results.hitRate ?? '0.00',
          coloMatched: results.coloMatched ?? 0,
          coloMismatched: results.coloMismatched ?? 0,
          coloMatchRate: results.coloMatchRate ?? '0.00',
          coloBreakdown: results.coloBreakdown ?? {},
          duration: results.duration ?? '0.00s'
        };
        
        return new Response(JSON.stringify({
          message: 'Cache warming completed',
          region: results.region || region,
          targetColo: results.targetColo || REGIONS[region],
          duration: safeResults.duration,
          urlsProcessed: safeResults.success,
          cacheStats: {
            hit: safeResults.cacheHit,
            miss: safeResults.cacheMiss,
            expired: safeResults.cacheExpired,
            hitRate: typeof safeResults.hitRate === 'string' ? safeResults.hitRate : safeResults.hitRate + '%'
          },
          coloVerification: {
            matched: safeResults.coloMatched,
            mismatched: safeResults.coloMismatched,
            matchRate: typeof safeResults.coloMatchRate === 'string' ? safeResults.coloMatchRate : safeResults.coloMatchRate + '%',
            breakdown: safeResults.coloBreakdown
          },
          note: testMode ? `Test mode - 5 URLs` : `Full run (${env.MAX_URLS_PER_RUN})`
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error in manual trigger:', error);
        return new Response(JSON.stringify({
          error: error.message,
          stack: error.stack
        }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
       // Reset region rotation
       if (url.pathname === '/reset-region') {
         try {
           await env.CACHE_WARMER_KV.put('last_region_index', '-1');
           return new Response(JSON.stringify({
             message: 'Region rotation reset to start',
             nextRegion: REGION_ORDER[0] || 'Western North America'
           }, null, 2), {
             headers: { 'Content-Type': 'application/json' }
           });
         } catch (error) {
           return new Response(JSON.stringify({
             error: error.message
           }, null, 2), {
             status: 500,
             headers: { 'Content-Type': 'application/json' }
           });
         }
       }
       
       // Root - API documentation
       return new Response(`
S-5 Cache Warmer API

Endpoints:
  GET /dashboard           Visual dashboard with charts and statistics
  GET /status              JSON status of all regions
  GET /history             Historical execution data
    ?region=Canada         Filter by region
    &limit=100             Number of results (default: 100)
  GET /trigger             Manual trigger for testing (5 URLs by default)
  GET /trigger?test=false  Full run (${env.MAX_URLS_PER_RUN} URLs - may timeout on HTTP)
  GET /reset-region        Reset region rotation to start from Canada

Regions: ${Object.keys(REGIONS).join(', ')}

Configuration:
  - Cron: Runs every 6 hours automatically
  - Processes ${env.MAX_URLS_PER_RUN} URLs per cron execution
  - Rate limit: ${env.RATE_LIMIT_MS}ms between requests
  - Test mode: Processes 5 URLs for quick verification

Note: For production use, rely on the cron trigger. Manual /trigger is for testing only.
      `.trim(), {
        headers: { 'Content-Type': 'text/plain' }
      });
  }
};
