import { describe, it, expect } from "vitest";
import { generateCommentMarkdown } from "../scripts/comment.js";
import type { CheckRun } from "../scripts/types.js";

const sampleCheckRun: CheckRun = {
  timestamp: "2026-03-27T22:00:00Z",
  branch: "feat/redesign",
  commitSha: "abc1234567890",
  scope: "all",
  prefilterResults: [
    {
      name: "index-desktop",
      viewport: "desktop",
      tier: "SKIP",
      pixelDiffCount: 0,
      pixelDiffPercent: 0,
      diffImagePath: null,
      clusters: [],
    },
    {
      name: "dashboard-desktop",
      viewport: "desktop",
      tier: "FULL_ANALYSIS",
      pixelDiffCount: 1200,
      pixelDiffPercent: 3.5,
      diffImagePath: "/tmp/diffs/dashboard-desktop-diff.png",
      clusters: [{ bounds: { x: 10, y: 20, width: 100, height: 50 }, pixelCount: 800 }],
    },
    {
      name: "settings-mobile",
      viewport: "mobile",
      tier: "FAST_CHECK",
      pixelDiffCount: 15,
      pixelDiffPercent: 0.01,
      diffImagePath: null,
      clusters: [],
    },
  ],
  analysisResults: [
    {
      name: "dashboard-desktop",
      viewport: "desktop",
      tier: "FULL_ANALYSIS",
      diffs: [
        {
          element: "navigation bar",
          type: "REGRESSION",
          severity: "medium",
          description: "Nav bar height reduced by 8px",
          suggested_fix: "Check py-* class in Header.tsx",
        },
        {
          element: "sidebar panel",
          type: "INTENTIONAL",
          description: "New notifications widget added",
        },
      ],
    },
    {
      name: "settings-mobile",
      viewport: "mobile",
      tier: "FAST_CHECK",
      diffs: [
        {
          element: "font rendering",
          type: "NOISE",
          description: "Sub-pixel anti-aliasing shift at text edges",
        },
      ],
    },
  ],
  summary: {
    total: 3,
    skipped: 1,
    analyzed: 2,
    regressions: 1,
    intentional: 1,
    noise: 1,
  },
};

describe("generateCommentMarkdown", () => {
  it("generates a complete markdown report", () => {
    const md = generateCommentMarkdown(sampleCheckRun);

    // Header
    expect(md).toContain("## 🔍 DojoWatch Visual Regression Report");
    expect(md).toContain("`feat/redesign`");
    expect(md).toContain("`abc1234`");

    // Summary table
    expect(md).toContain("| Total screenshots | 3 |");
    expect(md).toContain("| Unchanged (SKIP) | 1 |");
    expect(md).toContain("| **Regressions** | **1** |");

    // Regressions table
    expect(md).toContain("### ❌ Regressions");
    expect(md).toContain("navigation bar");
    expect(md).toContain("Nav bar height reduced by 8px");
    expect(md).toContain("🟡 medium");

    // Intentional (collapsed)
    expect(md).toContain("Intentional changes (1)");
    expect(md).toContain("notifications widget");

    // Noise (collapsed)
    expect(md).toContain("Noise filtered (1)");
    expect(md).toContain("anti-aliasing");

    // Footer
    expect(md).toContain("DojoWatch");
  });

  it("shows 'No regressions' when there are none", () => {
    const cleanRun: CheckRun = {
      ...sampleCheckRun,
      analysisResults: [
        {
          name: "index-desktop",
          viewport: "desktop",
          tier: "FAST_CHECK",
          diffs: [
            {
              element: "hero section",
              type: "INTENTIONAL",
              description: "Updated marketing copy",
            },
          ],
        },
      ],
      summary: { ...sampleCheckRun.summary, regressions: 0 },
    };

    const md = generateCommentMarkdown(cleanRun);
    expect(md).toContain("### ✅ No regressions detected");
    expect(md).not.toContain("### ❌ Regressions");
  });

  it("includes pre-filter breakdown", () => {
    const md = generateCommentMarkdown(sampleCheckRun);
    expect(md).toContain("Pre-filter breakdown");
    expect(md).toContain("index-desktop");
    expect(md).toContain("SKIP");
    expect(md).toContain("FULL_ANALYSIS");
  });
});
