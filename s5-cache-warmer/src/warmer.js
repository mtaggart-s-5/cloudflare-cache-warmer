/**
 * Sitemap parsing and URL discovery
 * 
 * This file handles fetching and parsing sitemaps to discover URLs to warm.
 * Configuration (regions, sitemaps, location hints) is in config.js
 */

import { SITEMAPS } from './config.js';

/**
 * Fetch and parse all URLs from configured sitemaps
 */
export async function getAllUrls() {
  const allUrls = new Set();
  
  for (const sitemapUrl of SITEMAPS) {
    try {
      const urls = await parseSitemap(sitemapUrl);
      urls.forEach(url => allUrls.add(url));
    } catch (error) {
      console.error(`Error parsing ${sitemapUrl}:`, error.message);
    }
  }
  
  return Array.from(allUrls);
}

/**
 * Recursively parse XML sitemap
 */
async function parseSitemap(sitemapUrl) {
  const response = await fetch(sitemapUrl, {
    headers: {
      'User-Agent': 'S5-Cache-Warmer/1.0',
      'Accept': 'application/xml,text/xml'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sitemapUrl}: ${response.status}`);
  }
  
  const xml = await response.text();
  
  if (xml.includes('<sitemapindex')) {
    const sitemapUrls = extractUrls(xml);
    const allUrls = [];
    
    for (const nestedSitemapUrl of sitemapUrls) {
      try {
        const nestedUrls = await parseSitemap(nestedSitemapUrl);
        allUrls.push(...nestedUrls);
      } catch (error) {
        console.error(`Error parsing nested sitemap ${nestedSitemapUrl}:`, error.message);
      }
    }
    
    return allUrls;
  }
  
  return extractUrls(xml);
}

/**
 * Extract URLs from XML using regex
 */
function extractUrls(xml) {
  const urls = [];
  const regex = /<loc>(.*?)<\/loc>/g;
  let match;
  
  while ((match = regex.exec(xml)) !== null) {
    urls.push(match[1]);
  }
  
  return urls;
}

/**
 * NOTE: Cache warming logic has been moved to Durable Objects (warmer-do.js)
 * 
 * The warmUrls() function is no longer used - all cache warming now happens
 * through Durable Objects that run in specific regions for better routing.
 * 
 * See src/warmer-do.js for the current implementation.
 */