/**
 * Background service worker.
 *
 * Architecture:
 *   - Content script captures viz (screenshot via us, DOM text locally)
 *   - Content script sends ANALYZE_VIZ → we load the API key, call the LLM,
 *     return raw analysis
 *   - Content script enriches with tutorial lookups and renders
 *
 * Why the LLM call happens here rather than in the content script:
 *   - Keeps API keys out of the page context (slight defense-in-depth)
 *   - Future: caching, rate limiting, background retries
 *   - Service worker persists across tab navigations, content script doesn't
 */

import { analyzeWithLLM } from '../lib/llm';

// When user clicks the extension icon in the toolbar, open options page
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (msg.type === 'CAPTURE_VISIBLE_TAB') {
    const windowId = sender.tab?.windowId;
    chrome.tabs.captureVisibleTab(
      windowId ?? chrome.windows.WINDOW_ID_CURRENT,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ dataUrl });
        }
      }
    );
    return true;
  }

  if (msg.type === 'ANALYZE_VIZ') {
    handleAnalyze(msg).then(
      (result) => sendResponse({ ok: true, result }),
      (err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) })
    );
    return true; // async response
  }

  return false;
});

async function handleAnalyze(msg: {
  screenshotDataUrl: string;
  domText: {
    titles: string[];
    labels: string[];
    captions: string[];
    all: string[];
  } | null;
  vizMeta: { title: string | null; author: string | null; url: string };
}) {
  const { apiProvider, apiKey, language } = await chrome.storage.sync.get([
    'apiProvider',
    'apiKey',
    'language',
  ]);
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('NO_API_KEY');
  }
  const provider = apiProvider === 'openai' ? 'openai' : 'anthropic';

  const raw = await analyzeWithLLM({
    provider,
    apiKey,
    screenshotDataUrl: msg.screenshotDataUrl,
    domText: msg.domText,
    vizMeta: msg.vizMeta,
    language: typeof language === 'string' ? language : 'English',
  });

  return raw;
}

export {};
