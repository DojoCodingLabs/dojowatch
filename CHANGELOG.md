# Changelog

## [0.2.0] — Unreleased

### Added
- **Pre-filter engine** (`scripts/prefilter.ts`): pixelmatch-based tiered classification
  - SHA-256 hash comparison for instant SKIP detection
  - pixelmatch with configurable threshold (default 0.05) and anti-alias filtering
  - Spatial cluster detection using 8-connectivity flood-fill
  - Three tiers: SKIP (0 tokens), FAST_CHECK (~600 tokens), FULL_ANALYSIS (~2400 tokens)
  - Diff overlay PNG generation for visual inspection
  - Standalone CLI entrypoint with JSON report output
- **Type declaration** for pixelmatch v6 (`scripts/pixelmatch.d.ts`)
- **Prefilter tests** with fixture PNG pairs covering all tier scenarios

## [0.1.0]

### Added
- Initial project structure as Claude Code plugin + standalone scripts
- **Capture engine** (`scripts/capture.ts`): Playwright-based screenshot capture with configurable routes and viewports
- **Stabilization** (`scripts/stabilize.ts`): Animation freeze, network idle wait, font loading, element masking
- **Baseline management** (`scripts/baseline.ts`): SHA-256 hashing, promote captures to baselines
- **Config loader** (`scripts/config.ts`): `.dojowatch/config.json` with sensible defaults
- **Route map** (`scripts/route-map.ts`): Source file → route mapping with git-aware scope resolution
- **Slash commands**: `/vr-init`, `/vr-check`, `/vr-approve`, `/vr-report`, `/vr-watch` (stub)
- **Agent**: `regression-analyzer` for deep-diving into regression root causes
- **Skill**: `visual-regression` with classification schema and analysis prompt references
- **Templates**: Example config, GitHub Actions workflow
- **CI**: GitHub Actions workflow for linting, testing, type checking
