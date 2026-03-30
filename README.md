# Claude Limit Tracker

A PWA to track your Claude AI usage against an ideal pace within a weekly reset cycle.

**Live:** https://wildiney.github.io/claude-limits/

## How it works

You manually input your current usage (0–100%) via a slider. The app calculates an **ideal usage** based on how much of your configured work hours have elapsed since the last weekly reset. If your actual usage is above the ideal, you're spending limits too fast.

Settings (gear icon):
- **Reset day/time** — when your Claude usage cycle resets each week
- **Work hours** — only time within this window counts toward the ideal pace

Data is stored in `localStorage`. No backend, no account needed.

## Install as PWA

Open the live URL in Chrome/Edge and use "Add to Home Screen" or "Install app" from the browser menu.
