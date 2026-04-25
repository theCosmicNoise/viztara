/**
 * Tutorial search client.
 *
 * Call priority:
 *   1. If user has configured their own Brave key: use that directly
 *      (privacy-preserving, bypasses our proxy, uses their quota)
 *   2. Otherwise: call our hosted Cloudflare Worker proxy which does the
 *      search on the user's behalf using a shared Serper key. This is the
 *      default path for Chrome Web Store installs — zero setup required.
 *
 * The proxy handles CORS, caching, domain filtering, and ranking. The client
 * just sends a query string and gets back cleaned, ranked results.
 */

import type { Tutorial } from './tutorials';

// The default search proxy URL. This is a Cloudflare Worker that fronts the
// Serper API so end-users don't need to sign up for a search API themselves.
// To deploy your own instance, see `proxy/README.md`.
//
// Read from VITE_SEARCH_PROXY_URL at build time (see .env.example). The
// fallback `example.workers.dev` placeholder is intentionally invalid — if
// you forgot to set up the env var, the extension will silently fall back
// to Tableau's official docs (still useful) instead of hitting a real URL.
const DEFAULT_SEARCH_PROXY =
  import.meta.env.VITE_SEARCH_PROXY_URL ??
  'https://tableau-lens-proxy.example.workers.dev';

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

const TRUSTED_DOMAINS = [
  'help.tableau.com',
  'www.flerlagetwins.com',
  'flerlagetwins.com',
  'playfairdata.com',
  'www.thedataschool.co.uk',
  'thedataschool.co.uk',
  'www.theinformationlab.co.uk',
  'theinformationlab.co.uk',
  'vizwiz.com',
  'www.vizwiz.com',
  'tableau.com',
  'www.tableau.com',
];

function prettySource(domain: string): string {
  const d = domain.replace(/^www\./, '').toLowerCase();
  if (d.includes('flerlagetwins')) return 'Flerlage Twins';
  if (d.includes('playfairdata')) return 'Playfair Data';
  if (d.includes('thedataschool')) return 'The Data School';
  if (d.includes('theinformationlab')) return 'The Information Lab';
  if (d.includes('vizwiz')) return 'VizWiz';
  if (d.includes('help.tableau') || d.includes('tableau.com')) return 'Tableau';
  if (d.includes('youtube') || d.includes('youtu.be')) return 'YouTube';
  const first = d.split('.')[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function cleanTitle(raw: string): string {
  return raw
    .replace(
      /\s*[-|–—]\s*(The Flerlage Twins|Playfair Data|The Information Lab|The Data School|Tableau(?: Software)?|VizWiz).*$/i,
      ''
    )
    .replace(/\s+\|\s+.*$/, '')
    .trim();
}

function safeHost(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Entry point. Picks the best available search source and returns tutorials.
 */
export async function searchTutorials(
  chartTypeName: string,
  options: { braveKey?: string; proxyUrl?: string } = {},
  limit = 2
): Promise<Tutorial[]> {
  // Path 1: user provided their own Brave key — bypass our proxy
  if (options.braveKey && options.braveKey.trim()) {
    const results = await braveSearch(chartTypeName, options.braveKey).catch(() => []);
    if (results.length > 0) return results.slice(0, limit);
  }

  // Path 2: default proxy (zero-setup path for most users)
  const proxyUrl = (options.proxyUrl ?? DEFAULT_SEARCH_PROXY).replace(/\/$/, '');
  const results = await proxySearch(chartTypeName, proxyUrl).catch(() => []);
  return results.slice(0, limit);
}

// ─── Proxy path (default for Chrome Web Store users) ─────────────────────

async function proxySearch(q: string, proxyUrl: string): Promise<Tutorial[]> {
  // Skip proxy call if URL is still the placeholder (pre-deployment)
  if (proxyUrl.includes('example.workers.dev')) return [];

  const url = `${proxyUrl}/search?q=${encodeURIComponent(q)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const json = await res.json().catch(() => null);
  const items: Array<{ title: string; url: string; source: string }> = json?.results ?? [];
  return items
    .filter((x) => x?.title && x?.url)
    .map((x) => ({
      title: cleanTitle(x.title),
      url: x.url,
      source: x.source || prettySource(safeHost(x.url)),
      kind: 'article' as const,
      tags: [],
      quality: 4,
    }));
}

// ─── Brave path (optional BYO-key override) ──────────────────────────────

async function braveSearch(chartTypeName: string, apiKey: string): Promise<Tutorial[]> {
  const siteFilter = TRUSTED_DOMAINS.map((d) => `site:${d}`).join(' OR ');
  const query = `Tableau ${chartTypeName} tutorial how to build (${siteFilter})`;

  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', '8');
  url.searchParams.set('safesearch', 'moderate');

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const json = await res.json().catch(() => null);
  const results: Array<{ title: string; url: string }> = json?.web?.results ?? [];
  const scored = results
    .filter((r) => r?.title && r?.url)
    .map((r, idx) => {
      const domain = safeHost(r.url);
      const trustScore = TRUSTED_DOMAINS.some((d) => domain.endsWith(d)) ? 10 : 0;
      const orderScore = Math.max(0, 5 - idx);
      return { r, score: trustScore + orderScore, domain };
    });
  scored.sort((a, b) => b.score - a.score);

  return scored.map((x) => ({
    title: cleanTitle(x.r.title),
    url: x.r.url,
    source: prettySource(x.domain),
    kind: 'article' as const,
    tags: [],
    quality: 4,
  }));
}
