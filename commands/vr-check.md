---
description: Run visual regression check — capture, diff, and analyze UI changes
argument-hint: "[--scope all|staged|branch] [--fast]"
---

# Visual Regression Check

Run the full visual regression pipeline: capture screenshots, compare against baselines, and analyze differences.

## Arguments

Parse the user's arguments:
- `--scope all|staged|branch` — which routes to capture (default: `staged`)
- `--fast` — skip AI analysis, pixelmatch only

## Steps

1. **Verify prerequisites.** Check that `.dojowatch/config.json` and `.dojowatch/baselines/` exist. If not, suggest running `/vr-init` first.

2. **Verify dev server.** Check if the configured `baseUrl` is reachable. If not, ask the user to start their dev server.

3. **Capture screenshots.** Run:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/capture.ts --scope <scope>
   ```
   This produces screenshots in `.dojowatch/captures/`.

4. **Run pre-filter.** Run:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/prefilter.ts
   ```
   This outputs a JSON report to `.dojowatch/prefilter-report.json` classifying each screenshot as SKIP, FAST_CHECK, or FULL_ANALYSIS.

5. **Read the pre-filter report.** Parse the JSON and summarize:
   - How many screenshots were SKIP (unchanged)
   - How many need FAST_CHECK or FULL_ANALYSIS

6. **If `--fast` flag**: Stop here. Report the pixel-level diff counts and skip AI analysis.

7. **AI Analysis (Claude is the engine).** For each non-SKIP screenshot:
   - Read the baseline PNG from `.dojowatch/baselines/`
   - Read the current capture PNG from `.dojowatch/captures/`
   - Read the diff overlay PNG from `.dojowatch/diffs/`
   - Read the source files mapped to this route (from `.dojowatch/routeMap.json`)
   - Read the analysis prompt from `${CLAUDE_PLUGIN_ROOT}/skills/visual-regression/references/analysis-prompt.md`
   - Analyze the visual differences. Classify each as:
     - **REGRESSION**: Unintended visual change (bug). Include severity: high/medium/low.
     - **INTENTIONAL**: Deliberate change (feature, design update).
     - **NOISE**: Insignificant rendering variance.
   - For each regression, provide: what changed, likely cause, suggested fix.

8. **Present results.** Format a summary:
   - Total screenshots: X | Unchanged: Y | Analyzed: Z
   - Regressions found: N (high: H, medium: M, low: L)
   - For each regression: element, description, severity, suggested fix
   - Offer to deep-dive: "Want me to trace any of these to the source code?"

9. **Save results.** Write analysis results to `.dojowatch/last-check.json` for `/vr-report` to use.
