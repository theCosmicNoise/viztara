/**
 * Minimal curated tutorial fallback.
 *
 * Previously this file held ~35 hand-picked URLs from various Tableau blogs.
 * Problem: many of those URLs were reconstructed from training data and
 * either didn't exist or had moved. We've pivoted to live web search as the
 * primary source (see ./search.ts).
 *
 * This file now only contains Tableau's *official* documentation URLs, which
 * use a stable slug pattern (`/current/pro/desktop/en-us/buildexamples_*.htm`)
 * and are the most authoritative source. They serve as a guaranteed fallback
 * when the Brave search API is unavailable or returns no results.
 *
 * All other tutorials are fetched live at analyze-time via searchTutorials().
 */

export interface Tutorial {
  title: string;
  url: string;
  source: string;
  kind: 'article' | 'video';
  tags: string[];
  quality: number;
}

export const TUTORIALS: Tutorial[] = [
  {
    title: 'Build a Bar Chart — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_bar.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['bar chart', 'bar', 'horizontal bar chart', 'stacked bar chart'],
    quality: 5,
  },
  {
    title: 'Build a Line Chart — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_line.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['line chart', 'line', 'sparkline'],
    quality: 5,
  },
  {
    title: 'Build an Area Chart — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_areacharts.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['area chart', 'stacked area chart', 'area'],
    quality: 5,
  },
  {
    title: 'Build a Scatter Plot — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_scatter.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['scatter plot', 'scatter', 'bubble chart'],
    quality: 5,
  },
  {
    title: 'Build a Pie Chart — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_pie.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['pie chart', 'pie', 'donut chart'],
    quality: 5,
  },
  {
    title: 'Build a Highlight Table / Heatmap — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_highlight.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['heatmap', 'highlight table', 'heat map', 'calendar heatmap'],
    quality: 5,
  },
  {
    title: 'Build a Treemap — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_treemap.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['treemap', 'tree map'],
    quality: 5,
  },
  {
    title: 'Build a Filled Map — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/maps_howto_filledmaps.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['choropleth map', 'filled map', 'map'],
    quality: 5,
  },
  {
    title: 'Build a Histogram — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_histogram.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['histogram', 'distribution'],
    quality: 5,
  },
  {
    title: 'Build a Gantt Chart — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_gantt.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['gantt chart', 'gantt', 'timeline'],
    quality: 5,
  },
  {
    title: 'Build a Box Plot — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_boxplot.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['box plot', 'box and whisker'],
    quality: 5,
  },
  {
    title: 'Build a Bullet Graph — Tableau Help',
    url: 'https://help.tableau.com/current/pro/desktop/en-us/buildexamples_bullet.htm',
    source: 'Tableau',
    kind: 'article',
    tags: ['bullet chart', 'bullet graph'],
    quality: 5,
  },
];

export function findTutorials(chartTypeName: string, limit = 3): Tutorial[] {
  const needle = chartTypeName.toLowerCase().trim();
  const words = needle.split(/\s+/).filter((w) => w.length > 2);

  const scored = TUTORIALS.map((t) => {
    let score = 0;
    for (const tag of t.tags) {
      if (tag === needle) {
        score += 100;
      } else if (tag.includes(needle) || needle.includes(tag)) {
        score += 50;
      } else {
        for (const w of words) {
          if (tag.includes(w)) score += 10;
        }
      }
    }
    return { tutorial: t, score: score + t.quality };
  });

  return scored
    .filter((x) => x.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.tutorial);
}
