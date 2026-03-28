import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { classifyDiff } from "../scripts/prefilter.js";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const TMP_DIFF_DIR = join(import.meta.dirname, ".tmp-prefilter-diffs");

describe("classifyDiff", () => {
  it("returns SKIP for identical images (SHA-256 match)", () => {
    const result = classifyDiff(
      join(FIXTURES_DIR, "identical-a.png"),
      join(FIXTURES_DIR, "identical-b.png")
    );

    expect(result.tier).toBe("SKIP");
    expect(result.pixelDiffCount).toBe(0);
    expect(result.pixelDiffPercent).toBe(0);
    expect(result.diffImagePath).toBeNull();
    expect(result.clusters).toEqual([]);
  });

  it("returns FAST_CHECK for minor scattered differences", () => {
    const result = classifyDiff(
      join(FIXTURES_DIR, "minor-diff-a.png"),
      join(FIXTURES_DIR, "minor-diff-b.png"),
      { clusterMinPixels: 500 }
    );

    expect(result.tier).toBe("FAST_CHECK");
    expect(result.pixelDiffCount).toBeGreaterThan(0);
    expect(result.pixelDiffCount).toBeLessThan(500);
    expect(result.clusters).toEqual([]);
  });

  it("returns FULL_ANALYSIS for major clustered differences", () => {
    const result = classifyDiff(
      join(FIXTURES_DIR, "major-diff-a.png"),
      join(FIXTURES_DIR, "major-diff-b.png"),
      { clusterMinPixels: 500 }
    );

    expect(result.tier).toBe("FULL_ANALYSIS");
    expect(result.pixelDiffCount).toBeGreaterThanOrEqual(500);
    expect(result.clusters.length).toBeGreaterThan(0);

    // The cluster should cover roughly the 30x30 red block
    const cluster = result.clusters[0];
    expect(cluster.pixelCount).toBeGreaterThanOrEqual(500);
    expect(cluster.bounds.width).toBeGreaterThanOrEqual(25);
    expect(cluster.bounds.height).toBeGreaterThanOrEqual(25);
  });

  it("generates a diff image when diffOutputPath is provided", () => {
    mkdirSync(TMP_DIFF_DIR, { recursive: true });
    const diffPath = join(TMP_DIFF_DIR, "test-diff.png");

    const result = classifyDiff(
      join(FIXTURES_DIR, "major-diff-a.png"),
      join(FIXTURES_DIR, "major-diff-b.png"),
      { diffOutputPath: diffPath }
    );

    expect(result.diffImagePath).toBe(diffPath);
    expect(existsSync(diffPath)).toBe(true);

    rmSync(TMP_DIFF_DIR, { recursive: true, force: true });
  });

  it("extracts viewport name from filename", () => {
    const result = classifyDiff(
      join(FIXTURES_DIR, "identical-a.png"),
      join(FIXTURES_DIR, "identical-b.png")
    );

    // "identical-b" → viewport = "b"
    expect(result.viewport).toBe("b");
  });

  it("computes pixel diff percentage", () => {
    const result = classifyDiff(
      join(FIXTURES_DIR, "major-diff-a.png"),
      join(FIXTURES_DIR, "major-diff-b.png")
    );

    // 100x100 image with ~900 changed pixels = ~9%
    expect(result.pixelDiffPercent).toBeGreaterThan(5);
    expect(result.pixelDiffPercent).toBeLessThan(15);
  });

  it("respects custom threshold", () => {
    // With a very high threshold (1.0), even different images should have 0 diffs
    const result = classifyDiff(
      join(FIXTURES_DIR, "minor-diff-a.png"),
      join(FIXTURES_DIR, "minor-diff-b.png"),
      { threshold: 1.0 }
    );

    // Hash will differ, but pixelmatch with threshold=1.0 should find 0 diffs
    expect(result.tier).toBe("SKIP");
    expect(result.pixelDiffCount).toBe(0);
  });
});
