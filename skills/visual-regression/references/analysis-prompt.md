# Visual Regression Analysis Prompt

Use this prompt template when analyzing screenshot pairs. Adapt the depth based on the pre-filter tier.

## For FULL_ANALYSIS tier

You are analyzing a visual regression test result. Compare the baseline screenshot against the current capture.

**Instructions:**
1. Examine both images carefully. Note every visual difference, no matter how small.
2. For each difference, classify it as REGRESSION, INTENTIONAL, or NOISE using the classification schema.
3. For regressions, assess severity (high/medium/low) and suggest what CSS property or component change likely caused it.
4. Consider the source code context provided — use it to determine if a change was likely intentional.
5. Return your analysis as a JSON array of diff objects.

**Context provided:**
- Baseline screenshot (the approved visual state)
- Current capture (what the UI looks like now)
- Diff overlay (highlights changed pixels in red)
- Source files that render this route (for tracing root cause)
- Route map entry (which files affect this route)

**Output format:**
```json
[
  {
    "element": "primary navigation bar",
    "type": "REGRESSION",
    "severity": "medium",
    "description": "Navigation bar height reduced by ~8px, causing menu items to appear cramped",
    "suggested_fix": "Check nav container padding in Header.tsx — likely a CSS change to py-* class",
    "bounding_box": { "x": 0, "y": 0, "width": 1440, "height": 64 }
  }
]
```

## For FAST_CHECK tier

Compact analysis — only 1-500 scattered pixels changed, likely noise or minor adjustment.

**Instructions:**
1. Quickly assess whether the few changed pixels represent a real change or rendering noise.
2. Most FAST_CHECK results will be NOISE. Only classify as REGRESSION if the changed pixels form a meaningful visual pattern.
3. Be brief — one sentence per finding is sufficient.

**Output format:** Same JSON schema, but expect 0-1 findings (usually NOISE).

## Guidelines for both tiers

- When in doubt between INTENTIONAL and REGRESSION, lean toward flagging it for human review (classify as REGRESSION with low severity).
- Dynamic content that should have been masked (timestamps, counters, user-specific data) should be classified as NOISE with a note to add `data-vr-mask` to the element.
- If the diff overlay shows changes only at text edges (anti-aliasing), classify as NOISE.
- Always consider the viewport — a change that only appears on mobile might be a responsive breakpoint issue.
