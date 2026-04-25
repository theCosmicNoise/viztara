import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

type Provider = 'anthropic' | 'openai';

function Options() {
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [braveKey, setBraveKey] = useState('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [language, setLanguage] = useState('English');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.sync
      .get(['apiProvider', 'apiKey', 'braveKey', 'youtubeKey', 'language'])
      .then((res) => {
        if (res.apiProvider) setProvider(res.apiProvider as Provider);
        if (res.apiKey) setApiKey(res.apiKey);
        if (res.braveKey) setBraveKey(res.braveKey);
        if (res.youtubeKey) setYoutubeKey(res.youtubeKey);
        if (res.language) setLanguage(res.language as string);
      });
  }, []);

  async function save() {
    await chrome.storage.sync.set({
      apiProvider: provider,
      apiKey: apiKey.trim(),
      braveKey: braveKey.trim(),
      youtubeKey: youtubeKey.trim(),
      language: language.trim() || 'English',
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="container">
      <h1>Viztara</h1>
      <p className="subtitle">Settings &amp; API keys</p>

      <section>
        <div className="section-label">§ 01 — AI Provider</div>
        <h2>Your language model API key</h2>
        <p>
          Viztara uses your own API key to analyze vizzes. Your key is stored
          locally in Chrome&rsquo;s encrypted sync storage and never sent to any
          server except the provider you pick.
        </p>

        <label htmlFor="provider">Provider</label>
        <select
          id="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT-4 / GPT-4o)</option>
        </select>

        <label htmlFor="api-key">API Key</label>
        <input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
          autoComplete="off"
        />
        <div className="hint">
          {provider === 'anthropic' ? (
            <>
              Get an Anthropic key at{' '}
              <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>
            </>
          ) : (
            <>
              Get an OpenAI key at{' '}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                platform.openai.com
              </a>
            </>
          )}
        </div>
      </section>

      <section>
        <div className="section-label">§ 02 — Output language</div>
        <h2>Explain vizzes in your language</h2>
        <p>
          Viztara will write summaries and chart descriptions in the
          language you pick. It will also translate any non-English text it
          reads on the viz — useful for browsing international DataFam
          creators. Chart type names stay in English so tutorial lookups work.
        </p>
        <label htmlFor="language">Preferred language</label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="English">English</option>
          <option value="Spanish">Español (Spanish)</option>
          <option value="French">Français (French)</option>
          <option value="German">Deutsch (German)</option>
          <option value="Portuguese">Português (Portuguese)</option>
          <option value="Italian">Italiano (Italian)</option>
          <option value="Dutch">Nederlands (Dutch)</option>
          <option value="Japanese">日本語 (Japanese)</option>
          <option value="Korean">한국어 (Korean)</option>
          <option value="Chinese (Simplified)">简体中文 (Chinese Simplified)</option>
          <option value="Chinese (Traditional)">繁體中文 (Chinese Traditional)</option>
          <option value="Hindi">हिन्दी (Hindi)</option>
          <option value="Arabic">العربية (Arabic)</option>
          <option value="Hebrew">עברית (Hebrew)</option>
          <option value="Russian">Русский (Russian)</option>
          <option value="Turkish">Türkçe (Turkish)</option>
          <option value="Indonesian">Bahasa Indonesia</option>
          <option value="Vietnamese">Tiếng Việt (Vietnamese)</option>
          <option value="Thai">ไทย (Thai)</option>
        </select>
        <div className="hint">
          Don&rsquo;t see your language? Type it into the field — any language
          the AI model supports will work.
        </div>
      </section>

      <section>
        <div className="section-label">§ 03 — Tutorial search (optional)</div>
        <h2>Your own Brave Search API key</h2>
        <p>
          By default, Viztara uses a hosted search proxy — no setup needed.
          If you&rsquo;d prefer to use your own Brave Search API key (for
          privacy or higher quota), add it here. Free tier is 2,000
          searches/month (credit card required as anti-fraud).
        </p>
        <label htmlFor="brave-key">Brave Search API Key</label>
        <input
          id="brave-key"
          type="password"
          value={braveKey}
          onChange={(e) => setBraveKey(e.target.value)}
          placeholder="BSA..."
          autoComplete="off"
        />
        <div className="hint">
          Get a free key at{' '}
          <a href="https://brave.com/search/api/" target="_blank" rel="noreferrer">
            brave.com/search/api
          </a>
          {' '}→ sign up → create &ldquo;Data for Search&rdquo; subscription (free tier)
        </div>
      </section>

      <section>
        <div className="section-label">§ 04 — Video tutorials (optional)</div>
        <h2>YouTube Data API key</h2>
        <p>
          Adds video tutorials to the tutorial results, ranked by view count.
          Without this, we&rsquo;ll only show article tutorials.
        </p>
        <label htmlFor="yt-key">YouTube Data API v3 Key</label>
        <input
          id="yt-key"
          type="password"
          value={youtubeKey}
          onChange={(e) => setYoutubeKey(e.target.value)}
          placeholder="AIza..."
          autoComplete="off"
        />
        <div className="hint">
          Create one in{' '}
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
            Google Cloud Console
          </a>
          {' '}→ Enable &ldquo;YouTube Data API v3&rdquo; → Create API key
        </div>
      </section>

      <section>
        <div className="section-label">§ 05 — Privacy</div>
        <div className="privacy">
          <div className="privacy-icon">🔒</div>
          <div>
            Viztara never sends data to our servers. All API calls go directly
            from your browser to the provider you chose. Your keys live in Chrome
            storage, encrypted and synced across your devices.
          </div>
        </div>
      </section>

      <button onClick={save}>Save settings</button>
      <span className={`saved ${saved ? 'show' : ''}`}>✓ Saved</span>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Options />);
