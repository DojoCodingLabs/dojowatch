---
name: visual-regression
description: Auto-activates when working on visual regression testing, screenshot comparison, UI diff analysis, or DojoWatch configuration. Use when the user mentions "visual regression", "screenshot diff", "UI changed", "vr-check", "dojowatch", "baseline", or "visual testing".
---

# DojoWatch Visual Regression Skill

DojoWatch is an AI-native visual regression testing engine. It captures screenshots with Playwright, pre-filters with pixelmatch, and uses Claude (locally) or Gemini (in CI) as the AI diff engine.

## Core Concepts

### Classification System
Every visual difference is classified as one of:
- **REGRESSION** — Unintended visual change (bug). Has severity: high/medium/low.
- **INTENTIONAL** — Deliberate change (feature, design update).
- **NOISE** — Insignificant rendering variance (sub-pixel, anti-aliasing).

### Pre-filter Tiers
Before AI analysis, pixelmatch classifies screenshots by change magnitude:
- **SKIP** — Byte-identical (SHA-256 match) or zero diff pixels. No AI needed.
- **FAST_CHECK** — 1-500 scattered pixels, no spatial clusters. Low-resolution analysis.
- **FULL_ANALYSIS** — 500+ pixels or spatially clustered changes. Full analysis.

### Zero False-Negative Guarantee
Only byte-identical or zero-diff screenshots are skipped. Every other screenshot is analyzed. The tiers control analysis depth, not whether analysis occurs.

## Configuration

DojoWatch is configured via `.dojowatch/config.json`:
```json
{
  "project": "my-app",
  "baseUrl": "http://localhost:3000",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile", "width": 375, "height": 812 }
  ],
  "routes": ["/", "/dashboard", "/settings"],
  "maskSelectors": ["[data-vr-mask]", ".live-timestamp"],
  "prefilter": {
    "threshold": 0.05,
    "clusterMinPixels": 500
  }
}
```

## Slash Commands
- `/vr-init` — Initialize DojoWatch: create config, discover routes, capture initial baselines
- `/vr-check` — Full pipeline: capture → prefilter → AI analysis
- `/vr-approve` — Promote captures to baselines
- `/vr-report` — Generate markdown summary of last check
- `/vr-watch` — File watcher with live re-capture (coming soon)

## Authenticated Routes

DojoWatch supports capturing pages behind authentication via Playwright's `storageState`:

```json
{
  "auth": {
    "storageState": ".dojowatch/auth.json",
    "profiles": {
      "admin": "e2e/.auth/admin.json",
      "student": "e2e/.auth/student.json"
    },
    "routes": {
      "/": null,
      "/dashboard": "student",
      "/admin": "admin"
    }
  }
}
```

- **`storageState`** — default auth file for all routes (cookies + localStorage)
- **`profiles`** — named profiles mapping to different auth state files
- **`routes`** — per-route profile assignment. `null` = anonymous. Unlisted routes use the default.

To generate an auth state file:
```bash
npx playwright codegen --save-storage=.dojowatch/auth.json http://localhost:3000
```
This opens a browser — log in manually, then close it. The session is saved.

For automated CI, use a setup script that logs in via your auth provider's API (Supabase, Clerk, NextAuth) and saves the storageState file. See DojoOS's `e2e/global-setup.ts` for an example.

## File Structure
- `.dojowatch/config.json` — Project configuration
- `.dojowatch/routeMap.json` — Source file → route mapping
- `.dojowatch/baselines/` — Approved baseline screenshots (committed to git)
- `.dojowatch/captures/` — Current captures (gitignored)
- `.dojowatch/diffs/` — Diff overlay PNGs (gitignored)
- `.dojowatch/last-check.json` — Results of most recent check (gitignored)

## How Local Analysis Works
In Claude Code, **you ARE the AI engine**. When `/vr-check` runs:
1. Scripts handle capture and pixelmatch pre-filtering
2. You read the baseline and capture PNGs directly (multimodal)
3. You also read the source files that render each route
4. You classify differences and trace regressions to source code
5. No API keys needed — your multimodal capabilities are the analysis engine

For detailed classification criteria, see `references/classification-schema.md`.
For the analysis prompt template, see `references/analysis-prompt.md`.
