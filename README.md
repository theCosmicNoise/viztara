# Viztara

> AI companion for Tableau Public — understand any viz instantly, identify
> chart types, and learn how to build it.

A Chrome extension that activates on `public.tableau.com` viz pages. Click
the floating button and Viztara uses an LLM (Claude or GPT‑4o) to
explain what the viz shows, identify the chart types, and surface real
tutorials for building each one. Designed for self-taught data analysts,
journalists, and the global DataFam community.

## How it works

```
┌──────────────────┐    ┌────────────────────┐    ┌──────────────────┐
│   Chrome ext     │ ─▶ │  LLM (BYO key)     │    │ Tableau Public   │
│  (this repo)     │    │  Claude / GPT‑4o   │    │   public.tab…    │
│                  │ ◀─ │  vision analysis   │    │                  │
└──────────────────┘    └────────────────────┘    └──────────────────┘
         │
         ▼
┌──────────────────┐    ┌────────────────────┐
│  Search proxy    │ ─▶ │  Serper API        │
│  (Cloudflare)    │    │  (tutorial search) │
│  /proxy folder   │ ◀─ │                    │
└──────────────────┘    └────────────────────┘
```

Two pieces, both in this repo:

1. **`/` (root)** — the Chrome extension. Manifest V3, React + TypeScript +
   Vite. Runs entirely in the user's browser.
2. **`/proxy`** — a Cloudflare Worker that fronts the Serper search API for
   tutorial discovery. Optional but recommended; without it users get only
   Tableau's official docs as tutorial fallbacks.

## Tech stack

- **Extension:** TypeScript, React 18, Vite, CRXJS plugin, Manifest V3,
  Shadow DOM for style isolation
- **AI:** Anthropic Claude Sonnet 4.5 (vision) or OpenAI GPT‑4o, BYO‑key
- **Search proxy:** Cloudflare Workers + KV cache + Serper API
- **No backend, no analytics, no telemetry** — privacy-preserving by design

## Privacy

Viztara never sends data to a server we control (with one exception: the
search proxy, which only receives chart-type names like "slope chart" — no
viz content or user identifiers).

- LLM API calls go directly from your browser to your provider of choice
- Your API keys live in Chrome's encrypted sync storage on your device
- Viz screenshots exist only in memory during the API call, then discarded
- No accounts, no logins, no tracking

## Install (development)

### Extension

```bash
git clone https://github.com/theCosmicNoise/viztara
cd viztara
npm install
cp .env.example .env
# edit .env to point to your worker URL (or leave the default if you use mine)
npm run build
```

Then in Chrome: `chrome://extensions` → toggle Developer Mode → Load
unpacked → select the `dist/` folder.

Open Settings (gear in panel), add an Anthropic or OpenAI API key, and
visit any Tableau Public viz.

### Search proxy (optional)

See [`proxy/README.md`](./proxy/README.md) for deployment instructions.
Free tiers cover ~200 active users/month.

## Project structure

```
viztara/
├── src/                      # Extension source
│   ├── background/           # MV3 service worker
│   ├── content/              # Injected on Tableau Public pages
│   ├── lib/                  # LLM client, search, viz capture
│   ├── options/              # Settings page
│   └── types.ts
├── icons/                    # Extension toolbar icons
├── proxy/                    # Cloudflare Worker (separate deployable)
│   ├── worker.ts
│   ├── wrangler.toml
│   └── README.md
├── manifest.json             # Extension manifest (MV3)
├── vite.config.ts
└── tsconfig.json
```

## License

MIT — see [LICENSE](./LICENSE).
