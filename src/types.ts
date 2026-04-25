/**
 * Shared types for Viztara.
 */

export interface VizMeta {
  url: string;
  title: string | null;
  author: string | null;
  vizId: string;
}

export interface AnalysisResult {
  summary: string;
  chartTypes: Array<{ name: string; description: string }>;
  tutorials: Array<{
    title: string;
    url: string;
    source: string;
    kind: 'video' | 'article';
  }>;
}

export type PanelState =
  | { kind: 'closed' }                              // collapsed to circular button
  | { kind: 'open'; mode: PanelMode };              // expanded panel visible

export type PanelMode =
  | { kind: 'no_key' }
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'analyzed'; result: AnalysisResult }
  | { kind: 'error'; message: string };
