/**
 * Per-viz memory. Tracks which viz IDs the user has already seen so we can
 * decide whether to auto-expand the panel or start collapsed.
 *
 * Stored in chrome.storage.local (not sync) because this is per-device state,
 * can grow large over time, and doesn't need to sync to other browsers.
 */

import type { AnalysisResult } from '../types';

const VISITED_KEY = 'visitedVizIds';
const MAX_REMEMBERED = 500; // FIFO trim to keep storage small
const ANALYSIS_CACHE_PREFIX = 'analysis:';

export async function hasVisited(vizId: string): Promise<boolean> {
  const { [VISITED_KEY]: list = [] } = await chrome.storage.local.get(VISITED_KEY);
  return Array.isArray(list) && list.includes(vizId);
}

export async function markVisited(vizId: string): Promise<void> {
  const { [VISITED_KEY]: list = [] } = await chrome.storage.local.get(VISITED_KEY);
  const next = Array.isArray(list) ? [...list] : [];
  if (next.includes(vizId)) return; // already there, nothing to do
  next.push(vizId);
  // Trim oldest entries if we exceed the cap
  const trimmed = next.length > MAX_REMEMBERED
    ? next.slice(next.length - MAX_REMEMBERED)
    : next;
  await chrome.storage.local.set({ [VISITED_KEY]: trimmed });
}

export async function clearVisited(): Promise<void> {
  await chrome.storage.local.remove(VISITED_KEY);
}

// ─── Analysis result cache ───────────────────────────────────────────────
// Persisted in chrome.storage.session so it survives within the browser
// session but doesn't linger across restarts (fresh analysis each day).
// Users expect closing + reopening the panel to preserve their analysis,
// and expect navigating away + back to also preserve it — but they don't
// expect it to survive quitting and relaunching Chrome.

const ANALYSIS_TTL_MS = 1000 * 60 * 60 * 24; // 24h safety net

interface CachedAnalysis {
  vizId: string;
  result: AnalysisResult;
  timestamp: number;
}

export async function getCachedAnalysis(
  vizId: string
): Promise<AnalysisResult | null> {
  try {
    const key = ANALYSIS_CACHE_PREFIX + vizId;
    // storage.session is memory-only and cleared on browser restart, exactly
    // what we want. Fall back to storage.local if session isn't available
    // (older Chrome versions).
    const storage = chrome.storage.session ?? chrome.storage.local;
    const res = await storage.get(key);
    const entry = res[key] as CachedAnalysis | undefined;
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ANALYSIS_TTL_MS) return null;
    return entry.result;
  } catch {
    return null;
  }
}

export async function setCachedAnalysis(
  vizId: string,
  result: AnalysisResult
): Promise<void> {
  try {
    const key = ANALYSIS_CACHE_PREFIX + vizId;
    const storage = chrome.storage.session ?? chrome.storage.local;
    const entry: CachedAnalysis = { vizId, result, timestamp: Date.now() };
    await storage.set({ [key]: entry });
  } catch {
    /* best effort */
  }
}

export async function clearCachedAnalysis(vizId: string): Promise<void> {
  try {
    const key = ANALYSIS_CACHE_PREFIX + vizId;
    const storage = chrome.storage.session ?? chrome.storage.local;
    await storage.remove(key);
  } catch {
    /* best effort */
  }
}
