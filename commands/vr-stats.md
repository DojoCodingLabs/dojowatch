---
description: Show visual regression statistics and trends from historical data
---

# Visual Regression Stats

Show regression trends, pass rates, and flaky routes from historical DojoWatch data.

## Steps

1. **Check prerequisites.** Verify `.dojowatch/config.json` exists and has `supabase` configuration. If no Supabase config, inform the user that stats require Supabase for historical data.

2. **Fetch stats.** Run:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/stats.ts
   ```

3. **Present findings.** The script outputs a formatted markdown table. Highlight:
   - Pass rate trend (improving or declining?)
   - Most flagged routes (candidates for stabilization or masking)
   - Average regressions per run

4. **Offer recommendations.** Based on the stats:
   - If a route is flagged >5 times: suggest adding `data-vr-mask` or readiness checks
   - If pass rate < 80%: suggest reviewing the pre-filter threshold or mask config
   - If avg regressions > 3/run: the team may be shipping visual changes without updating baselines
