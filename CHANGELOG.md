# Changelog

## [0.6.0] — Unreleased

### Added — 17-item enhancement sweep
- **Route discovery** (`scripts/discover.ts`): Auto-detect Next.js (App/Pages Router), Vite, static HTML frameworks. Generate routes and dev port.
- **Device presets**: `Viewport` type now supports `deviceScaleFactor`, `isMobile`, `userAgent` for proper device emulation
- **Dark/light mode**: `colorSchemes` config field for capturing each route at multiple color schemes
- **Component isolation**: `captureComponents()` uses Playwright's `element.screenshot()` for pixel-perfect component capture
- **Dynamic content auto-detection**: `detectDynamicElements()` captures a page twice, identifies changing elements, suggests `data-vr-mask` additions
- **Shadow DOM support**: Stabilization CSS and masking now pierce open shadow roots
- **Performance baselines**: Captures LCP, CLS, FCP, TTFB alongside screenshots via `scripts/metrics.ts`
- **Accessibility regression**: Injects axe-core at runtime, captures a11y violations alongside screenshots
- **CLI entrypoint** (`scripts/dojowatch.ts`): Unified `dojowatch <command>` dispatcher
- **Trend tracking** (`scripts/stats.ts`): Queries Supabase for pass rate, top flaky routes, regression trends
- **`/vr-stats` command**: Show historical regression statistics
- **i18n/RTL support**: `locales` config field for locale-specific captures
- **Few-shot analysis prompt**: 5 concrete examples (regression, intentional, noise, perf, a11y) for better AI classification
- **Gemini vs Claude prompt variants**: Separate notes for each engine's strengths
- **PNG compression config**: `smart.compressPng` flag
- **Route timeout config**: `smart.routeTimeout` for per-route capture timeouts
- **Parallel capture config**: `smart.concurrency` for concurrent capture limit

## [0.5.0]

### Added
- **Authenticated route support**: Capture pages behind login using Playwright `storageState`
  - `auth.storageState` — default auth file for all routes
  - `auth.profiles` — named profiles (admin, student, etc.) mapping to different auth state files
  - `auth.routes` — per-route profile assignment (null = anonymous)
  - Routes grouped by auth profile to minimize browser context creation
  - Generate auth state: `npx playwright codegen --save-storage=.dojowatch/auth.json`
- Auth state files (`.dojowatch/auth*.json`) added to `.gitignore`
- **Smart Capture Layer** (`smart` config): Intelligent capture with readiness, retry, and detection
  - **Role-aware baselines**: Filenames include auth profile (`dashboard-admin-desktop.png` vs `dashboard-student-desktop.png`)
  - **Readiness checks**: `waitForSelector` and `waitForText` — wait for app-specific signals before capture
  - **Per-route readiness**: Override readiness config for specific routes (e.g., longer timeout for `/dashboard`)
  - **Bot protection detection**: Auto-detects Cloudflare, hCaptcha, reCAPTCHA challenge pages and warns
  - **Flaky capture detection**: Capture N times, compare hashes, use majority vote, warn on inconsistency
  - **SPA hydration wait**: Framework-agnostic hydration signal detection with custom selector support
  - **Capture warnings**: Structured warnings (`bot_protection`, `flaky_capture`, `readiness_timeout`, etc.) reported inline
- **CI hardening** (industry-standard GitHub Actions):
  - Playwright browser caching across runs
  - Pinned fonts (Noto, Liberation) for deterministic cross-environment rendering
  - Job timeout (10 min)
  - Concurrency control with cancel-in-progress
  - Node.js 24 compatibility (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`)
  - Diff artifact upload for manual review (7-day retention)
  - Separate regression vs infra failure exit codes in consumer template

## [0.4.0]

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
