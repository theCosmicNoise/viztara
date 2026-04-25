/**
 * Viz capture: get enough information about a Tableau Public viz to feed to an LLM.
 *
 * Strategy (v1):
 *   1. Screenshot the currently-visible viewport (fast, works always)
 *   2. Extract all visible text content from within the viz iframe's bounding box
 *      (titles, axis labels, legends, captions, data point labels)
 *   3. Send both to the vision model
 *
 * The screenshot gives the model *chart type identification* (it's remarkably
 * robust at this even from partial views). The extracted text gives it topical
 * context and catches metadata that may be scrolled out of view.
 *
 * Known limitations addressed in later versions:
 *   - Vizzes wider/taller than the viewport: we see what's visible; DOM text
 *     extraction catches labels outside the viewport. V1.1 will add opt-in
 *     scroll-and-stitch for deep analysis.
 *   - Cross-origin iframes: public.tableau.com vizzes are technically on a
 *     subdomain-scoped iframe. We try document.querySelectorAll first; if that
 *     returns nothing, we fall back to screenshot-only.
 *   - Some vizzes scroll INSIDE the iframe rather than the page. Those we catch
 *     via the iframe's postMessage bridge when it's accessible.
 */

import type { VizMeta } from '../types';

export interface CapturedViz {
  meta: VizMeta;
  screenshot: {
    dataUrl: string;       // base64-encoded PNG
    width: number;         // viewport pixel width
    height: number;        // viewport pixel height
    capturedRegion: 'viewport' | 'full_page';
  };
  domText: {
    titles: string[];      // h1/h2/strong text inside viz region
    labels: string[];      // axis labels, legend items, data labels
    captions: string[];    // italic / small / caption text
    all: string[];         // everything, deduplicated, in document order
  } | null;                // null if DOM inaccessible (cross-origin)
  warnings: string[];      // things the user should know (e.g. "viz is wider than your screen")
}

/**
 * Main entry point: capture everything we can about the current viz.
 * Called from the content script on "Explain this viz" click.
 */
export async function captureViz(meta: VizMeta): Promise<CapturedViz> {
  const warnings: string[] = [];

  // 0. Hide our own panel temporarily so it doesn't appear in the screenshot.
  //    Without this, the LLM sees its own UI chrome, which is confusing.
  //    We use visibility:hidden (rather than display:none) so layout stays
  //    stable and we can restore instantly.
  const host = document.getElementById('tableau-lens-host');
  const originalVisibility = host?.style.visibility ?? '';
  if (host) host.style.visibility = 'hidden';
  // Force a paint before capturing
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  let screenshotResponse: { dataUrl?: string; error?: string } | undefined;
  try {
    // 1. Ask the background script to capture the visible tab area.
    //    We can't call chrome.tabs.captureVisibleTab from a content script directly.
    screenshotResponse = await chrome.runtime.sendMessage({
      type: 'CAPTURE_VISIBLE_TAB',
    });
  } finally {
    // Always restore, even if capture threw
    if (host) host.style.visibility = originalVisibility;
  }

  if (!screenshotResponse?.dataUrl) {
    throw new Error(screenshotResponse?.error ?? 'Could not capture screenshot. Check extension permissions.');
  }

  const screenshot = {
    dataUrl: screenshotResponse.dataUrl as string,
    width: window.innerWidth,
    height: window.innerHeight,
    capturedRegion: 'viewport' as const,
  };

  // 2. Locate the viz iframe and its bounding box.
  const iframe = findVizIframe();
  if (iframe) {
    const rect = iframe.getBoundingClientRect();
    if (rect.right > window.innerWidth + 10) {
      warnings.push("This viz extends beyond the right edge of your screen.");
    }
    if (rect.bottom > window.innerHeight + 10) {
      warnings.push("This viz extends below your screen. Scroll down to see more.");
    }
  }

  // 3. Extract DOM text from within the viz container.
  const domText = extractDomText(iframe);
  if (!domText) {
    warnings.push("Couldn't read the viz's text content (cross-origin restriction). Analysis will rely on the screenshot only.");
  }

  return {
    meta,
    screenshot,
    domText,
    warnings,
  };
}

function findVizIframe(): HTMLIFrameElement | null {
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

/**
 * Extract text from the viz iframe's document.
 * If the iframe is cross-origin (which Tableau Public vizzes sometimes are),
 * we can't read its innerDocument; we return null and let the caller fall back.
 *
 * For same-origin iframes, we walk the DOM and categorize text nodes by
 * their role based on element type and styling hints.
 */
function extractDomText(iframe: HTMLIFrameElement | null): CapturedViz['domText'] {
  if (!iframe) return null;

  let innerDoc: Document | null = null;
  try {
    innerDoc = iframe.contentDocument;
  } catch {
    // Cross-origin: access blocked by browser security
    return null;
  }
  if (!innerDoc) return null;

  const titles: string[] = [];
  const labels: string[] = [];
  const captions: string[] = [];
  const seen = new Set<string>();
  const all: string[] = [];

  const push = (bucket: string[], text: string) => {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 2) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    bucket.push(cleaned);
    all.push(cleaned);
  };

  // Walk everything with text content. Categorize by tag/role.
  const walker = innerDoc.createTreeWalker(innerDoc.body, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent ?? '').trim();
    if (!text || text.length > 300) continue; // skip empty and giant blobs
    // Skip if this element has children with their own text (avoid duplicates)
    const hasDirectText = Array.from(el.childNodes).some(
      (c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim().length > 0
    );
    if (!hasDirectText) continue;

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'strong') {
      push(titles, text);
    } else if (tag === 'text' || tag === 'tspan' || el.getAttribute('role') === 'img') {
      // SVG text — axis labels, data labels
      push(labels, text);
    } else if (tag === 'em' || tag === 'small' || tag === 'figcaption') {
      push(captions, text);
    } else {
      push(all, text);
    }
  }

  return { titles, labels, captions, all };
}
