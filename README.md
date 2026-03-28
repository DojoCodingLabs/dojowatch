# DojoWatch — AI-Native Visual Regression Testing

[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blue?logo=anthropic&logoColor=white)](https://github.com/DojoCodingLabs/dojowatch)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Category: Testing](https://img.shields.io/badge/Category-Testing-purple)](https://github.com/topics/claude-code-plugin)
[![Free & Open Source](https://img.shields.io/badge/Free-Open_Source-brightgreen)](https://github.com/DojoCodingLabs/dojowatch)

### Open-source visual regression testing that uses AI to tell you *what* changed, *why*, and *how to fix it* — by [Dojo Coding](https://dojocoding.io)

**DojoWatch** is a **Claude Code plugin** and **GitHub Actions CI tool** that catches visual regressions before they reach production. Unlike Percy, Chromatic, or Applitools — it costs nothing. It uses the AI models you already have.

---

## The Problem

Visual regressions reach production because:

- **No one tests visually.** Manual QA can't keep up with multiple deploys per day.
- **Commercial tools are expensive.** Percy starts at $500/mo. Chromatic at $149/mo. Applitools at $1K+/mo. For an early-stage team, that's unjustifiable.
- **Pixel-diff tools generate noise, not insight.** A red overlay of 10,000 changed pixels doesn't tell you *what broke* or *how to fix it*.

## The Insight

Claude Code is already multimodal. It can look at a screenshot *and* read your source code in the same context. It doesn't just see that pixels changed — it can trace the regression to the exact CSS property on the exact line.

No API keys. No per-screenshot pricing. No context-switching to a separate dashboard.

## The Solution

DojoWatch captures screenshots with Playwright, pre-filters with pixelmatch (to avoid wasting tokens on unchanged pages), and uses AI vision to classify every visual change:

- **REGRESSION** — an unintended visual change (bug). Severity: high / medium / low.
- **INTENTIONAL** — a deliberate change (new feature, design update).
- **NOISE** — insignificant rendering variance (sub-pixel anti-aliasing).

Locally, Claude Code *is* the AI engine — zero cost. In CI, Gemini handles batch analysis and posts PR comments.

---

## How It Works

```
Source change → Playwright capture → pixelmatch pre-filter → AI analysis → Report
                                           │                       │
                                      SKIP (identical)     REGRESSION / INTENTIONAL / NOISE
                                      0 tokens, ~1ms      Claude reads images + source code
```

**Locally (Claude Code plugin):**
1. You run `/vr-check`
2. Playwright captures your routes at configured viewports
3. pixelmatch compares against baselines — identical screenshots are skipped instantly
4. Claude reads the changed screenshots *and* the source files that render them
5. You get natural-language analysis: what changed, why, severity, and a suggested fix
6. You can ask follow-up questions: *"Why did the card shadow change?"* — Claude reads the CSS and answers

**In CI (GitHub Actions):**
1. PR triggers the workflow
2. Same capture + prefilter pipeline
3. Gemini 3.1 Pro batch-analyzes screenshot pairs (20-30 per API call)
4. A structured PR comment appears with a regression table, diff thumbnails, and fix suggestions
5. High-severity regressions fail the check. Everything else is informational.

---

## Pre-Filter: Zero False Negatives, Zero Wasted Tokens

The tiered pre-filter ensures you never pay for analysis you don't need — and never miss a regression:

| Tier | Condition | Action | Token Cost |
|------|-----------|--------|------------|
| **SKIP** | SHA-256 identical OR 0 diff pixels | No AI call | 0 |
| **FAST_CHECK** | 1-500 scattered pixels, no clusters | Low-depth analysis | ~600 |
| **FULL_ANALYSIS** | 500+ pixels or spatially clustered | Full analysis | ~2,400 |

**The guarantee:** Only byte-identical screenshots are skipped. Every other screenshot — even a single changed pixel — is analyzed. The tiers control *depth*, not *whether analysis occurs*.

---

## Installation

### Claude Code Plugin (recommended)

```bash
claude plugin marketplace add DojoCodingLabs/dojowatch
claude plugin install dojowatch@dojowatch
```

That's it. Run `/vr-init` in any project to get started.

> **Requires:** [Claude Code](https://code.claude.com) with plugin support.
> Scripts use [Playwright](https://playwright.dev) — install browsers with `npx playwright install chromium`.

### Updating

```bash
claude plugin marketplace update DojoCodingLabs/dojowatch
claude plugin update dojowatch@dojowatch
```

Restart your Claude Code session after updating.

### For CI Only

Clone or add as a git submodule. CI scripts run standalone via `npx tsx`.

---

## Quick Start

```
1. /vr-init          → Detect framework, discover routes, capture baselines
2. Make UI changes   → Edit CSS, components, layouts — whatever you're working on
3. /vr-check         → Capture → prefilter → Claude analyzes the diffs
4. /vr-approve       → Promote intentional changes to new baselines
```

---

## Commands

| Command | What it does |
|---------|-------------|
| `/dojowatch:vr-init` | Initialize DojoWatch: detect framework, discover routes, create baselines |
| `/dojowatch:vr-check` | Full pipeline: capture, prefilter, AI analysis with natural-language results |
| `/dojowatch:vr-check --fast` | Quick check: pixelmatch only, no AI analysis (~2s) |
| `/dojowatch:vr-check --scope branch` | Check only routes affected by current branch changes |
| `/dojowatch:vr-approve` | Review and promote current captures to baselines |
| `/dojowatch:vr-report` | Generate a shareable markdown summary of the last check |
| `/dojowatch:vr-watch` | Watch mode: re-capture on file save (coming soon) |

---

## CI Setup (GitHub Actions)

Copy `templates/visual-regression.yml` to your project's `.github/workflows/`:

```yaml
name: Visual Regression
on: [pull_request]
jobs:
  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Start dev server
        run: npm run dev &
      - name: Wait for server
        run: npx wait-on http://localhost:3000 --timeout 60000
      - name: Run DojoWatch
        run: npx tsx path/to/dojowatch/scripts/ci.ts --pr ${{ github.event.pull_request.number }} --upload
        env:
          GOOGLE_GENAI_API_KEY: ${{ secrets.GOOGLE_GENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    continue-on-error: true
```

The `--upload` flag pushes results to Supabase (optional). Without it, analysis runs locally and posts the PR comment.

---

## Configuration

DojoWatch is configured via `.dojowatch/config.json` at your project root:

```json
{
  "project": "my-app",
  "baseUrl": "http://localhost:3000",
  "storybookUrl": "http://localhost:6006",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile", "width": 375, "height": 812 }
  ],
  "routes": ["/", "/dashboard", "/settings"],
  "maskSelectors": ["[data-vr-mask]", ".live-timestamp"]
}
```

### Masking Dynamic Content

Add `data-vr-mask` to elements that change between captures — timestamps, avatars, live counters:

```html
<span data-vr-mask>March 27, 2026</span>
```

DojoWatch replaces masked elements with solid placeholders before capture, preventing false positives.

### Authenticated Routes

Most apps have protected routes (dashboards, admin panels, settings). DojoWatch supports Playwright's `storageState` to capture these pages as a logged-in user:

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

Generate an auth state file by logging in manually:

```bash
npx playwright codegen --save-storage=.dojowatch/auth.json http://localhost:3000
```

For CI, use a setup script that authenticates via your provider's API (Supabase, Clerk, Auth.js) and saves the state file before DojoWatch runs.

### Storybook Support

Point `storybookUrl` at your Storybook instance. DojoWatch crawls `stories.json`, captures every story in isolation, and provides component-level regression detection — equivalent to Chromatic's core offering.

### Supabase Integration (Optional)

Add `supabase` to your config to enable shared baselines and historical tracking:

```json
{
  "supabase": {
    "url": "https://your-project.supabase.co",
    "anonKey": "your-anon-key",
    "serviceKeyEnv": "SUPABASE_SERVICE_KEY"
  }
}
```

This eliminates git bloat from baseline PNGs, enables shared baselines across your team, and stores run history with diff images accessible via signed URLs.

---

## What's Included

```
dojowatch/
├── .claude-plugin/
│   ├── plugin.json               # Plugin metadata
│   └── marketplace.json          # Marketplace catalog
├── commands/                      # 5 slash commands
│   ├── vr-init.md                 #   /dojowatch:vr-init
│   ├── vr-check.md                #   /dojowatch:vr-check
│   ├── vr-approve.md              #   /dojowatch:vr-approve
│   ├── vr-report.md               #   /dojowatch:vr-report
│   └── vr-watch.md                #   /dojowatch:vr-watch
├── agents/
│   └── regression-analyzer.md     # Root-cause analysis agent
├── skills/
│   └── visual-regression/         # Auto-activating VR skill
│       ├── SKILL.md
│       └── references/
│           ├── classification-schema.md
│           └── analysis-prompt.md
├── scripts/                       # Core engine (TypeScript)
│   ├── capture.ts                 # Playwright capture engine
│   ├── stabilize.ts               # Animation freeze, masking
│   ├── prefilter.ts               # pixelmatch tiered classification
│   ├── baseline.ts                # Baseline management
│   ├── analyze-gemini.ts          # Gemini batch analysis (CI)
│   ├── comment.ts                 # PR comment generator
│   ├── ci.ts                      # CI orchestrator
│   ├── supabase.ts                # Supabase data layer
│   ├── config.ts                  # Config loader
│   ├── route-map.ts               # Source → route resolver
│   └── types.ts                   # Shared TypeScript types
├── migrations/
│   └── 001_initial_schema.sql     # Supabase schema
├── templates/
│   ├── config.example.json        # Example configuration
│   └── visual-regression.yml      # GitHub Actions template
└── tests/                         # 44 tests (unit + integration)
```

---

## How DojoWatch Compares

| | DojoWatch | Percy | Chromatic | Applitools |
|---|---|---|---|---|
| **Cost** | $0 | $500-1K/mo | $149-399/mo | $1-2K/mo |
| **AI analysis** | Claude + Gemini | Pixel diff only | Pixel diff only | AI (proprietary) |
| **Natural language** | "Header padding reduced by 8px" | Red overlay | Red overlay | Some |
| **Source code tracing** | Traces to exact CSS line | No | No | No |
| **Local analysis** | Claude Code (free) | Cloud only | Cloud only | Cloud only |
| **CI integration** | GitHub Actions | GitHub Actions | GitHub Actions | GitHub Actions |
| **Storybook** | Full crawl | Full crawl | Full crawl | Full crawl |
| **Open source** | MIT | No | No | No |

---

## Contributing

DojoWatch is open source and contributions are welcome:

- **Better classification prompts** — improve the AI analysis accuracy
- **Framework detection** — add route discovery for more frameworks
- **Performance** — optimize capture parallelization and prefilter speed
- **New viewports** — add common device presets
- **Bug fixes** — found an issue? Open a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## Built by Dojo Coding

[Dojo Coding](https://dojocoding.io) is a LATAM-first tech ecosystem building tools for developers. DojoWatch was built to serve our multi-SBU product portfolio — then open-sourced because every team deserves visual regression testing, not just those with enterprise budgets.

---

## License

MIT License — free to use, modify, and distribute.

---

<p align="center">
  <strong>Stop shipping visual regressions. Start shipping with confidence.</strong><br>
  <em>Free. Open source. By <a href="https://dojocoding.io">Dojo Coding</a>.</em>
</p>
