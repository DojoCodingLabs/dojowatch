# DojoWatch

AI-native visual regression testing engine — Claude Code plugin + GitHub Actions CI.

## Architecture

- **Plugin-first**: Slash commands are the primary local interface. Claude Code IS the local AI engine.
- **Scripts in `scripts/`**: Standalone TypeScript, runnable via `npx tsx`. Used by both slash commands and CI.
- **Gemini for CI**: `scripts/analyze-gemini.ts` handles batch analysis in GitHub Actions.
- **No npm publish**: This is a Claude Code plugin, not a published package.

## Conventions

- TypeScript strict mode, ESM only (`"type": "module"`)
- All shared types in `scripts/types.ts`
- Pre-filter has a **zero false-negative guarantee**: only byte-identical screenshots skip analysis
- Scripts must be runnable standalone (for CI) AND callable from slash commands via Bash
- Use `picocolors` for terminal output, never `chalk`
- Use `execFileSync` not `execSync` — avoid shell injection
- Test fixtures in `tests/fixtures/`

## File layout

| Directory | Purpose |
|-----------|---------|
| `commands/` | Claude Code slash commands (markdown with YAML frontmatter) |
| `agents/` | Claude Code agents (markdown with YAML frontmatter) |
| `skills/` | Claude Code skills (`SKILL.md` + `references/`) |
| `scripts/` | Core TypeScript scripts (capture, prefilter, analyze, etc.) |
| `templates/` | User-facing templates (config example, GitHub Actions) |
| `tests/` | Vitest tests + PNG fixtures |

## Script naming

Scripts double as both importable modules and CLI entrypoints:
- Export functions for programmatic use
- Include `if (isDirectRun)` block for CLI execution
- Accept args via `process.argv` when run directly

## Classification schema

Visual diffs are classified as:
- **REGRESSION**: Unintended visual change (bug). Severity: high/medium/low.
- **INTENTIONAL**: Deliberate change (feature, design update).
- **NOISE**: Insignificant rendering variance (anti-aliasing, sub-pixel).

See `skills/visual-regression/references/classification-schema.md` for full criteria.
