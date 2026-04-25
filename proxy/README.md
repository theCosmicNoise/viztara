# Viztara Search Proxy

Cloudflare Worker that powers tutorial search for the Viztara extension.
Keeps end-users friction-free — they don't need to sign up for a search API,
the extension just works.

## What it does

Receives `GET /search?q=SlopeChart`, queries Serper for tutorials from a
curated list of trusted Tableau learning sources (Flerlage Twins, Playfair
Data, The Information Lab, etc.), ranks + dedupes + caches, returns JSON.

## Cost / scale

- **Serper free tier:** 2,500 queries/month, no credit card required
- **Cloudflare Workers free tier:** 100K requests/day, no credit card required
- With 24h KV caching, 2,500 Serper queries supports ~200 active users/month
- Upgrade path: Serper $50/mo = 50K queries ≈ 4,000 users

## File layout

| File | Purpose | Commit? |
|---|---|---|
| `worker.ts` | Worker source code | ✅ yes |
| `wrangler.toml` | Worker name, main file, KV binding ID | ✅ yes |
| `.env.example` | Documentation of expected env vars | ✅ yes |
| `.gitignore` | Tells git to skip `.env` and `.dev.vars` | ✅ yes |
| `README.md` | This file | ✅ yes |
| `.env` | Your real env values (local reference) | ❌ never |
| `.dev.vars` | Wrangler local-dev secrets | ❌ never |

## Where secrets actually live

This is the part most people get wrong. Cloudflare Workers run on
Cloudflare's edge network, not your laptop — so a `.env` file on your
machine doesn't reach them. Secrets are stored two places:

1. **For the deployed worker** (production): in Cloudflare's encrypted
   secret store, set via `wrangler secret put NAME`. Already done if you
   ran the deploy steps below.
2. **For local development** (`wrangler dev`): in a `.dev.vars` file in
   this folder. Wrangler reads this only for local runs.

The `.env` file is just a local reference document so you have your values
written down somewhere if you need to redeploy from a fresh machine.

## One-time setup

### 1. Get a Serper API key

Visit <https://serper.dev>, sign up with email. No credit card. Copy your
API key.

### 2. Get a Cloudflare account

Visit <https://dash.cloudflare.com/sign-up>. Free, no credit card needed
for Workers free tier.

### 3. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 4. Create the KV namespace for caching

```bash
cd proxy
wrangler kv namespace create TUTORIAL_CACHE
```

Paste the `id` it prints into `wrangler.toml` (replacing the existing one
under `[[kv_namespaces]]`).

### 5. Add your Serper key as a secret

```bash
wrangler secret put SERPER_API_KEY
```

Paste your key when prompted. This stores the secret on Cloudflare's side
for the deployed worker.

Optionally, also create a local `.dev.vars` for `wrangler dev`:

```bash
cp .env.example .dev.vars
# then edit .dev.vars to put in your real key
```

### 6. Deploy

```bash
wrangler deploy
```

You'll get a URL like `https://tableau-lens-proxy.yourname.workers.dev`.

### 7. Wire into the extension

Open `../src/lib/search.ts` and set:

```ts
const DEFAULT_SEARCH_PROXY = 'https://tableau-lens-proxy.yourname.workers.dev';
```

Rebuild the extension. Done.

## Testing

```bash
# Test deployed worker
curl "https://tableau-lens-proxy.yourname.workers.dev/search?q=slope+chart"

# Run locally for development
wrangler dev
# then in another terminal:
curl "http://localhost:8787/search?q=slope+chart"
```

Both should return JSON with a `results` array.

## Common operations

```bash
# See live logs from your deployed worker
wrangler tail

# List secrets currently set on the worker
wrangler secret list

# Update / rotate a secret
wrangler secret put SERPER_API_KEY
# (paste new key)

# Delete a secret
wrangler secret delete SERPER_API_KEY

# Redeploy after editing worker.ts
wrangler deploy
```

## Where to find your worker URL again

If you've forgotten your worker URL:

1. Run `wrangler deployments list` from the proxy folder, OR
2. Visit <https://dash.cloudflare.com> → Workers & Pages → tableau-lens-proxy
   → the URL is shown at the top of the page

## Monitoring / quota

- Serper usage: <https://serper.dev/dashboard>
- Cloudflare Workers: `wrangler tail` for live logs, dashboard for metrics
- When Serper free tier runs out: upgrade Serper plan, or add a second
  provider (Tavily, Firecrawl) as a fallback
