import { storeResults } from './storage.js';
import { REGION_COLOS } from './config.js';

export class CacheWarmerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/warm') return this.handleWarm(request);
    if (url.pathname === '/status') return this.handleStatus();
    return new Response('Not Found', { status: 404 });
  }

  async handleWarm(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const startTime = Date.now();
    const body = await request.json();
    const {
      urls = [],
      regionName = 'Unknown',
      targetHint = 'unknown',
      targetColo = 'UNKNOWN',
      totalUrls = 0,                               // NEW: from orchestrator
      rateLimitMs = parseInt(this.env.RATE_LIMIT_MS) || 2000,
      cacheTtlSeconds = 14400,
      userAgent = 'S5-Cache-Warmer/1.0'
    } = body;

    const regionColos = REGION_COLOS[regionName] || [];

    const results = {
      success: 0,
      failures: 0,
      cacheHit: 0,
      cacheMiss: 0,
      cacheExpired: 0,
      cacheOther: 0,

      // Exact colo verification (existing)
      coloMatched: 0,
      coloMismatched: 0,

      // NEW: regional verification
      regionMatched: 0,
      regionMismatched: 0,

      hitRate: '0.00',
      coloMatchRate: '0.00',
      regionMatchRate: '0.00',

      coloBreakdown: {},
      urls: [],
      totalUrls                       // persist for progress display
    };

    for (const urlToWarm of urls) {
      try {
        const response = await fetch(urlToWarm, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          cf: {
            cacheEverything: true,
            cacheTtlByStatus: {
              '200-299': cacheTtlSeconds,
              '404': 300,
              '500-599': 0
            }
          }
        });

        const cacheStatus = response.headers.get('CF-Cache-Status') || response.headers.get('cf-cache-status') || 'UNKNOWN';
        const cfRay = response.headers.get('CF-RAY') || response.headers.get('cf-ray') || 'UNKNOWN';
        const actualColo = cfRay.includes('-') ? cfRay.split('-').pop() : 'UNKNOWN';

        // Tally cache status
        switch (cacheStatus) {
          case 'HIT': results.cacheHit++; break;
          case 'MISS': results.cacheMiss++; break;
          case 'EXPIRED': results.cacheExpired++; break;
          default: results.cacheOther++;
        }

        // Exact colo match (for UI badge)
        const exactColoMatch = actualColo === targetColo;
        if (actualColo !== 'UNKNOWN') {
          results.coloBreakdown[actualColo] = (results.coloBreakdown[actualColo] || 0) + 1;
          exactColoMatch ? results.coloMatched++ : results.coloMismatched++;
        }

        // NEW: regional match
        const regionalMatch = actualColo !== 'UNKNOWN' && regionColos.includes(actualColo);
        regionalMatch ? results.regionMatched++ : results.regionMismatched++;

        results.urls.push({
          url: urlToWarm,
          status: response.status,
          cacheStatus,
          cfRay,
          targetColo,
          actualColo,
          coloMatch: exactColoMatch,
          regionalMatch,
          timestamp: Date.now()
        });

        results.success++;
        await response.text(); // drain

      } catch (error) {
        results.failures++;
        results.urls.push({ url: urlToWarm, error: error.message, timestamp: Date.now() });
      }

      await new Promise(r => setTimeout(r, rateLimitMs));
    }

    // Rates
    const totalCached = results.cacheHit + results.cacheExpired;
    results.hitRate = results.success ? ((totalCached / results.success) * 100).toFixed(2) : '0.00';
    const coloChecks = results.coloMatched + results.coloMismatched;
    const regionChecks = results.regionMatched + results.regionMismatched;
    results.coloMatchRate   = coloChecks   ? ((results.coloMatched   / coloChecks)   * 100).toFixed(2) : '0.00';
    results.regionMatchRate = regionChecks ? ((results.regionMatched / regionChecks) * 100).toFixed(2) : '0.00';

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await storeResults(regionName, results, duration, this.env);

    return new Response(JSON.stringify({
      region: regionName,
      targetColo,
      duration: duration + 's',
      ...results
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  async handleStatus() {
    return new Response(JSON.stringify({ doId: this.state.id.toString(), message: 'WarmerDO ready' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
