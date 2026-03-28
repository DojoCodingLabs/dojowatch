---
description: Review and approve current captures as new baselines
argument-hint: "[--all | --name <pattern>]"
---

# Visual Regression Approve

Promote current captures to baselines after reviewing changes.

## Arguments

- `--all` — approve all captures
- `--name <pattern>` — approve only captures matching the pattern

## Steps

1. **List current captures.** Read the contents of `.dojowatch/captures/` directory.

2. **Show what will be approved.** For each capture, show:
   - Screenshot name and viewport
   - Whether a baseline already exists (update vs new)
   - If a previous check was run, show the classification (REGRESSION/INTENTIONAL/NOISE)

3. **Confirm with user.** Ask for confirmation before promoting. If `--all` was specified, confirm once for all. Otherwise, let the user select which captures to approve.

4. **Promote.** Run:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/baseline.ts --promote <flags>
   ```

5. **Report.** Summarize: X baselines updated, Y new baselines created.
