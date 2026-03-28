# DojoWatch

AI-native visual regression testing engine. Captures screenshots with Playwright, pre-filters with pixelmatch, and uses LLM vision as the diff engine — Claude locally, Gemini in CI.

**Zero incremental cost.** Uses models you already pay for (Claude Code subscription, Gemini free-tier tokens) and infrastructure already in place (GitHub Actions).

## How it works

```
Source change → Playwright capture → pixelmatch pre-filter → AI analysis → Report
                                         │                       │
                                    SKIP (identical)        REGRESSION / INTENTIONAL / NOISE
```

- **Locally**: Claude Code is the AI engine. It reads screenshots + source code in the same context and traces regressions to the exact line of code.
- **In CI**: Gemini 3.1 Pro batch-analyzes screenshot pairs and posts PR comments with regression summaries.

## Install

### As a Claude Code plugin

```bash
# From GitHub (recommended)
claude plugin add --git https://github.com/DojoCodingLabs/dojowatch

# Local development
claude --plugin-dir /path/to/dojowatch
```

### For CI

Clone or add as a git submodule. The CI scripts run standalone via `npx tsx`.

## Quick start

1. **Initialize** — run `/vr-init` in Claude Code. This detects your framework, discovers routes, and creates initial baselines.

2. **Make changes** — edit your UI code as usual.

3. **Check for regressions** — run `/vr-check`. Claude captures fresh screenshots, compares them against baselines, and reports any visual differences with classification and severity.

4. **Approve changes** — run `/vr-approve` to promote intentional changes to new baselines.

## Slash commands

| Command | Description |
|---------|-------------|
| `/vr-init` | Initialize DojoWatch: generate config, discover routes, create baselines |
| `/vr-check` | Full pipeline: capture → prefilter → AI analysis |
| `/vr-check --fast` | Quick check: pixelmatch only, no AI analysis |
| `/vr-check --scope branch` | Check only routes affected by branch changes |
| `/vr-approve` | Promote current captures to baselines |
| `/vr-report` | Generate a shareable markdown summary of the last check |
| `/vr-watch` | Watch mode with live re-capture (coming soon) |

## CI setup (GitHub Actions)

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
        run: npx wait-on http://localhost:3000
      - name: Run DojoWatch
        run: npx tsx path/to/dojowatch/scripts/ci.ts --pr ${{ github.event.pull_request.number }}
        env:
          GOOGLE_GENAI_API_KEY: ${{ secrets.GOOGLE_GENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    continue-on-error: true
```

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
  "maskSelectors": ["[data-vr-mask]", ".live-timestamp"],
  "prefilter": {
    "threshold": 0.05,
    "clusterMinPixels": 500
  }
}
```

### Masking dynamic content

Add `data-vr-mask` to elements that change between captures (timestamps, user avatars, live counters):

```html
<span data-vr-mask>March 27, 2026</span>
```

## Architecture

```
dojowatch/
├── commands/          # Claude Code slash commands
├── agents/            # Regression analyzer agent
├── skills/            # Visual regression skill + references
├── scripts/           # Core TypeScript scripts (capture, prefilter, analyze)
├── templates/         # Config example, GitHub Actions workflow
└── tests/             # Vitest tests + fixtures
```

## Pre-filter tiers

| Tier | Condition | Action | Cost |
|------|-----------|--------|------|
| SKIP | SHA-256 match OR 0 diff pixels | No analysis | 0 tokens |
| FAST_CHECK | 1-500 scattered pixels | Low-depth analysis | ~600 tokens |
| FULL_ANALYSIS | 500+ pixels or clustered | Full analysis | ~2400 tokens |

**Zero false-negative guarantee**: Only byte-identical or zero-diff screenshots are skipped.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT — see [LICENSE](LICENSE).
