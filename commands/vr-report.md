---
description: Generate a markdown summary of the last visual regression check
---

# Visual Regression Report

Generate a shareable markdown summary of the most recent visual regression check.

## Steps

1. **Read last check results.** Parse `.dojowatch/last-check.json`. If it doesn't exist, inform the user to run `/vr-check` first.

2. **Generate markdown report.** Format:

   ```markdown
   ## Visual Regression Report
   **Branch**: <branch name> | **Date**: <timestamp> | **Scope**: <all|staged|branch>

   ### Summary
   | Metric | Count |
   |--------|-------|
   | Total screenshots | X |
   | Unchanged (SKIP) | Y |
   | Analyzed | Z |
   | Regressions | N |

   ### Regressions
   | Element | Severity | Description | Suggested Fix |
   |---------|----------|-------------|---------------|
   | ... | high | ... | ... |

   ### Intentional Changes
   - ...

   ### Noise (filtered)
   - ...
   ```

3. **Present to user.** Show the formatted report. Offer to copy it for sharing in Slack, Linear, or a PR description.
