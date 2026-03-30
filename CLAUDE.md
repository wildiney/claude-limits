# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

Pushing to `master` automatically deploys to GitHub Pages via `.github/workflows/deploy.yml`.
Live URL: https://wildiney.github.io/claude-limits/

There is no build step — the site is pure static HTML/JS served directly.

## Architecture

Single-page PWA with no framework, no bundler, no dependencies to install.

- `index.html` — all markup and layout (Tailwind via CDN, Chart.js via CDN)
- `app.js` — single `ClaudeTracker` class; all logic lives here
- `sw.js` — service worker caching static assets + CDN resources for offline use
- `manifest.json` — PWA metadata

### Core logic in `app.js`

`ClaudeTracker.calculateStats()` computes ideal usage as a percentage of work-hours elapsed within the current weekly cycle. The cycle runs from `lastReset` (last occurrence of `settings.resetDay` at `settings.resetTime`) to `nextReset` (7 days later). Only minutes within the configured `workStart`–`workEnd` window count toward `totalCycleWorkMinutes` and `passedWorkMinutes`.

State is persisted entirely in `localStorage` under the key `claude_settings` with this shape:

```js
{
  resetDay: 5,        // 0=Sun … 6=Sat
  resetTime: "08:00",
  workStart: "08:00",
  workEnd: "20:00",
  usage: 0,           // current manual input (0–100)
  history: [{ date: "YYYY-MM-DD", value: 0 }]  // max 30 entries
}
```

History stores one entry per day (the latest value for that day). The weekly chart always shows the last 7 calendar days.

### Service worker cache

`CACHE_NAME = 'claude-tracker-v1'` — bump this string in `sw.js` when deploying changes that must invalidate the cache.
