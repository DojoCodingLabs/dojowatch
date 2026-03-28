# Classification Schema

## REGRESSION
An unintended visual change that likely indicates a bug.

### Severity: High
- Element completely disappeared or is invisible
- Layout is broken (elements overlapping, overflowing container)
- Text is unreadable (truncated, wrong color on background, too small)
- Interactive element is visually non-functional (button looks disabled when it shouldn't be)
- Design system token violation (wrong brand color, wrong font)

### Severity: Medium
- Element shifted noticeably out of alignment (>4px)
- Spacing inconsistency within a component (padding/margin changed)
- Border or shadow changed unexpectedly
- Image aspect ratio distorted
- Z-index conflict (element behind something it shouldn't be)

### Severity: Low
- Minor spacing difference (1-4px)
- Subtle color shift within the same hue family
- Font weight or size changed slightly
- Border radius changed
- Opacity difference

### Examples
- Primary CTA button shifted 20px right → REGRESSION (medium)
- Navigation bar disappeared on mobile → REGRESSION (high)
- Card shadow changed from 4px to 2px blur → REGRESSION (low)

## INTENTIONAL
A change that appears deliberate based on the nature of the modification.

### Indicators
- New component or section added
- Design update applied consistently across multiple elements
- Content changed (new text, updated images)
- Feature toggle visually changed the UI
- Responsive behavior updated at a breakpoint

### Examples
- New "Notifications" badge added to header → INTENTIONAL
- All buttons changed from rounded to square corners → INTENTIONAL
- Hero section text updated to new marketing copy → INTENTIONAL

## NOISE
Insignificant rendering variance that does not represent a real change.

### Indicators
- Sub-pixel anti-aliasing differences (common across environments)
- Minor font rendering shifts (hinting differences)
- Dynamic content that escaped masking (timestamp, live counter)
- Browser scrollbar presence/absence
- Cursor blink state captured mid-animation

### Examples
- 3 scattered pixels differ at text edges → NOISE
- Scrollbar visible in one capture but not baseline → NOISE
- Clock shows different time → NOISE (should have been masked)

## Output Schema

For each detected difference, produce:

```json
{
  "element": "Human-readable description of the affected UI element",
  "type": "REGRESSION | INTENTIONAL | NOISE",
  "severity": "high | medium | low",
  "description": "What changed and the likely visual impact",
  "suggested_fix": "CSS property, component, or file likely responsible",
  "bounding_box": { "x": 100, "y": 200, "width": 300, "height": 50 }
}
```

Notes:
- `severity` is only present when `type` is `REGRESSION`
- `suggested_fix` is only present when `type` is `REGRESSION`
- `bounding_box` is approximate — used for dashboard overlay rendering
