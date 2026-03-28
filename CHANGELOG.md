# Changelog

## [0.4.0] — Unreleased

### Added
- **Supabase data layer** (`scripts/supabase.ts`): Full Supabase integration for shared storage
  - Upload runs, diffs, and baselines to Supabase Storage (private buckets)
  - Insert `vr_runs`, `vr_diffs`, `vr_baselines` rows with structured metadata
  - Signed URL generation for embedding diff thumbnails in PR comments
  - Remote baseline management: fetch, promote, list across team
  - `uploadCheckRun()` orchestrates the full upload in one call
- **Database migration** (`migrations/001_initial_schema.sql`): Tables, indexes, RLS policies
- **`--upload` flag** on CI orchestrator: pushes results to Supabase when configured
- **Diff thumbnails in PR comments**: When Supabase is configured, regression rows include clickable diff image links
- **Optional Supabase config**: `supabase` field in config.json is optional — local file storage works without it

## [0.3.0]

### Added
- **Gemini analysis module** (`scripts/analyze-gemini.ts`): Batch multimodal analysis using Google GenAI SDK
  - Batches 20-30 pairs per API call for efficient token usage
  - Structured JSON output via `responseMimeType: "application/json"`
  - Configurable model and API key environment variable
- **PR comment generator** (`scripts/comment.ts`): Markdown summary with regression table, collapsible sections for intentional changes and noise, pre-filter breakdown
- **CI orchestrator** (`scripts/ci.ts`): Single entrypoint for GitHub Actions
  - Pipeline: capture → prefilter → Gemini analysis → PR comment
  - Exits with code 1 on high-severity regressions
  - Saves full check run to `.dojowatch/last-check.json`
- Comment generation tests

## [0.2.0]

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
