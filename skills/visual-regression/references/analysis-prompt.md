# Visual Regression Analysis Prompt

Use this prompt template when analyzing screenshot pairs. Adapt the depth based on the pre-filter tier.

## For FULL_ANALYSIS tier

You are analyzing a visual regression test result. Compare the baseline screenshot against the current capture.

**Instructions:**
1. Examine both images carefully. Note every visual difference, no matter how small.
2. For each difference, classify it as REGRESSION, INTENTIONAL, or NOISE using the classification schema.
3. For regressions, assess severity (high/medium/low) and suggest what CSS property or component change likely caused it.
4. Consider the source code context provided — use it to determine if a change was likely intentional.
5. Check performance metrics if provided — flag regressions where LCP increased >500ms or CLS > 0.1.
6. Check a11y violations if provided — flag new violations as regressions.
7. Return your analysis as a JSON array of diff objects.

**Context provided:**
- Baseline screenshot (the approved visual state)
- Current capture (what the UI looks like now)
- Diff overlay (highlights changed pixels in red)
- Source files that render this route (for tracing root cause)
- Route map entry (which files affect this route)
- Performance metrics (LCP, CLS, FCP, TTFB) — if available
- Accessibility violations — if available

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

## Few-Shot Examples

### Example 1: Header color change (REGRESSION, medium)

**Baseline**: Dark slate header (#1e293b) with white text, 20px padding.
**Current**: Red header (#dc2626) with white text, 12px padding.
**Classification**:
```json
[
  {
    "element": "header background",
    "type": "REGRESSION",
    "severity": "medium",
    "description": "Header background changed from dark slate (#1e293b) to red (#dc2626), breaking the design system color palette. Padding also reduced from 20px to 12px.",
    "suggested_fix": "Revert .header background-color and padding in Header.tsx or globals.css"
  }
]
```

### Example 2: New feature added (INTENTIONAL)

**Baseline**: Page shows 2 cards.
**Current**: Page shows 3 cards. Third card has "New Feature" heading.
**Classification**:
```json
[
  {
    "element": "feature cards section",
    "type": "INTENTIONAL",
    "description": "New card added with 'New Feature' heading. Appears to be a deliberate feature addition, not a bug."
  }
]
```

### Example 3: Anti-aliasing noise (NOISE)

**Baseline**: Text rendered with sub-pixel anti-aliasing.
**Current**: Same text, 3 pixels differ at character edges.
**Classification**:
```json
[
  {
    "element": "body text rendering",
    "type": "NOISE",
    "description": "Sub-pixel anti-aliasing difference at text edges. No meaningful visual change."
  }
]
```

### Example 4: Performance regression (REGRESSION, high)

**Performance baseline**: LCP 1.2s, CLS 0.01
**Performance current**: LCP 3.8s, CLS 0.25
**Classification**:
```json
[
  {
    "element": "page performance",
    "type": "REGRESSION",
    "severity": "high",
    "description": "LCP degraded from 1.2s to 3.8s (+216%). CLS increased from 0.01 to 0.25, indicating significant layout instability.",
    "suggested_fix": "Check for new blocking resources, large unoptimized images, or layout-shifting elements"
  }
]
```

### Example 5: Accessibility regression (REGRESSION, high)

**A11y baseline**: 0 critical violations
**A11y current**: 2 critical violations (color-contrast, image-alt)
**Classification**:
```json
[
  {
    "element": "accessibility compliance",
    "type": "REGRESSION",
    "severity": "high",
    "description": "2 new critical a11y violations: color-contrast (3 elements) and image-alt (1 element). These were not present in the baseline.",
    "suggested_fix": "Fix contrast ratios on affected elements and add alt text to the new image"
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

## Gemini-Specific Notes

When using this prompt with Gemini in CI:
- Request `responseMimeType: "application/json"` for reliable parsing
- Set `temperature: 0.1` for consistent classifications
- Batch multiple screenshot pairs in one call (up to 20-30 pairs)
- Use `media_resolution: "MEDIUM"` for FAST_CHECK, `"HIGH"` for FULL_ANALYSIS

## Claude-Specific Notes

When Claude Code is the analysis engine:
- Claude can read the source files that render the route in the same context
- Ask Claude follow-up questions: "Why did the card shadow change?" — it reads the CSS
- Claude can trace regressions to specific git commits using `git diff` and `git blame`
- No JSON output needed — Claude reports findings conversationally

## Guidelines for Both Tiers

- When in doubt between INTENTIONAL and REGRESSION, lean toward flagging it for human review (classify as REGRESSION with low severity).
- Dynamic content that should have been masked (timestamps, counters, user-specific data) should be classified as NOISE with a note to add `data-vr-mask` to the element.
- If the diff overlay shows changes only at text edges (anti-aliasing), classify as NOISE.
- Always consider the viewport — a change that only appears on mobile might be a responsive breakpoint issue.
- Consider the auth profile — admin and student views are expected to differ. Only flag as REGRESSION if the same profile's view changed unexpectedly.
- Check color scheme — a regression in dark mode that doesn't appear in light mode suggests a theme token issue.
