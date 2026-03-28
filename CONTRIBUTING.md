# Contributing to DojoWatch

Thanks for your interest in contributing to DojoWatch!

## Development setup

1. Clone the repo:
   ```bash
   git clone https://github.com/DojoCodingLabs/dojowatch.git
   cd dojowatch
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install Playwright browsers:
   ```bash
   npx playwright install chromium
   ```

4. Run tests:
   ```bash
   npm test
   ```

5. Test the plugin locally:
   ```bash
   claude --plugin-dir ./
   ```

## Project structure

- `commands/` — Slash commands for Claude Code (markdown)
- `agents/` — Claude Code agents (markdown)
- `skills/` — Auto-activating skills with references
- `scripts/` — Core TypeScript modules (capture, prefilter, baseline, etc.)
- `tests/` — Vitest tests with PNG fixtures
- `templates/` — User-facing config and CI templates

## Writing scripts

Scripts serve dual purposes — importable modules AND standalone CLI tools:

```typescript
// Export functions for programmatic use
export function myFunction() { ... }

// CLI entrypoint when run directly
const isDirectRun = process.argv[1]?.endsWith("my-script.ts");
if (isDirectRun) {
  main();
}
```

## Writing slash commands

Commands are markdown files in `commands/` with YAML frontmatter:

```markdown
---
description: Short description shown in /help
argument-hint: "[optional args]"
---

# Command Name

Instructions for Claude on how to execute this command...
```

Commands instruct Claude what to do — they run scripts via Bash and use Claude's multimodal capabilities for analysis.

## Testing

```bash
npm test          # Watch mode
npm run test:run  # Single run
npm run typecheck # Type checking
npm run lint      # Linting
```

Test fixtures (PNG pairs) live in `tests/fixtures/`. When adding new test cases, include PNG pairs that demonstrate the specific scenario.

## Pull requests

1. Create a branch from `main`
2. Make your changes
3. Ensure `npm run typecheck && npm run test:run` passes
4. Submit a PR with a clear description of what changed and why

## Code of conduct

Be kind, be constructive, be collaborative.
