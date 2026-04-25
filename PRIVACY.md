# Viztara — Privacy Policy

**Last updated: April 25, 2026**

Viztara is a Chrome browser extension that helps you understand Tableau
Public visualizations using AI. This document explains, in plain language,
exactly what data the extension touches, where it goes, and what it does
not do.

## TL;DR

- Viztara has no servers that collect or store your data.
- Your API keys live encrypted on your own device, in Chrome's storage.
- When you click "Explain this viz," the extension sends a screenshot of
  the viz to the AI provider *you chose* (Anthropic or OpenAI), using
  *your own API key*. That request goes directly from your browser to the
  provider — it does not pass through any Viztara server.
- For tutorial search, the extension sends only short chart-type names
  (like "slope chart") to a Cloudflare Worker run by the developer, which
  forwards them to Serper. No personally identifiable information is sent.
- Viztara does not sell, share, or transfer your data to anyone. There is
  no analytics, no telemetry, no tracking.

## What Viztara stores on your device

The extension uses Chrome's built-in storage APIs to persist a few small
pieces of information locally:

| What | Where stored | Why |
|---|---|---|
| Your AI provider choice (Anthropic or OpenAI) | `chrome.storage.sync` | So you don't re-pick on every browser restart |
| Your AI provider's API key | `chrome.storage.sync` | So the extension can talk to the AI on your behalf |
| Your optional YouTube Data API key | `chrome.storage.sync` | Same reason — for finding video tutorials |
| Your optional Brave Search API key | `chrome.storage.sync` | Same reason — for finding article tutorials |
| Your preferred output language | `chrome.storage.sync` | So vizzes get explained in your chosen language |
| List of viz IDs you've visited | `chrome.storage.local` | So the panel auto-opens only on first visit, then stays out of your way |
| Cached analysis results (per session) | `chrome.storage.session` | So closing and reopening the panel doesn't waste your AI credits re-running analysis |

**Important context about `chrome.storage.sync`:** Chrome encrypts this
storage and syncs it across your own signed-in Chrome devices. It is not
visible to Viztara, the developer, or anyone else. If you sign out of
Chrome or clear extension data, the values are removed.

## What data Viztara sends, and to whom

The extension makes network requests in these scenarios, and *only* these
scenarios:

### 1. When you click "Explain this viz"

Viztara captures a screenshot of the currently visible Tableau Public viz
plus any text labels it can read from the page, and sends them to:

- **Anthropic's API** at `api.anthropic.com`, *or*
- **OpenAI's API** at `api.openai.com`

— whichever provider you configured. The request uses *your* API key. The
provider's privacy policy and terms apply to that data:

- Anthropic: <https://www.anthropic.com/legal/privacy>
- OpenAI: <https://openai.com/policies/privacy-policy/>

Viztara does not see, log, or proxy this request. It goes directly from
your browser to the provider.

### 2. When the AI identifies chart types

For each chart type the AI detects (e.g. "slope chart", "calendar
heatmap"), Viztara fetches matching tutorials. This involves one of:

- **The default search proxy** at
  `tableau-lens-proxy.anjaliroy3101.workers.dev`, a Cloudflare Worker
  operated by the developer. The proxy receives only the chart type name
  as a query string. It does not receive viz screenshots, viz URLs,
  identifiers, IP-based identity, or any user data beyond the chart name.
  The proxy forwards the query to Serper (<https://serper.dev>) and
  returns the search results. **Serper does not log queries to user
  identities** but does see the chart-type names. Serper's privacy policy:
  <https://serper.dev/privacy-policy>. Cloudflare's edge logs may briefly
  include the originating IP for DDoS protection — see
  <https://www.cloudflare.com/privacypolicy/>.
- **Brave Search API** at `api.search.brave.com`, only if you have entered
  your own Brave key. Brave's privacy:
  <https://brave.com/privacy/services/>.
- **YouTube Data API** at `googleapis.com`, only if you have entered your
  own YouTube key. Google's privacy:
  <https://policies.google.com/privacy>.

### 3. Viz page detection

The extension's content script runs only on URLs matching
`https://public.tableau.com/*`. It reads the page's URL and DOM to identify
whether the page is a viz, but does not transmit this information anywhere
unless you trigger an analysis.

## What Viztara does NOT do

- ❌ No analytics, telemetry, crash reporting, or fingerprinting
- ❌ No accounts, no logins, no email addresses collected
- ❌ No selling, sharing, or transferring data to advertisers, brokers, or
  third parties (other than the search/AI providers you explicitly chose
  by adding keys, or the default search proxy described above)
- ❌ No use of data for creditworthiness, lending, hiring, or any
  unrelated purpose
- ❌ No tracking across websites (the content script only runs on
  `public.tableau.com`)
- ❌ No reading of your data from any site other than `public.tableau.com`,
  even though Chrome shows a broad permission warning at install (this is
  required by Chrome to enable the screenshot capture API; the actual
  scope is restricted by the manifest's `content_scripts.matches`)

## Permissions explained

When you install Viztara, Chrome shows several permission warnings.
Here's why each is needed:

- **Read and change your data on websites you visit** — Chrome wraps this
  warning around our use of `<all_urls>` host permission, which is
  required by Chrome's `tabs.captureVisibleTab` API for taking viz
  screenshots. The content script (the part that actually reads pages) is
  scoped in the manifest to only `public.tableau.com/*`. Viztara cannot
  and does not read other sites.
- **Storage** — to save your settings as described above.
- **activeTab, scripting, tabs** — to inject the analysis panel and
  capture viz screenshots when you click the button.

## Children's privacy

Viztara is not directed at children under 13 and does not knowingly
collect data from anyone. If you believe a child has used the extension,
note that Viztara stores nothing about identity — there is no data to
delete or contact you about.

## Data retention and deletion

- Settings persist in `chrome.storage.sync` until you uninstall the
  extension or sign out of Chrome.
- Viz visit history persists in `chrome.storage.local` until you uninstall
  or use Chrome's "Clear extension data" option.
- Cached analyses in `chrome.storage.session` clear when you close Chrome.
- The Cloudflare Worker proxy caches search results for 24 hours by
  chart-type name (not by user). After 24 hours the cache entry expires.
- Screenshots sent to AI providers are subject to those providers'
  retention policies — see their links above. Viztara holds no copy.

## Changes to this policy

If this policy changes materially, the new version will be published in
the same location with a new "Last updated" date. Continued use of the
extension after a change constitutes acceptance.

## Contact

For privacy questions, data deletion requests, or anything else:

**Anjali Roy (anjaliroy3101@gmail.com)**
