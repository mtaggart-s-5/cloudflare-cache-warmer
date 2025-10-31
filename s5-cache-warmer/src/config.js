/**
 * Configuration for S-5 Cache Warmer
 * Central location for all configuration constants.
 * - Sitemaps
 * - Region rotation (labels)
 * - DO location hints
 * - Representative POPs (IATA colos) per region for verification/UI
 *
 * Supported Durable Object locationHint values:
 * wnam, enam, sam, weur, eeur, apac, oc, afr, me
 * Ref: Cloudflare DO data location docs.
 */

export const SITEMAPS = [
  'https://www.s-5.com/sitemap_index.xml',
  'https://www.s-5.com/page-sitemap.xml',
  'https://www.s-5.com/product-sitemap.xml',
  'https://www.s-5.com/case-studies-sitemap.xml',
  'https://www.s-5.com/tribe_events-sitemap.xml',
  'https://www.s-5.com/product_cat-sitemap.xml',
  'https://es.s-5.com/sitemap_index.xml',
  'https://es.s-5.com/page-sitemap.xml',
  'https://es.s-5.com/products-sitemap.xml',
  'https://es.s-5.com/case-studies-sitemap.xml',
  'https://es.s-5.com/tribe_events-sitemap.xml',
];

/**
 * Rotation order (labels shown in the dashboard)
 * Covers ALL documented locationHint regions.
 */
export const REGION_ORDER = [
  'Western North America',
  'Eastern North America',
  'South America',
  'Western Europe',
  'Eastern Europe',
  'Middle East',
  'Africa',
  'Asia-Pacific',
  'Oceania',
];

/**
 * For UI display: a representative colo code for each region.
 * (Used as the “Target” badge — not a pin; DO runs near the hint.)
 */
export const REGIONS = {
  'Western North America': 'SFO',
  'Eastern North America': 'IAD',
  'South America': 'GRU',
  'Western Europe': 'AMS',
  'Eastern Europe': 'WAW',
  'Middle East': 'DXB',
  'Africa': 'JNB',
  'Asia-Pacific': 'SIN',
  'Oceania': 'SYD',
};

/**
 * Durable Object location hints per region label
 * (these are the only documented, supported hints)
 */
export const DO_REGION_HINTS = {
  'Western North America': 'wnam',
  'Eastern North America': 'enam',
  'South America': 'sam',
  'Western Europe': 'weur',
  'Eastern Europe': 'eeur',
  'Middle East': 'me',
  'Africa': 'afr',
  'Asia-Pacific': 'apac',
  'Oceania': 'oc',
};

/**
 * Optional helper for “regional match” verification.
 * If the CF-RAY colo suffix is in this list for the region, we count it
 * as a regional match in addition to exact-colo matching.
 * (Best-effort, not exhaustive.)
 */
export const REGION_COLOS = {
  'Western North America': ['SFO','LAX','SEA','SJC','DEN','PHX','LAS','YVR','YYC','SLC','PDX'],
  'Eastern North America': ['IAD','JFK','EWR','YYZ','YUL','ATL','MIA','BOS','ORD','DFW','CLT','DTW'],
  'South America': ['GRU','GIG','EZE','SCL','LIM','BOG','UIO','MVD'],
  'Western Europe': ['AMS','LHR','FRA','CDG','MAD','BRU','DUS','HAM','CPH','BCN','ZRH'],
  'Eastern Europe': ['WAW','PRG','BUD','OTP','VIE','RIX','VNO','TLL','BEG','SOF'],
  'Middle East': ['DXB','DOH','BAH','KWI','AMM','MCT','RUH','JED'],
  'Africa': ['JNB','CPT','NBO','CAI','CMN','LOS','ACC','DAR','TUN'],
  'Asia-Pacific': ['SIN','HKG','KUL','BKK','NRT','KIX','ICN','TPE','MNL','CGK'],
  'Oceania': ['SYD','MEL','BNE','AKL','PER','ADL','CBR'],
};
