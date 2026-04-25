/**
 * YouTube Data API v3 search for tutorial videos.
 *
 * Given a chart type name, find the top 1-2 tutorial videos on YouTube.
 * Uses the user's own YouTube Data API key (optional — falls back to curated
 * articles only if not configured).
 *
 * We search for "Tableau {chart type} tutorial" and rank by a blend of view
 * count and recency. Typical Tableau tutorial videos are a few thousand to
 * a few hundred thousand views, so view count is a reliable quality proxy.
 */

import type { Tutorial } from './tutorials';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

// Curators we trust — boost their videos if they appear in results
const TRUSTED_CHANNELS = new Set([
  'The Flerlage Twins',
  'Andy Kriebel',
  'The Information Lab',
  'Playfair Data TV',
  'Tableau Software',
  'Tableau Tim',
  'Luke Stanke',
  'Data School',
  'DataVizDad',
]);

export async function searchYouTubeTutorials(
  chartTypeName: string,
  apiKey: string,
  limit = 2
): Promise<Tutorial[]> {
  const query = `Tableau ${chartTypeName} tutorial`;

  // Step 1: search for candidate videos
  const searchUrl = new URL(`${API_BASE}/search`);
  searchUrl.searchParams.set('key', apiKey);
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('maxResults', '10');
  searchUrl.searchParams.set('relevanceLanguage', 'en');
  searchUrl.searchParams.set('videoEmbeddable', 'true');

  let searchRes: Response;
  try {
    searchRes = await fetch(searchUrl.toString());
  } catch {
    return []; // network / CORS failure: fail silently
  }
  if (!searchRes.ok) return [];

  const searchJson = await searchRes.json().catch(() => null);
  const items: Array<{
    id: { videoId: string };
    snippet: { title: string; channelTitle: string; publishedAt: string };
  }> = searchJson?.items ?? [];
  if (items.length === 0) return [];

  // Step 2: fetch statistics (view count) for the candidate videos
  const videoIds = items.map((x) => x.id.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  const statsUrl = new URL(`${API_BASE}/videos`);
  statsUrl.searchParams.set('key', apiKey);
  statsUrl.searchParams.set('part', 'statistics');
  statsUrl.searchParams.set('id', videoIds.join(','));

  let statsRes: Response;
  try {
    statsRes = await fetch(statsUrl.toString());
  } catch {
    return [];
  }
  if (!statsRes.ok) return [];

  const statsJson = await statsRes.json().catch(() => null);
  const statsById = new Map<string, number>(
    (statsJson?.items ?? []).map((x: { id: string; statistics: { viewCount: string } }) => [
      x.id,
      parseInt(x.statistics?.viewCount ?? '0', 10),
    ])
  );

  // Step 3: score and rank
  const nowMs = Date.now();
  const scored = items
    .map((item) => {
      const id = item.id.videoId;
      const views = statsById.get(id) ?? 0;
      const publishedAt = new Date(item.snippet.publishedAt).getTime();
      const ageDays = Math.max(1, (nowMs - publishedAt) / (1000 * 60 * 60 * 24));

      // Base: log10(views) so a 100k-view video isn't 10× better than a 10k one
      let score = Math.log10(Math.max(10, views));
      // Recency decay: videos older than 5 years lose half
      if (ageDays > 365 * 5) score *= 0.6;
      // Trust bonus
      if (TRUSTED_CHANNELS.has(item.snippet.channelTitle)) score += 2;
      // Filter out "how-to draw a bar chart on paper" style noise
      const title = item.snippet.title.toLowerCase();
      if (!title.includes('tableau')) score -= 1.5;

      return { item, views, score, id };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => ({
    title: x.item.snippet.title,
    url: `https://www.youtube.com/watch?v=${x.id}`,
    source: x.item.snippet.channelTitle,
    kind: 'video' as const,
    tags: [],
    quality: 4,
  }));
}
