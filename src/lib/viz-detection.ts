/**
 * Detects whether the current Tableau Public page is showing a visualization,
 * and extracts basic metadata from the page (title, author, URL, etc.).
 *
 * Tableau Public URL patterns:
 *   - Viz page:      https://public.tableau.com/app/profile/{user}/viz/{name}/{sheet}
 *   - Profile page:  https://public.tableau.com/app/profile/{user}
 *   - Homepage:      https://public.tableau.com/app/discover
 *   - Search:        https://public.tableau.com/app/search
 *
 * Edge cases handled:
 *   - Page is a viz but iframe hasn't loaded yet (return pending state)
 *   - User navigates between vizzes without full page reload (SPA-style)
 *   - Multiple vizzes on a profile page (we only activate on single-viz pages)
 *   - Story navigation (dashboard change within same viz)
 *   - Tab changes within a dashboard
 *   - Private vizzes (iframe CORS-restricted)
 */

export type VizPageState =
  | { kind: 'not_a_viz' }
  | { kind: 'loading'; url: string }
  | { kind: 'viz'; meta: VizMeta }
  | { kind: 'private_viz'; url: string }
  | { kind: 'error'; reason: string };

export interface VizMeta {
  url: string;
  title: string | null;
  author: string | null;
  vizId: string; // unique identifier we derive; used for caching / "already explained"
  iframeElement: HTMLIFrameElement | null;
}

const VIZ_URL_PATTERN = /^https:\/\/public\.tableau\.com\/app\/profile\/[^/]+\/viz\/[^/]+/;

export function detectVizPage(): VizPageState {
  const url = window.location.href;

  // 1. URL-based filtering — fast rejection for non-viz pages
  if (!VIZ_URL_PATTERN.test(url)) {
    return { kind: 'not_a_viz' };
  }

  // 2. Find the viz iframe. Tableau Public embeds vizzes in an iframe
  //    with id like `primaryContent` or inside a specific container.
  const iframe = findVizIframe();

  if (!iframe) {
    // URL looks like a viz but iframe not yet in DOM — still loading
    return { kind: 'loading', url };
  }

  // 3. Check if iframe src is accessible (public vs private/restricted)
  if (iframe.src && !iframe.src.includes('public.tableau.com')) {
    return { kind: 'private_viz', url };
  }

  // 4. Extract metadata from the page
  const meta: VizMeta = {
    url,
    title: extractTitle(),
    author: extractAuthor(url),
    vizId: deriveVizId(url),
    iframeElement: iframe,
  };

  return { kind: 'viz', meta };
}

function findVizIframe(): HTMLIFrameElement | null {
  // Tableau Public uses several wrapper structures. Try them in order of specificity.
  const selectors = [
    'iframe[src*="public.tableau.com/views/"]',
    'iframe.tableauViz',
    'iframe[title*="Data Visualization"]',
    'iframe[src*="tableau"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLIFrameElement>(sel);
    if (el) return el;
  }
  return null;
}

function extractTitle(): string | null {
  // Tableau Public shows title in an <h1> on the viz page header.
  const h1 = document.querySelector('h1');
  if (h1?.textContent) return h1.textContent.trim();

  // Fallback: derive from <title>
  const title = document.title;
  if (title && !title.toLowerCase().startsWith('tableau public')) {
    return title.replace(/\s*\|\s*Tableau Public\s*$/, '').trim();
  }
  return null;
}

function extractAuthor(url: string): string | null {
  const match = url.match(/\/profile\/([^/]+)\//);
  return match ? decodeURIComponent(match[1]) : null;
}

function deriveVizId(url: string): string {
  // Use the viz path as a stable ID, stripped of query strings and sheet names
  const match = url.match(/\/viz\/([^/?#]+)(?:\/([^/?#]+))?/);
  if (!match) return url;
  return `${match[1]}:${match[2] ?? 'default'}`;
}

/**
 * Observes the page for viz state changes. Tableau Public is a SPA, so we need
 * to watch for:
 *   - URL changes (pushState/replaceState) when user navigates between vizzes
 *   - DOM mutations when the iframe appears/disappears
 *   - Hash changes for within-viz navigation (tabs, story points)
 */
export function observeVizState(onChange: (state: VizPageState) => void): () => void {
  let lastState: VizPageState | null = null;

  const emit = () => {
    const state = detectVizPage();
    const stateKey = stateCacheKey(state);
    const lastKey = lastState ? stateCacheKey(lastState) : null;
    if (stateKey !== lastKey) {
      lastState = state;
      onChange(state);
    }
  };

  // Initial check
  emit();

  // Watch DOM mutations — catches iframe load, tab changes, etc.
  const observer = new MutationObserver(() => emit());
  observer.observe(document.body, { childList: true, subtree: true });

  // Watch URL changes via history API patching (SPA navigation)
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    origPush.apply(history, args);
    setTimeout(emit, 50);
  };
  history.replaceState = function (...args) {
    origReplace.apply(history, args);
    setTimeout(emit, 50);
  };

  const onPop = () => setTimeout(emit, 50);
  const onHash = () => setTimeout(emit, 50);
  window.addEventListener('popstate', onPop);
  window.addEventListener('hashchange', onHash);

  // Cleanup function
  return () => {
    observer.disconnect();
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('hashchange', onHash);
  };
}

function stateCacheKey(s: VizPageState): string {
  switch (s.kind) {
    case 'not_a_viz':
      return 'not_a_viz';
    case 'loading':
      return `loading:${s.url}`;
    case 'viz':
      return `viz:${s.meta.vizId}`;
    case 'private_viz':
      return `private:${s.url}`;
    case 'error':
      return `error:${s.reason}`;
  }
}
