import React from 'react';
import type { VizMeta, PanelMode } from '../types';
import { LogoMark } from './Trigger';

interface PanelProps {
  meta: VizMeta;
  mode: PanelMode;
  onClose: () => void;
  onAnalyze: () => void;
  onOpenSettings: () => void;
}

export function Panel({ meta, mode, onClose, onAnalyze, onOpenSettings }: PanelProps) {
  return (
    <div
      className="tl-panel"
      role="dialog"
      aria-label="Viztara analysis panel"
    >
      <header className="tl-header">
        <div className="tl-brand">
          <div className="tl-brand-icon"><LogoMark size={16} /></div>
          <div className="tl-brand-text">Viztara</div>
        </div>
        <div className="tl-header-actions">
          <button
            className="tl-icon-btn"
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings"
          >
            ⚙
          </button>
          <button
            className="tl-icon-btn tl-close"
            onClick={onClose}
            aria-label="Close panel"
            title="Close"
          >
            ×
          </button>
        </div>
      </header>

      <main className="tl-body">
        <div className="tl-viz-meta">
          <div className="title">{meta.title ?? 'Untitled viz'}</div>
          {meta.author && <div className="author">by {meta.author}</div>}
        </div>

        {mode.kind === 'no_key' && (
          <div className="tl-empty">
            <h3>Add your API key</h3>
            <p>Viztara uses your own OpenAI or Anthropic key. Your data stays private.</p>
            <button className="tl-btn" onClick={onOpenSettings}>
              Open settings →
            </button>
          </div>
        )}

        {mode.kind === 'idle' && (
          <button className="tl-btn" onClick={onAnalyze}>
            Explain this viz →
          </button>
        )}

        {mode.kind === 'analyzing' && (
          <div className="tl-loading">
            <div className="tl-spinner" />
            <span>Reading the dashboard…</span>
          </div>
        )}

        {mode.kind === 'error' && (
          <>
            <div className="tl-error">
              <strong>Couldn&rsquo;t analyze this viz</strong>
              <div style={{ marginTop: 4, fontSize: 11.5 }}>{mode.message}</div>
            </div>
            <button className="tl-btn tl-btn-ghost" onClick={onAnalyze}>
              Try again
            </button>
          </>
        )}

        {mode.kind === 'analyzed' && (
          <>
            <section className="tl-card">
              <div className="tl-card-header tl-card-header-accent">
                <span>✦</span> What this shows
              </div>
              <p>{mode.result.summary}</p>
            </section>

            <section className="tl-card">
              <div className="tl-card-header">
                <span>◆</span> Chart types used
              </div>
              <ul className="tl-chart-types">
                {mode.result.chartTypes.map((c, i) => (
                  <li key={i}>
                    <div className="name">{c.name}</div>
                    <div className="desc">{c.description}</div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="tl-card">
              <div className="tl-card-header">
                <span>→</span> How to build this
              </div>
              <div className="tl-tutorials">
                {mode.result.tutorials.map((t, i) => (
                  <a
                    key={i}
                    className="tl-tutorial"
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="tl-tutorial-src">
                      {t.kind === 'video' ? '▶' : '✎'}
                    </div>
                    <div className="tl-tutorial-body">
                      <div className="tl-tutorial-title">{t.title}</div>
                      <div className="tl-tutorial-meta">{t.source} · {t.kind}</div>
                    </div>
                  </a>
                ))}
              </div>
            </section>

            <button className="tl-btn tl-btn-ghost" onClick={onAnalyze}>
              Re-analyze
            </button>
          </>
        )}
      </main>
    </div>
  );
}
