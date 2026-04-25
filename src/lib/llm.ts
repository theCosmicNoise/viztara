/**
 * LLM client for Viztara.
 *
 * Supports two providers — Anthropic (Claude) and OpenAI (GPT-4o) — behind a
 * unified interface. The call is made from the background service worker
 * (not the content script) to avoid CORS issues with provider APIs and to
 * keep API keys out of the page context.
 *
 * Input:  captured viz data (screenshot + DOM text)
 * Output: structured analysis (summary, chart types, tutorial search terms)
 *
 * Honesty constraints are baked into the system prompt:
 *   - Don't invent chart types not visible
 *   - Don't hallucinate data values
 *   - Return null summary if genuinely uncertain
 */

import type { AnalysisResult } from '../types';
import type { Tutorial } from './tutorials';
import { findTutorials } from './tutorials';
import { searchYouTubeTutorials } from './youtube';
import { searchTutorials } from './search';

export type Provider = 'anthropic' | 'openai';

export interface AnalyzeInput {
  provider: Provider;
  apiKey: string;
  screenshotDataUrl: string;  // data:image/png;base64,...
  domText: {
    titles: string[];
    labels: string[];
    captions: string[];
    all: string[];
  } | null;
  vizMeta: {
    title: string | null;
    author: string | null;
    url: string;
  };
  /**
   * Output language for the LLM response (summary + chart descriptions).
   * Uses BCP-47 codes ("en", "ja", "es", "fr", etc.) or full names ("English",
   * "Japanese"). When set to a non-English language, the model will also
   * translate any non-English text it reads on the viz, making this tool
   * accessible across the global DataFam community. Defaults to English.
   */
  language?: string;
}

/** Raw analysis from the LLM, before we enrich with tutorial lookups. */
export interface RawAnalysis {
  summary: string;
  chartTypes: Array<{ name: string; description: string }>;
  tutorialSearchTerms: string[];
}

const SYSTEM_PROMPT = `You are analyzing a Tableau Public visualization for a user who wants to understand what it shows and how to build it themselves.

You will receive:
1. A screenshot of the viz (may be partial if the viz extends beyond the user's viewport)
2. Text extracted from the viz's DOM: titles, labels, legends, captions. This text often reveals chart titles for charts outside the visible screenshot area — treat any title that suggests a chart (e.g. "Max Weight Lifted Overtime") as a chart worth identifying.

Return a strict JSON object with this schema:
{
  "summary": "One plain-English sentence describing what the viz is showing. Focus on the subject and time period. Max 30 words. Use 'appears to' if genuinely uncertain. If you cannot tell, set this field to null.",
  "chartTypes": [
    {
      "name": "Short canonical name (see list below)",
      "description": "One-sentence explanation of what this chart type does, in plain English. Max 20 words."
    }
  ],
  "tutorialSearchTerms": [
    "Short search queries for finding tutorials. Include 'Tableau' and the chart type. Max 6 words each."
  ]
}

Chart types to identify (use these exact names when applicable):
- Bar chart, Horizontal bar chart, Stacked bar chart, Diverging bar chart, Lollipop chart
- Line chart, Area chart, Stacked area chart, Sparkline, Stream graph
- Scatter plot, Bubble chart, Dot plot, Strip plot, Jitter plot, Beeswarm plot
- Pie chart, Donut chart, Packed bubbles, Circle packing
- Calendar heatmap, Heatmap, Highlight table
- Small multiples, Trellis chart
- Choropleth map, Symbol map, Density map, Hex map, Dot density map, Tile map
- Gantt chart, Timeline, Slope chart, Dumbbell chart, Connected scatter
- Treemap, Sunburst, Sankey diagram, Chord diagram, Alluvial diagram, Marimekko
- Box plot, Violin plot, Histogram, Ridgeline plot, Bullet chart
- KPI scorecard (big-number tiles with comparison), Indicator card
- Gauge chart, Radar chart, Waffle chart, Parallel coordinates
- Polar bar chart, Radial bar chart, Arc chart, Wheel chart
- Word cloud, Network diagram
- Custom illustration / Body map / Pictogram (ONLY for truly non-standard encodings that don't match any named type above)
- Table, Pivot table

When you see a pattern that looks unusual but resembles a named type above, prefer the named type. "Custom illustration" is a last resort — beeswarm, packed bubbles, ridgelines, circle packing, word clouds, and other organic-looking layouts all have canonical names.

Rules:
- Identify ALL distinct chart types present, up to 8. Include repeated patterns (e.g. 4 donut charts = one "Donut chart" entry). Small multiples of the same chart type count as their own type.
- Include KPI scorecards, sparklines, and big-number tiles when present — these are real chart types that often get overlooked.
- Scan the DOM text for chart titles that hint at visuals outside the screenshot viewport.
- Do not invent chart types that have no visual or textual evidence.
- Do not fabricate data values or statistics the viz does not clearly display.
- Use the canonical names from the list above when a match exists.
- Return ONLY the JSON object. No markdown fences, no prose.`;

function buildUserPrompt(input: AnalyzeInput): string {
  const lines: string[] = ['Analyze this Tableau Public visualization.'];
  if (input.vizMeta.title) lines.push(`Page title: ${input.vizMeta.title}`);
  if (input.vizMeta.author) lines.push(`Author: ${input.vizMeta.author}`);
  if (input.domText) {
    if (input.domText.titles.length) {
      lines.push(`Titles found in viz: ${input.domText.titles.slice(0, 10).join(' | ')}`);
    }
    if (input.domText.labels.length) {
      lines.push(`Labels/axes: ${input.domText.labels.slice(0, 30).join(' | ')}`);
    }
    if (input.domText.captions.length) {
      lines.push(`Captions: ${input.domText.captions.slice(0, 5).join(' | ')}`);
    }
  } else {
    lines.push('(DOM text could not be extracted — analyze from screenshot only)');
  }
  // Language override: when user has picked a non-English output language,
  // instruct the model to write the summary and chart descriptions in that
  // language. Chart type NAMES stay in English so tutorial searches still
  // return relevant results — we translate the descriptions and summary, not
  // the terminology.
  const lang = (input.language ?? 'English').trim();
  if (lang && lang.toLowerCase() !== 'english' && lang.toLowerCase() !== 'en') {
    lines.push(
      `\nIMPORTANT: Write the "summary" and each chart "description" in ${lang}. Keep chart "name" fields in English (so tutorial lookups work), but translate any non-English text you see on the viz when describing what it shows.`
    );
  }
  lines.push('\nReturn only the JSON object described in your instructions.');
  return lines.join('\n');
}

export async function analyzeWithLLM(input: AnalyzeInput): Promise<RawAnalysis> {
  if (input.provider === 'anthropic') {
    return callAnthropic(input);
  } else {
    return callOpenAI(input);
  }
}

// ─── Anthropic Claude ────────────────────────────────────────────────────

async function callAnthropic(input: AnalyzeInput): Promise<RawAnalysis> {
  // Strip the "data:image/png;base64," prefix; Anthropic wants raw base64
  const base64 = input.screenshotDataUrl.replace(/^data:image\/\w+;base64,/, '');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      // Allow the extension to call the API from a browser context
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64,
              },
            },
            {
              type: 'text',
              text: buildUserPrompt(input),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      response.status === 401
        ? 'Your Anthropic API key was rejected. Check it in settings.'
        : response.status === 429
        ? 'Rate limit hit. Wait a minute and try again.'
        : `Anthropic API error (${response.status}): ${errText.slice(0, 200)}`
    );
  }

  const json = await response.json();
  // Anthropic response shape: { content: [{ type: 'text', text: '...' }] }
  const text = json?.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
  return parseAnalysis(text);
}

// ─── OpenAI GPT-4o ───────────────────────────────────────────────────────

async function callOpenAI(input: AnalyzeInput): Promise<RawAnalysis> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildUserPrompt(input) },
            {
              type: 'image_url',
              image_url: { url: input.screenshotDataUrl, detail: 'high' },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      response.status === 401
        ? 'Your OpenAI API key was rejected. Check it in settings.'
        : response.status === 429
        ? 'Rate limit hit. Wait a minute and try again.'
        : `OpenAI API error (${response.status}): ${errText.slice(0, 200)}`
    );
  }

  const json = await response.json();
  // OpenAI response shape: { choices: [{ message: { content: '...' } }] }
  const text = json?.choices?.[0]?.message?.content ?? '';
  return parseAnalysis(text);
}

// ─── Response parsing ────────────────────────────────────────────────────

function parseAnalysis(text: string): RawAnalysis {
  // Strip any accidental markdown fences if the model ignored our instructions
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Couldn't parse AI response. Try analyzing again.");
  }

  // Validate shape
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI returned unexpected response shape.');
  }
  const p = parsed as Record<string, unknown>;

  const summary =
    typeof p.summary === 'string'
      ? p.summary
      : p.summary === null
      ? "I couldn't confidently describe this viz."
      : '';

  const chartTypes = Array.isArray(p.chartTypes)
    ? p.chartTypes
        .filter(
          (c): c is { name: string; description: string } =>
            !!c &&
            typeof (c as { name?: unknown }).name === 'string' &&
            typeof (c as { description?: unknown }).description === 'string'
        )
        .map((c) => ({ name: c.name, description: c.description }))
    : [];

  const tutorialSearchTerms = Array.isArray(p.tutorialSearchTerms)
    ? p.tutorialSearchTerms.filter((t): t is string => typeof t === 'string')
    : [];

  if (!summary && chartTypes.length === 0) {
    throw new Error("The AI couldn't read this viz. Try reloading the page.");
  }

  return { summary, chartTypes, tutorialSearchTerms };
}

// ─── Enrich raw analysis with real tutorials ─────────────────────────────

/**
 * Given raw LLM analysis, produce a user-facing result with curated articles
 * and (if a YouTube API key is configured) video tutorials.
 *
 * Strategy: for each detected chart type, fetch the top curated article(s)
 * and the top YouTube video. Deduplicate across chart types so we don't show
 * the same tutorial twice when two chart types map to the same resource.
 * Cap the final list at 6 tutorials to keep the panel scannable.
 */
/**
 * Given raw LLM analysis, produce a user-facing result with real tutorials.
 *
 * Source priority (in order):
 *   1. Brave Search API — live, URL-verified results from trusted Tableau
 *      learning sites (Flerlage Twins, Playfair Data, Data School, etc.)
 *   2. YouTube Data API v3 — video tutorials ranked by view count
 *   3. Tableau official docs (static, stable-slug URLs) — guaranteed fallback
 *
 * Why this order: Brave returns fresh URLs the search engine has crawled and
 * knows exist. Hand-curated URLs drift over time and a significant portion
 * hallucinate in LLM-generated indexes. The Tableau help-center URLs are the
 * one exception we keep statically because their slug pattern is stable.
 */
export async function enrichWithTutorials(
  raw: RawAnalysis,
  youtubeKey?: string,
  braveKey?: string
): Promise<AnalysisResult> {
  const tutorials: AnalysisResult['tutorials'] = [];
  const seenUrls = new Set<string>();
  const MAX_TUTORIALS = 6;
  const MAX_CHART_TYPES_TO_SEARCH = 4;
  const chartTypesToSearch = raw.chartTypes.slice(0, MAX_CHART_TYPES_TO_SEARCH);

  const push = (t: { title: string; url: string; source: string; kind: 'article' | 'video' }) => {
    if (tutorials.length >= MAX_TUTORIALS) return;
    // De-dupe on a normalized URL to avoid adding the same page with different
    // trailing slashes or query strings
    const key = normalizeUrl(t.url);
    if (seenUrls.has(key)) return;
    seenUrls.add(key);
    tutorials.push(t);
  };

  // ─── 1. Web search (primary source for article tutorials) ──────────
  // Uses our hosted proxy by default, or the user's own Brave key if they
  // configured one. Either way, returns real URLs from live search results.
  // Always runs — no key gating here; the search module itself handles
  // falling back / failing gracefully.
  const searchResults = await Promise.all(
    chartTypesToSearch.map((c) =>
      searchTutorials(c.name, { braveKey }, 2).catch(() => [] as Tutorial[])
    )
  );
  // Interleave: take 1 from each chart type's results in round-robin so we
  // get one great tutorial per chart type before we take seconds
  const maxPerChart = Math.max(...searchResults.map((r) => r.length), 0);
  for (let i = 0; i < maxPerChart; i++) {
    for (const resultsForChart of searchResults) {
      if (tutorials.length >= MAX_TUTORIALS) break;
      const t = resultsForChart[i];
      if (t) push({ title: t.title, url: t.url, source: t.source, kind: t.kind });
    }
  }

  // ─── 2. YouTube (video tutorials, runs in parallel path) ────────────
  if (youtubeKey && youtubeKey.trim() && tutorials.length < MAX_TUTORIALS) {
    const videoResults = await Promise.all(
      chartTypesToSearch.slice(0, 3).map((c) =>
        searchYouTubeTutorials(c.name, youtubeKey, 1).catch(() => [] as Tutorial[])
      )
    );
    for (const videos of videoResults) {
      for (const v of videos) {
        push({ title: v.title, url: v.url, source: v.source, kind: v.kind });
      }
    }
  }

  // ─── 3. Tableau official docs fallback ──────────────────────────────
  // Only fills remaining slots. This guarantees users always see *something*
  // even if Brave/YouTube keys aren't configured.
  if (tutorials.length < MAX_TUTORIALS) {
    for (const chart of chartTypesToSearch) {
      if (tutorials.length >= MAX_TUTORIALS) break;
      for (const m of findTutorials(chart.name, 1)) {
        push({ title: m.title, url: m.url, source: m.source, kind: m.kind });
      }
    }
  }

  return {
    summary: raw.summary,
    chartTypes: raw.chartTypes,
    tutorials,
  };
}

/** Normalize a URL for de-duplication: lowercase host, strip trailing slash, drop hash. */
function normalizeUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    u.hash = '';
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, '')}${u.search}`;
  } catch {
    return urlStr;
  }
}

/**
 * Back-compat alias kept while we migrate content.tsx to the new name.
 * @deprecated use enrichWithTutorials
 */
export function enrichWithMockTutorials(raw: RawAnalysis): AnalysisResult {
  const tutorials: AnalysisResult['tutorials'] = [];
  const seenUrls = new Set<string>();
  for (const chart of raw.chartTypes) {
    if (tutorials.length >= 6) break;
    for (const m of findTutorials(chart.name, 2)) {
      if (tutorials.length >= 6) break;
      if (seenUrls.has(m.url)) continue;
      seenUrls.add(m.url);
      tutorials.push({
        title: m.title,
        url: m.url,
        source: m.source,
        kind: m.kind,
      });
    }
  }
  return { summary: raw.summary, chartTypes: raw.chartTypes, tutorials };
}

