/**
 * Viztara Search Proxy
 * ────────────────────
 *
 * A Cloudflare Worker that acts as a tutorial-search backend for the
 * Viztara browser extension. It exists so end-users of the extension
 * don't have to sign up for any search API themselves — they install the
 * extension and it "just works."
 *
 * (Note: this Worker's Cloudflare deployment name is "tableau-lens-proxy"
 * — that's its identifier in Cloudflare's system from when the project
 * was originally named Tableau Lens. The deployed URL is unchanged.)
 *
 * Flow:
 *   1. Extension sends GET /search?q=SlopeChart
 *   2. Worker checks KV cache (24h TTL per chart type)
 *   3. On miss: calls Serper API with a site-filtered query, ranks results
 *      by trusted-domain score, caches, returns JSON
 *   4. On hit: returns cached JSON immediately
 *
 * Deployment:
 *   - Sign up at serper.dev (2500 free searches/month, NO credit card)
 *   - Sign up at cloudflare.com (free workers, NO credit card needed to start)
 *   - `npm install -g wrangler`
 *   - `wrangler kv namespace create TUTORIAL_CACHE`
 *   - `wrangler secret put SERPER_API_KEY` (paste key)
 *   - `wrangler deploy`
 *   - You get a URL like: https://tableau-lens-proxy.YOUR-SUBDOMAIN.workers.dev
 *   - Put that URL in the extension's DEFAULT_SEARCH_PROXY constant
 *
 * CORS: set to respond to any origin since it's a public free tool. Rate
 * limit per-IP via Cloudflare's built-in DDoS protection + the Serper free
 * tier itself is the natural backstop.
 */

interface Env {
  SERPER_API_KEY: string;
  TUTORIAL_CACHE: KVNamespace;
}

// Trusted Tableau learning domains, used to build a site: filter
const TRUSTED_DOMAINS = [
  'help.tableau.com',
  'flerlagetwins.com',
  'playfairdata.com',
  'thedataschool.co.uk',
  'theinformationlab.co.uk',
  'vizwiz.com',
  'tableau.com',
];

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// Minimal KV namespace type so TypeScript compiles without the full @cloudflare/workers-types dep
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface SerperResult {
  title?: string;
  link?: string;
  snippet?: string;
}

interface TutorialResponse {
  results: Array<{
    title: string;
    url: string;
    source: string;
  }>;
  cached: boolean;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    if (url.pathname !== '/search') {
      return corsResponse({ error: 'Not found' }, 404);
    }

    const q = (url.searchParams.get('q') || '').trim();
    if (!q || q.length > 100) {
      return corsResponse({ error: 'Missing or too-long q parameter' }, 400);
    }

    const cacheKey = `v1:${q.toLowerCase()}`;

    // Try cache first
    try {
      const cached = await env.TUTORIAL_CACHE.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as TutorialResponse;
        parsed.cached = true;
        return corsResponse(parsed, 200);
      }
    } catch {
      // Cache unavailable — proceed to live query
    }

    // Live query to Serper
    const siteFilter = TRUSTED_DOMAINS.map((d) => `site:${d}`).join(' OR ');
    const serperQuery = `Tableau ${q} tutorial how to build (${siteFilter})`;

    let serperJson: { organic?: SerperResult[] } | null = null;
    try {
      const serperRes = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': env.SERPER_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: serperQuery, num: 10 }),
      });
      if (!serperRes.ok) {
        return corsResponse({ error: `Upstream error ${serperRes.status}` }, 502);
      }
      serperJson = await serperRes.json();
    } catch {
      return corsResponse({ error: 'Search upstream failed' }, 502);
    }

    const organic = serperJson?.organic ?? [];
    const ranked = rankAndClean(organic);
    const response: TutorialResponse = { results: ranked, cached: false };

    // Cache (fire-and-forget)
    try {
      await env.TUTORIAL_CACHE.put(cacheKey, JSON.stringify(response), {
        expirationTtl: CACHE_TTL_SECONDS,
      });
    } catch {
      /* best effort */
    }

    return corsResponse(response, 200);
  },
};

function rankAndClean(
  results: SerperResult[]
): TutorialResponse['results'] {
  const scored = results
    .filter(
      (r): r is Required<Pick<SerperResult, 'title' | 'link'>> & SerperResult =>
        !!r.title && !!r.link
    )
    .map((r, idx) => {
      const domain = safeHost(r.link);
      const trustScore = TRUSTED_DOMAINS.some((d) => domain.endsWith(d)) ? 10 : 0;
      const orderScore = Math.max(0, 5 - idx);
      return { r, score: trustScore + orderScore, domain };
    });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 4).map((x) => ({
    title: cleanTitle(x.r.title),
    url: x.r.link,
    source: prettySource(x.domain),
  }));
}

function safeHost(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function prettySource(domain: string): string {
  const d = domain.replace(/^www\./, '').toLowerCase();
  if (d.includes('flerlagetwins')) return 'Flerlage Twins';
  if (d.includes('playfairdata')) return 'Playfair Data';
  if (d.includes('thedataschool')) return 'The Data School';
  if (d.includes('theinformationlab')) return 'The Information Lab';
  if (d.includes('vizwiz')) return 'VizWiz';
  if (d.includes('help.tableau') || d.includes('tableau.com')) return 'Tableau';
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

function corsResponse(body: object | null, status: number): Response {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300',
  };
  return new Response(body ? JSON.stringify(body) : null, { status, headers });
}
