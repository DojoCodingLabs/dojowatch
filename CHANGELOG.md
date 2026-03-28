# Changelog

## [0.1.0] — Unreleased

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
