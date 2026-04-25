/**
 * Viztara content script.
 *
 * Lifecycle:
 *   - Runs on every public.tableau.com page (declared in manifest)
 *   - Observes URL + DOM for viz state
 *   - When a viz is detected: mounts the React UI into a Shadow DOM on the page
 *   - When not on a viz page: unmounts completely (button disappears)
 *   - When user navigates between tabs, the script stays paused (not running);
 *     the UI it injected is tied to its page and is naturally scoped.
 *
 * The entire Viztara UI lives in a single Shadow DOM root so:
 *   1. Our styles can't leak into Tableau's page
 *   2. Tableau's styles can't leak into ours
 *   3. We can remove all our UI with a single DOM unmount
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { observeVizState, type VizPageState } from '../lib/viz-detection';
import { captureViz } from '../lib/viz-capture';
import { enrichWithTutorials } from '../lib/llm';
import { hasVisited, markVisited, getCachedAnalysis, setCachedAnalysis } from './state';
import { Panel } from './Panel';
import { Trigger } from './Trigger';
import type { VizMeta, PanelState, PanelMode } from '../types';
// panel.css is imported as a string for injection into the shadow DOM
import panelCss from './panel.css?inline';

const HOST_ID = 'tableau-lens-host';

// ─── Shadow DOM setup ────────────────────────────────────────────────────
// We mount once per page into a single host element. Subsequent viz changes
// within the same page just update React state; we don't teardown + remount.

let shadowRoot: ShadowRoot | null = null;
let reactRoot: Root | null = null;

function mountHost(): ShadowRoot {
  if (shadowRoot) return shadowRoot;

  const hostEl = document.createElement('div');
  hostEl.id = HOST_ID;
  // Reset any inherited positioning that Tableau Public might impose
  hostEl.style.all = 'initial';
  document.body.appendChild(hostEl);

  shadowRoot = hostEl.attachShadow({ mode: 'open' });

  // Inject our CSS into the shadow root (scoped, can't leak)
  const styleEl = document.createElement('style');
  styleEl.textContent = panelCss;
  shadowRoot.appendChild(styleEl);

  // Inject a font preload so Fraunces/Inter/JetBrains Mono render in shadow DOM
  // Shadow DOM inherits fonts from the document, but we need to ensure they're loaded.
  if (!document.getElementById('tl-font-preload')) {
    const link = document.createElement('link');
    link.id = 'tl-font-preload';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap';
    document.head.appendChild(link);
  }

  const reactMount = document.createElement('div');
  reactMount.className = 'tl-host';
  shadowRoot.appendChild(reactMount);
  reactRoot = createRoot(reactMount);

  return shadowRoot;
}

function unmountHost() {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  if (shadowRoot?.host.parentElement) {
    shadowRoot.host.parentElement.removeChild(shadowRoot.host);
  }
  shadowRoot = null;
}

// ─── React app that the content script renders ──────────────────────────

interface AppProps {
  meta: VizMeta;
  shouldAutoOpen: boolean;
}

function App({ meta, shouldAutoOpen }: AppProps) {
  // Panel starts open if this is a first-time viz, closed otherwise
  const [panel, setPanel] = useState<PanelState>(
    shouldAutoOpen
      ? { kind: 'open', mode: { kind: 'idle' } }
      : { kind: 'closed' }
  );
  // Cache the last analyzed result so that closing and reopening the panel
  // shows the previous result instead of forcing a fresh AI run. Users expect
  // "close" to hide the UI, not discard their data. Only the explicit
  // "Re-analyze" button should trigger a new LLM call.
  const [lastResult, setLastResult] = useState<import('../types').AnalysisResult | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // On mount (and when viz changes), rehydrate cached analysis if one exists
  // for this viz. This makes "close panel, reopen panel" show prior results
  // instantly, and also survives navigation away + back to the same viz.
  useEffect(() => {
    let cancelled = false;
    getCachedAnalysis(meta.vizId).then((result) => {
      if (cancelled) return;
      if (result) {
        setLastResult(result);
        // If the panel is currently in the auto-opened idle state, promote it
        // to the cached result so the user sees content immediately
        setPanel((prev) =>
          prev.kind === 'open' && prev.mode.kind === 'idle'
            ? { kind: 'open', mode: { kind: 'analyzed', result } }
            : prev
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [meta.vizId]);

  // Check for API key on mount; re-check when panel opens
  useEffect(() => {
    chrome.storage.sync.get(['apiKey']).then((r) => setHasKey(!!r.apiKey));
  }, [panel.kind]);

  const openPanel = useCallback(() => {
    if (hasKey === false) {
      setPanel({ kind: 'open', mode: { kind: 'no_key' } });
      return;
    }
    // If we have a prior analysis for this viz, restore it. Otherwise idle.
    const mode: PanelMode = lastResult
      ? { kind: 'analyzed', result: lastResult }
      : { kind: 'idle' };
    setPanel({ kind: 'open', mode });
  }, [hasKey, lastResult]);

  const closePanel = useCallback(() => {
    setPanel({ kind: 'closed' });
  }, []);

  const openSettings = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  }, []);

  const analyze = useCallback(async () => {
    if (panel.kind !== 'open') return;
    if (hasKey === false) {
      setPanel({ kind: 'open', mode: { kind: 'no_key' } });
      return;
    }
    setPanel({ kind: 'open', mode: { kind: 'analyzing' } });

    try {
      // 1. Capture viz (screenshot + DOM text)
      const captured = await captureViz(meta);

      // 2. Send to background service worker, which calls the LLM with the
      //    stored API key. We do this in the background rather than here so
      //    the API key never enters the page context.
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_VIZ',
        screenshotDataUrl: captured.screenshot.dataUrl,
        domText: captured.domText,
        vizMeta: {
          title: meta.title,
          author: meta.author,
          url: meta.url,
        },
      });

      if (!response?.ok) {
        if (response?.error === 'NO_API_KEY') {
          setPanel({ kind: 'open', mode: { kind: 'no_key' } });
          return;
        }
        throw new Error(response?.error ?? 'Analysis failed');
      }

      // 3. Enrich with real tutorials: live web search (via proxy or user
      //    key) + YouTube videos (optional) + Tableau docs fallback.
      const keys = await chrome.storage.sync.get(['braveKey', 'youtubeKey']);
      const result = await enrichWithTutorials(
        response.result,
        keys.youtubeKey,
        keys.braveKey
      );
      // Cache the result so closing and reopening the panel — or navigating
      // away and back — shows it again without re-running analysis. The
      // cache lives in chrome.storage.session so it survives navigation
      // within the browser but clears on browser restart.
      setLastResult(result);
      setCachedAnalysis(meta.vizId, result);
      setPanel({ kind: 'open', mode: { kind: 'analyzed', result } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setPanel({ kind: 'open', mode: { kind: 'error', message } });
    }
  }, [panel.kind, hasKey, meta]);

  return (
    <>
      {panel.kind === 'closed' && <Trigger onClick={openPanel} />}
      {panel.kind === 'open' && (
        <Panel
          meta={meta}
          mode={panel.mode}
          onClose={closePanel}
          onAnalyze={analyze}
          onOpenSettings={openSettings}
        />
      )}
    </>
  );
}

// ─── Bootstrap: observe viz state and mount/unmount accordingly ─────────

let currentVizId: string | null = null;

async function handleStateChange(state: VizPageState) {
  if (state.kind !== 'viz') {
    // Not on a viz page → remove any UI
    if (currentVizId !== null) {
      currentVizId = null;
      unmountHost();
    }
    return;
  }

  const { meta } = state;

  // Same viz as before → don't remount
  if (meta.vizId === currentVizId) return;
  currentVizId = meta.vizId;

  const alreadyVisited = await hasVisited(meta.vizId);
  // Mark as visited so subsequent visits start collapsed
  await markVisited(meta.vizId);

  mountHost();
  if (reactRoot) {
    reactRoot.render(<App meta={meta} shouldAutoOpen={!alreadyVisited} />);
  }
}

observeVizState(handleStateChange);

// Clean up on page unload (belt-and-suspenders; browser usually handles this)
window.addEventListener('pagehide', () => {
  unmountHost();
});
