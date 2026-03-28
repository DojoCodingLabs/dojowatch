---
description: Watch for file changes and re-capture affected routes in real-time
---

# Visual Regression Watch

Start a file watcher that re-captures affected routes when source files change, providing instant visual feedback.

## Steps

1. **Verify prerequisites.** Check that `.dojowatch/config.json` and `.dojowatch/routeMap.json` exist.

2. **Verify dev server.** Check if the configured `baseUrl` is reachable.

3. **Start watching.** Inform the user that watch mode is active. Monitor for file saves in the project.

4. **On file change:** When the user saves a file:
   - Look up the saved file in `.dojowatch/routeMap.json` to find affected routes
   - If the file maps to routes, run a scoped capture:
     ```bash
     npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/capture.ts --routes <affected-routes>
     ```
   - Run quick prefilter comparison against baselines
   - Report any visual changes inline (pixel diff count, affected areas)

5. **No AI analysis in watch mode.** Watch mode is for fast feedback only (~2s per re-capture). Use `/vr-check` for full AI analysis.

6. **Exit.** Watch mode ends when the user sends another message or command.

> **Note**: This is a Phase 2 feature. For now, inform the user that watch mode is coming soon and suggest using `/vr-check --scope staged` as an alternative.
