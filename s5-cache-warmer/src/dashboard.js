/**
 * Dashboard HTML generation
 */

import { REGIONS } from './config.js';
import { getStatus, getHistoricalData } from './storage.js';

/**
 * Generate HTML dashboard
 */
export async function generateDashboard(env) {
  let status, history;
  
  try {
    status = await getStatus(env);
  } catch (error) {
    console.error('Failed to get status:', error);
    // Provide default status structure
    status = {
      lastUpdated: new Date().toISOString(),
      regions: {}
    };
    Object.keys(REGIONS).forEach(region => {
      status.regions[region] = {
        stats: null,
        currentProgress: '0',
        coloCode: REGIONS[region]
      };
    });
  }
  
  try {
    history = await getHistoricalData(env, null, 1000);
  } catch (error) {
    console.error('Failed to get historical data:', error);
    // Provide default history structure
    history = {
      totals: {
        totalExecutions: 0,
        totalSuccess: 0,
        totalFailures: 0,
        totalCacheHit: 0,
        totalCacheMiss: 0,
        totalCacheExpired: 0,
        averageHitRate: '0.00'
      },
      results: [],
      regions: []
    };
  }
  
  const regionData = {};
  Object.keys(REGIONS).forEach(region => {
    regionData[region] = (history.results || [])
      .filter(r => r.region === region)
      .slice(0, 30)
      .reverse();
  });
  
  // Calculate global colo statistics
  const globalColoStats = {
    totalMatched: 0,
    totalMismatched: 0,
    coloBreakdown: {}
  };
  
  // Calculate global regional match statistics
  const globalRegionStats = {
    totalRegionMatched: 0,
    totalRegionMismatched: 0
  };
  
  (history.results || []).forEach(result => {
    if (result.coloMatched) globalColoStats.totalMatched += result.coloMatched;
    if (result.coloMismatched) globalColoStats.totalMismatched += result.coloMismatched;
    
    if (result.regionMatched) globalRegionStats.totalRegionMatched += result.regionMatched;
    if (result.regionMismatched) globalRegionStats.totalRegionMismatched += result.regionMismatched;
    
    if (result.coloBreakdown) {
      Object.entries(result.coloBreakdown).forEach(([colo, count]) => {
        globalColoStats.coloBreakdown[colo] = (globalColoStats.coloBreakdown[colo] || 0) + count;
      });
    }
  });
  
  const totalColoRequests = globalColoStats.totalMatched + globalColoStats.totalMismatched;
  const totalRegionRequests = globalRegionStats.totalRegionMatched + globalRegionStats.totalRegionMismatched;
  const globalMatchRate = totalColoRequests > 0 
    ? ((globalColoStats.totalMatched / totalColoRequests) * 100).toFixed(2)
    : '0.00';
  const globalRegionMatchRate = totalRegionRequests > 0
    ? ((globalRegionStats.totalRegionMatched / totalRegionRequests) * 100).toFixed(2)
    : '0.00';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>S-5 Cache Warmer Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #0f1419;
      color: #e6edf3;
      line-height: 1.6;
      padding: 20px;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    header {
      background: #1c2128;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      margin-bottom: 30px;
      border: 1px solid #30363d;
    }
    
    h1 {
      color: #f0f6fc;
      font-size: 2.5em;
      margin-bottom: 10px;
      background: linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .subtitle {
      color: #8b949e;
      font-size: 1.1em;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .stat-card {
      background: #1c2128;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      border-left: 4px solid #58a6ff;
      border: 1px solid #30363d;
      border-left: 4px solid #58a6ff;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.4);
    }
    
    .stat-card.success {
      border-left-color: #3fb950;
    }
    
    .stat-card.warning {
      border-left-color: #d29922;
    }
    
    .stat-card.danger {
      border-left-color: #f85149;
    }
    
    .stat-label {
      color: #8b949e;
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    
    .stat-value {
      font-size: 2.5em;
      font-weight: bold;
      color: #f0f6fc;
    }
    
    .stat-subtext {
      color: #6e7681;
      font-size: 0.9em;
      margin-top: 5px;
    }
    
    .region-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .region-card {
      background: #1c2128;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      border: 1px solid #30363d;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .region-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.4);
    }
    
    .region-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #30363d;
    }
    
    .region-name {
      font-size: 1.3em;
      font-weight: bold;
      color: #f0f6fc;
    }
    
    .region-code {
      background: #30363d;
      padding: 5px 12px;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      color: #58a6ff;
      font-size: 0.9em;
      border: 1px solid #484f58;
    }
    
    .progress-bar {
      background: #30363d;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      margin: 15px 0;
    }
    
    .progress-fill {
      background: linear-gradient(90deg, #58a6ff, #bc8cff);
      height: 100%;
      transition: width 0.3s ease;
    }
    
    .metrics {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-top: 20px;
    }
    
    .metric {
      padding: 12px;
      background: #0d1117;
      border-radius: 8px;
      border: 1px solid #30363d;
    }
    
    .metric-label {
      font-size: 0.85em;
      color: #8b949e;
      margin-bottom: 5px;
    }
    
    .metric-value {
      font-size: 1.4em;
      font-weight: bold;
      color: #f0f6fc;
    }
    
    .hit-rate {
      color: #3fb950;
    }
    
    .miss-rate {
      color: #d29922;
    }
    
    .colo-breakdown {
      margin-top: 15px;
      padding: 15px;
      background: #0d1117;
      border-radius: 8px;
      border: 1px solid #30363d;
    }
    
    .colo-breakdown-title {
      font-size: 0.9em;
      color: #8b949e;
      margin-bottom: 10px;
      font-weight: 600;
    }
    
    .colo-breakdown-table {
      width: 100%;
      font-size: 0.85em;
    }
    
    .colo-breakdown-table td {
      padding: 6px 0;
      border: none;
    }
    
    .colo-breakdown-table td:first-child {
      color: #79c0ff;
      font-family: 'Courier New', monospace;
      font-weight: 600;
    }
    
    .colo-breakdown-table td:last-child {
      text-align: right;
      color: #e6edf3;
      font-weight: 600;
    }
    
    .colo-target {
      color: #3fb950;
    }
    
    .colo-mismatch {
      color: #d29922;
    }
    
    .history-table {
      background: #1c2128;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      overflow-x: auto;
      border: 1px solid #30363d;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th {
      background: #0d1117;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #f0f6fc;
      border-bottom: 2px solid #30363d;
    }
    
    td {
      padding: 12px;
      border-bottom: 1px solid #30363d;
      color: #e6edf3;
    }
    
    tr:hover {
      background: #161b22;
    }
    
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 600;
    }
    
    .badge-success {
      background: #1a472a;
      color: #3fb950;
      border: 1px solid #2ea043;
    }
    
    .badge-warning {
      background: #3d2e00;
      color: #d29922;
      border: 1px solid #9e6a03;
    }
    
    .badge-info {
      background: #0c2d6b;
      color: #58a6ff;
      border: 1px solid #1f6feb;
    }
    
    .refresh-btn {
      background: linear-gradient(135deg, #1f6feb 0%, #7c3aed 100%);
      color: white;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1em;
      font-weight: 600;
      transition: all 0.2s;
      margin-top: 15px;
      box-shadow: 0 4px 6px rgba(31, 111, 235, 0.3);
    }
    
    .refresh-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(31, 111, 235, 0.4);
    }
    
    .refresh-btn:active {
      transform: translateY(0);
    }
    
    .control-panel {
      background: #1c2128;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      border: 1px solid #30363d;
      margin-bottom: 30px;
    }
    
    .control-panel h2 {
      margin: 0 0 20px 0;
      color: #f0f6fc;
    }
    
    .button-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 15px;
    }
    
    .action-btn {
      background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
      color: white;
      padding: 14px 20px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.95em;
      font-weight: 600;
      transition: all 0.2s;
      box-shadow: 0 2px 4px rgba(35, 134, 54, 0.3);
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    .action-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(35, 134, 54, 0.4);
    }
    
    .action-btn:active {
      transform: translateY(0);
    }
    
    .action-btn.secondary {
      background: linear-gradient(135deg, #1f6feb 0%, #388bfd 100%);
      box-shadow: 0 2px 4px rgba(31, 111, 235, 0.3);
    }
    
    .action-btn.secondary:hover {
      box-shadow: 0 4px 8px rgba(31, 111, 235, 0.4);
    }
    
    .action-btn.warning {
      background: linear-gradient(135deg, #9e6a03 0%, #d29922 100%);
      box-shadow: 0 2px 4px rgba(158, 106, 3, 0.3);
    }
    
    .action-btn.warning:hover {
      box-shadow: 0 4px 8px rgba(158, 106, 3, 0.4);
    }
    
    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
      box-shadow: none !important;
    }
    
    .action-btn:disabled:hover {
      transform: none;
      box-shadow: none;
    }
    
    .btn-title {
      font-size: 1em;
      font-weight: 700;
    }
    
    .btn-desc {
      font-size: 0.8em;
      opacity: 0.9;
      font-weight: 400;
    }
    
    .loading-indicator {
      display: none;
      position: fixed;
      top: 20px;
      right: 20px;
      background: #238636;
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
    }
    
    .loading-indicator.show {
      display: block;
    }
    
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    .timestamp {
      color: #6e7681;
      font-size: 0.9em;
    }
    
    h2 {
      color: #f0f6fc;
    }
    
    code {
      background: #0d1117;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      color: #79c0ff;
      border: 1px solid #30363d;
    }
    
    ul {
      list-style: none;
      line-height: 2;
    }
    
    li {
      color: #e6edf3;
    }
    
    .api-docs {
      margin-top: 30px;
      padding: 20px;
      background: #1c2128;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      border: 1px solid #30363d;
    }
    
    .api-docs h3 {
      color: #f0f6fc;
      margin-bottom: 15px;
    }
    
    @media (max-width: 768px) {
      .stats-grid, .region-grid {
        grid-template-columns: 1fr;
      }
      
      .metrics {
        grid-template-columns: 1fr;
      }
    }
    
    /* Scrollbar styling for dark mode */
    ::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }
    
    ::-webkit-scrollbar-track {
      background: #0d1117;
    }
    
    ::-webkit-scrollbar-thumb {
      background: #30363d;
      border-radius: 6px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: #484f58;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🚀 S-5 Cache Warmer Dashboard</h1>
      <p class="subtitle">Multi-region cache performance monitoring</p>
      <p class="timestamp">Last updated: ${status.lastUpdated}</p>
      <button class="refresh-btn" onclick="location.reload()">🔄 Refresh Data</button>
    </header>
    
    <div class="loading-indicator" id="loadingIndicator">
      ⏳ Processing...
    </div>
    
    <div class="control-panel">
      <h2>⚡ Quick Actions</h2>
      <div class="button-grid">
        <button class="action-btn" id="testRunBtn" onclick="triggerTest()">
          <span class="btn-title">🧪 Test Run</span>
          <span class="btn-desc">Warm 5 URLs for quick verification</span>
        </button>
        
        <button class="action-btn warning" id="fullRunBtn" onclick="triggerFull()">
          <span class="btn-title">🔥 Full Run</span>
          <span class="btn-desc">Warm 250 URLs (may timeout)</span>
        </button>
        
        <button class="action-btn secondary" id="statusBtn" onclick="openStatus()">
          <span class="btn-title">📊 View Status JSON</span>
          <span class="btn-desc">Raw status data for all regions</span>
        </button>
        
        <button class="action-btn secondary" id="historyBtn" onclick="openHistory()">
          <span class="btn-title">📜 View History JSON</span>
          <span class="btn-desc">Historical execution data</span>
        </button>
        
        <button class="action-btn secondary" id="filterHistoryBtn" onclick="openHistoryFiltered()">
          <span class="btn-title">🔍 Filter History</span>
          <span class="btn-desc">View history by region</span>
        </button>
        
        <button class="action-btn secondary" id="refreshBtn" onclick="location.reload()">
          <span class="btn-title">🔄 Refresh Dashboard</span>
          <span class="btn-desc">Reload latest data</span>
        </button>
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card success">
        <div class="stat-label">Total Executions</div>
        <div class="stat-value">${history.totals.totalExecutions}</div>
        <div class="stat-subtext">Across all regions</div>
      </div>
      
      <div class="stat-card success">
        <div class="stat-label">Total URLs Warmed</div>
        <div class="stat-value">${history.totals.totalSuccess.toLocaleString()}</div>
        <div class="stat-subtext">${history.totals.totalFailures} failures</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-label">Cache Hits</div>
        <div class="stat-value">${history.totals.totalCacheHit.toLocaleString()}</div>
        <div class="stat-subtext">${history.totals.totalCacheMiss} misses, ${history.totals.totalCacheExpired} expired</div>
      </div>
      
      <div class="stat-card success">
        <div class="stat-label">Average Hit Rate</div>
        <div class="stat-value">${history.totals.averageHitRate}%</div>
        <div class="stat-subtext">Overall performance</div>
      </div>
    </div>
    
    ${Object.keys(globalColoStats.coloBreakdown).length > 0 ? `
    <div style="margin-top: 30px; background: #1c2128; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 1px solid #30363d;">
      <h2 style="margin: 0 0 20px 0;">🌍 Global Colo Verification</h2>
      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 25px;">
        <div>
          <div class="stat-card" style="margin-bottom: 15px;">
            <div class="stat-label">Global Match Rate</div>
            <div class="stat-value" style="color: ${parseFloat(globalMatchRate) > 70 ? '#3fb950' : parseFloat(globalMatchRate) > 50 ? '#d29922' : '#f85149'};">${globalMatchRate}%</div>
            <div class="stat-subtext">${globalColoStats.totalMatched.toLocaleString()} matched / ${totalColoRequests.toLocaleString()} total</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Target Regions</div>
            <div class="stat-value">${Object.keys(REGIONS).length}</div>
            <div class="stat-subtext">Round-robin rotation</div>
          </div>
        </div>
        <div>
          <h3 style="color: #8b949e; font-size: 0.9em; margin-bottom: 15px; font-weight: 600;">REQUESTS BY COLO</h3>
          <div style="background: #0d1117; padding: 15px; border-radius: 8px; border: 1px solid #30363d;">
            <table style="width: 100%;">
              ${Object.entries(globalColoStats.coloBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([colo, count]) => {
                  const percentage = ((count / totalColoRequests) * 100).toFixed(1);
                  const isTargetColo = Object.values(REGIONS).includes(colo);
                  return `
                    <tr>
                      <td style="padding: 8px 0; color: ${isTargetColo ? '#3fb950' : '#d29922'}; font-family: 'Courier New', monospace; font-weight: 600; font-size: 0.95em;">
                        ${colo} ${isTargetColo ? '✓' : ''}
                      </td>
                      <td style="padding: 8px 0; text-align: right; color: #e6edf3;">
                        ${count.toLocaleString()}
                      </td>
                      <td style="padding: 8px 0; text-align: right; color: #8b949e; width: 60px;">
                        ${percentage}%
                      </td>
                    </tr>
                  `;
                }).join('')}
            </table>
            ${Object.keys(globalColoStats.coloBreakdown).length > 10 ? `
              <p style="color: #6e7681; font-size: 0.85em; margin: 10px 0 0 0; text-align: center;">
                Showing top 10 of ${Object.keys(globalColoStats.coloBreakdown).length} colos
              </p>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
    ` : ''}
    
    ${totalRegionRequests > 0 ? `
    <div style="margin-top: 30px; background: #1c2128; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 1px solid #30363d;">
      <h2 style="margin: 0 0 20px 0;">🌐 Global Regional Match Verification</h2>
      <div style="display: grid; grid-template-columns: 1fr; gap: 25px;">
        <div>
          <div class="stat-card" style="margin-bottom: 15px;">
            <div class="stat-label">Global Region Match Rate</div>
            <div class="stat-value" style="color: ${parseFloat(globalRegionMatchRate) > 70 ? '#3fb950' : parseFloat(globalRegionMatchRate) > 50 ? '#d29922' : '#f85149'};">${globalRegionMatchRate}%</div>
            <div class="stat-subtext">${globalRegionStats.totalRegionMatched.toLocaleString()} matched / ${totalRegionRequests.toLocaleString()} total</div>
            <div class="stat-subtext" style="margin-top: 8px; font-size: 0.75em; color: #6e7681;">
              Matches based on regional proximity (not exact colo match)
            </div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}
    
    <h2 style="margin: 30px 0 20px 0;">Regional Performance</h2>
    
    <div class="region-grid">
      ${Object.keys(REGIONS).map(region => {
        const regionStats = status.regions[region] || {};
        const stats = regionStats?.stats || null;
        const progress = regionStats?.currentProgress || '0';
        const totalUrls = stats?.totalUrls || 0;
        const progressPercent = totalUrls > 0 
          ? ((parseInt(progress) / totalUrls) * 100).toFixed(1)
          : '0.0';
        
        // Safe accessors with fallbacks
        const hitRate = stats?.hitRate || '0.00';
        const cacheHit = stats?.cacheHit || 0;
        const cacheMiss = stats?.cacheMiss || 0;
        const timestamp = stats?.timestamp ? new Date(stats.timestamp).toLocaleDateString() : 'Never';
        const coloMatchRate = stats?.coloMatchRate || '0.00';
        const regionMatchRate = stats?.regionMatchRate || '0.00';
        const coloBreakdown = stats?.coloBreakdown || {};
        
        return `
        <div class="region-card">
          <div class="region-header">
            <div class="region-name">${region}</div>
            <div class="region-code">${regionStats.coloCode || 'N/A'}</div>
          </div>
          
          ${stats ? `
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <div class="stat-subtext">Progress: ${progress}/${totalUrls || '…'} URLs (${progressPercent}%)</div>
            
            <div class="metrics">
              <div class="metric">
                <div class="metric-label">Hit Rate</div>
                <div class="metric-value hit-rate">${hitRate}%</div>
              </div>
              <div class="metric">
                <div class="metric-label">Last Run</div>
                <div class="metric-value" style="font-size: 1em;">${timestamp}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Cache Hits</div>
                <div class="metric-value">${cacheHit}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Cache Misses</div>
                <div class="metric-value miss-rate">${cacheMiss}</div>
              </div>
            </div>
            
            ${Object.keys(coloBreakdown).length > 0 ? `
              <div class="colo-breakdown">
                <div class="colo-breakdown-title">📍 Colo Verification (Target: ${regionStats.coloCode || 'N/A'})</div>
                <table class="colo-breakdown-table">
                  ${Object.entries(coloBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([colo, count]) => {
                      const isTarget = colo === (regionStats.coloCode || '');
                      const success = stats?.success || 1;
                      const percentage = ((count / success) * 100).toFixed(1);
                      return `
                        <tr>
                          <td class="${isTarget ? 'colo-target' : 'colo-mismatch'}">${colo} ${isTarget ? '✓' : ''}</td>
                          <td>${count} (${percentage}%)</td>
                        </tr>
                      `;
                    }).join('')}
                  <tr style="border-top: 1px solid #30363d; padding-top: 8px;">
                    <td style="color: #8b949e;">Match Rate:</td>
                    <td style="color: ${parseFloat(coloMatchRate) > 70 ? '#3fb950' : '#d29922'};">${coloMatchRate}%</td>
                  </tr>
                  <tr>
                    <td style="color: #8b949e;">Region Match:</td>
                    <td style="color: ${parseFloat(regionMatchRate || '0') > 70 ? '#3fb950' : '#d29922'};">
                      ${regionMatchRate || '0.00'}%
                    </td>
                  </tr>
                </table>
              </div>
            ` : coloMatchRate !== '0.00' || regionMatchRate !== '0.00' ? `
              <div class="colo-breakdown">
                <div class="colo-breakdown-title">📍 Colo Verification</div>
                <p style="color: #8b949e; font-size: 0.85em; margin: 0;">
                  Match Rate: <span style="color: ${parseFloat(coloMatchRate) > 70 ? '#3fb950' : '#d29922'}; font-weight: 600;">${coloMatchRate}%</span>
                  ${regionMatchRate !== '0.00' ? ` | Region Match: <span style="color: ${parseFloat(regionMatchRate) > 70 ? '#3fb950' : '#d29922'}; font-weight: 600;">${regionMatchRate}%</span>` : ''}
                </p>
              </div>
            ` : ''}
          ` : `
            <p style="color: #6e7681; text-align: center; padding: 20px;">No data yet</p>
          `}
        </div>
        `;
      }).join('')}
    </div>
    
    <h2 style="margin: 30px 0 20px 0;">Execution History</h2>
    
    <div class="history-table">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Region</th>
            <th>Duration</th>
            <th>URLs Warmed</th>
            <th>Cache Hit Rate</th>
            <th>Colo Match Rate</th>
            <th>Cache Hits</th>
            <th>Cache Misses</th>
            <th>Expired</th>
            <th>Failures</th>
          </tr>
        </thead>
        <tbody>
          ${(history.results || []).slice(0, 50).map(result => {
            // Safe property access with fallbacks
            const safeResult = {
              timestamp: result?.timestamp || Date.now(),
              region: result?.region || 'Unknown',
              duration: result?.duration || 0,
              success: result?.success || 0,
              failures: result?.failures || 0,
              hitRate: result?.hitRate || '0.00',
              coloMatchRate: result?.coloMatchRate || '0.00',
              cacheHit: result?.cacheHit || 0,
              cacheMiss: result?.cacheMiss || 0,
              cacheExpired: result?.cacheExpired || 0
            };
            
            const timestamp = new Date(safeResult.timestamp);
            const formattedTime = timestamp.toLocaleString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short'
            });
            
            let duration = '-';
            if (safeResult.duration) {
              if (safeResult.duration < 60) {
                duration = safeResult.duration.toFixed(1) + 's';
              } else {
                const mins = Math.floor(safeResult.duration / 60);
                const secs = Math.floor(safeResult.duration % 60);
                duration = mins + 'm ' + secs + 's';
              }
            }
            
            const coloMatchBadge = safeResult.coloMatchRate 
              ? '<span class="badge ' + (parseFloat(safeResult.coloMatchRate) > 70 ? 'badge-success' : 'badge-warning') + '">' + safeResult.coloMatchRate + '%</span>'
              : '<span style="color: #6e7681;">-</span>';
            
            const failureBadge = safeResult.failures > 0 
              ? '<span class="badge badge-warning">' + safeResult.failures + '</span>'
              : '0';
            
            return `
              <tr>
                <td class="timestamp">${formattedTime}</td>
                <td><span class="badge badge-info">${safeResult.region}</span></td>
                <td>${duration}</td>
                <td>${safeResult.success}</td>
                <td><span class="badge badge-success">${safeResult.hitRate}%</span></td>
                <td>${coloMatchBadge}</td>
                <td>${safeResult.cacheHit}</td>
                <td>${safeResult.cacheMiss}</td>
                <td>${safeResult.cacheExpired}</td>
                <td>${failureBadge}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="api-docs">
      <h3>📚 API Endpoints Reference</h3>
      <ul>
        <li><code>GET /dashboard</code> - This visual dashboard</li>
        <li><code>GET /status</code> - JSON status of all regions</li>
        <li><code>GET /history</code> - Historical execution data</li>
        <li><code>GET /history?region=Canada&limit=100</code> - Filtered historical data</li>
        <li><code>GET /trigger</code> - Manual test trigger (5 URLs)</li>
        <li><code>GET /trigger?test=false</code> - Manual full trigger (250 URLs)</li>
      </ul>
    </div>
  </div>
  
  <script>
    // Track if an operation is in progress
    let operationInProgress = false;
    
    // Enable/disable ALL action buttons
    // Prevents any interference with running operations
    function setButtonsEnabled(enabled) {
      const buttons = [
        'testRunBtn',
        'fullRunBtn',
        'statusBtn',
        'historyBtn',
        'filterHistoryBtn',
        'refreshBtn'
      ];
      
      buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.disabled = !enabled;
      });
      
      operationInProgress = !enabled;
    }
    
    // Show loading indicator
    function showLoading(message = '⏳ Processing...') {
      const indicator = document.getElementById('loadingIndicator');
      indicator.textContent = message;
      indicator.classList.add('show');
    }
    
    // Hide loading indicator
    function hideLoading() {
      const indicator = document.getElementById('loadingIndicator');
      indicator.classList.remove('show');
    }
    
    // Trigger test run (5 URLs)
    async function triggerTest() {
      // Prevent multiple simultaneous requests
      if (operationInProgress) {
        console.log('Operation already in progress, ignoring click');
        return;
      }
      
      setButtonsEnabled(false);
      showLoading('🧪 Running test (5 URLs)...');
      
      try {
        const response = await fetch('/trigger');
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error('Request failed: ' + response.status + ' - ' + errorText);
        }
        
        const data = await response.json();
        
        // Validate response structure
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response: expected object');
        }
        
        // Ensure all required fields exist with fallbacks
        if (!data.cacheStats) data.cacheStats = {};
        if (!data.coloVerification) data.coloVerification = {};
        
        data.cacheStats.hitRate = data.cacheStats.hitRate || '0.00';
        data.coloVerification.matchRate = data.coloVerification.matchRate || '0.00';
        data.urlsProcessed = data.urlsProcessed || 0;
        data.duration = data.duration || '0.00s';
        data.region = data.region || 'Unknown';
        data.targetColo = data.targetColo || 'UNKNOWN';
        
        // Open results in new tab
        const resultsWindow = window.open('', '_blank');
        resultsWindow.document.write(\`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Test Run Results</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #0f1419;
                color: #e6edf3;
                padding: 40px;
                line-height: 1.6;
              }
              pre { 
                background: #1c2128;
                padding: 20px;
                border-radius: 8px;
                overflow-x: auto;
                border: 1px solid #30363d;
              }
              h1 { color: #3fb950; }
              .summary { 
                background: #1c2128;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                border: 1px solid #30363d;
              }
              .stat { margin: 10px 0; }
              .label { color: #8b949e; }
              .value { color: #58a6ff; font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>✅ Test Run Completed</h1>
            <div class="summary">
              <div class="stat"><span class="label">Region:</span> <span class="value">\${data.region} (\${data.targetColo})</span></div>
              <div class="stat"><span class="label">Duration:</span> <span class="value">\${data.duration}</span></div>
              <div class="stat"><span class="label">URLs Processed:</span> <span class="value">\${data.urlsProcessed}</span></div>
              <div class="stat"><span class="label">Cache Hit Rate:</span> <span class="value">\${data.cacheStats.hitRate}</span></div>
              <div class="stat"><span class="label">Colo Match Rate:</span> <span class="value" style="color: \${parseFloat(data.coloVerification.matchRate) > 70 ? '#3fb950' : '#d29922'}">\${data.coloVerification.matchRate}</span></div>
            </div>
            <h2>Full Response:</h2>
            <pre>\${JSON.stringify(data, null, 2)}</pre>
            <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #238636; color: white; border: none; border-radius: 6px; cursor: pointer;">Close</button>
          </body>
          </html>
        \`);
        
        hideLoading();
        setButtonsEnabled(true);
        
        // Reload dashboard after 2 seconds to show updated data
        setTimeout(() => location.reload(), 2000);
      } catch (error) {
        hideLoading();
        setButtonsEnabled(true);
        alert('Error: ' + error.message);
      }
    }
    
    // Trigger full run (250 URLs)
    async function triggerFull() {
      // Prevent multiple simultaneous requests
      if (operationInProgress) {
        console.log('Operation already in progress, ignoring click');
        return;
      }
      
      if (!confirm('Full run processes 250 URLs and may take 8-10 minutes or timeout on HTTP requests. Continue?')) {
        return;
      }
      
      setButtonsEnabled(false);
      showLoading('🔥 Running full cache warming (250 URLs)...');
      
      try {
        const response = await fetch('/trigger?test=false');
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error('Request failed: ' + response.status + ' - ' + errorText);
        }
        
        const data = await response.json();
        
        // Validate response structure
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response: expected object');
        }
        
        // Ensure all required fields exist with fallbacks
        if (!data.cacheStats) data.cacheStats = {};
        if (!data.coloVerification) data.coloVerification = {};
        
        data.cacheStats.hitRate = data.cacheStats.hitRate || '0.00';
        data.coloVerification.matchRate = data.coloVerification.matchRate || '0.00';
        data.urlsProcessed = data.urlsProcessed || 0;
        data.duration = data.duration || '0.00s';
        data.region = data.region || 'Unknown';
        data.targetColo = data.targetColo || 'UNKNOWN';
        
        // Open results in new tab
        const resultsWindow = window.open('', '_blank');
        resultsWindow.document.write(\`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Full Run Results</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #0f1419;
                color: #e6edf3;
                padding: 40px;
                line-height: 1.6;
              }
              pre { 
                background: #1c2128;
                padding: 20px;
                border-radius: 8px;
                overflow-x: auto;
                border: 1px solid #30363d;
              }
              h1 { color: #3fb950; }
            </style>
          </head>
          <body>
            <h1>\${response.ok ? '✅ Full Run Completed' : '⚠️ Run Completed with Warnings'}</h1>
            <pre>\${JSON.stringify(data, null, 2)}</pre>
            <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #238636; color: white; border: none; border-radius: 6px; cursor: pointer;">Close</button>
          </body>
          </html>
        \`);
        
        hideLoading();
        setButtonsEnabled(true);
        
        // Reload dashboard after 2 seconds
        setTimeout(() => location.reload(), 2000);
      } catch (error) {
        hideLoading();
        setButtonsEnabled(true);
        alert('Error: ' + error.message + '\\n\\nNote: Full runs may timeout on HTTP requests. Use cron triggers for production.');
      }
    }
    
    // Open status JSON in new tab
    function openStatus() {
      window.open('/status', '_blank');
    }
    
    // Open history JSON in new tab
    function openHistory() {
      window.open('/history', '_blank');
    }
    
    // Open history with region filter
    function openHistoryFiltered() {
      const regions = ${JSON.stringify(Object.keys(REGIONS))};
      const region = prompt('Enter region to filter by:\\n\\n' + regions.join('\\n') + '\\n\\nOr leave blank for all regions:');
      
      if (region === null) return; // User cancelled
      
      const limit = prompt('Number of results to show (default: 100):', '100');
      
      let url = '/history';
      const params = new URLSearchParams();
      
      if (region && region.trim()) {
        params.append('region', region.trim());
      }
      if (limit && limit.trim()) {
        params.append('limit', limit.trim());
      }
      
      if (params.toString()) {
        url += '?' + params.toString();
      }
      
      window.open(url, '_blank');
    }
  </script>
</body>
</html>`;
}