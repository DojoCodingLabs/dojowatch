import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import pc from "picocolors";
import { computeHash } from "./baseline.js";
import { findProjectRoot, getDojoWatchDir, loadConfig } from "./config.js";
import type { PrefilterResult, Tier, Cluster, BoundingBox } from "./types.js";

/**
 * Run pixelmatch on two PNG buffers.
 * Returns the number of different pixels and the diff image buffer.
 */
function runPixelmatch(
  baselineData: Buffer,
  captureData: Buffer,
  threshold: number
): { diffCount: number; diffPng: PNG } {
  const baseline = PNG.sync.read(baselineData);
  const capture = PNG.sync.read(captureData);

  // Handle size mismatches by using the larger dimensions
  const width = Math.max(baseline.width, capture.width);
  const height = Math.max(baseline.height, capture.height);

  // Resize images to match if needed (pad with transparent pixels)
  const baselineResized = resizeIfNeeded(baseline, width, height);
  const captureResized = resizeIfNeeded(capture, width, height);

  const diffPng = new PNG({ width, height });

  const diffCount = pixelmatch(
    baselineResized.data,
    captureResized.data,
    diffPng.data,
    width,
    height,
    { threshold, includeAA: false }
  );

  return { diffCount, diffPng };
}

/**
 * Pad a PNG to the target dimensions with transparent pixels.
 */
function resizeIfNeeded(png: PNG, targetWidth: number, targetHeight: number): PNG {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png;
  }

  const resized = new PNG({ width: targetWidth, height: targetHeight, fill: true });

  // Copy original pixels into the resized buffer
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const srcIdx = (png.width * y + x) << 2;
      const dstIdx = (targetWidth * y + x) << 2;
      resized.data[dstIdx] = png.data[srcIdx];
      resized.data[dstIdx + 1] = png.data[srcIdx + 1];
      resized.data[dstIdx + 2] = png.data[srcIdx + 2];
      resized.data[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }

  return resized;
}

/**
 * Check if a pixel in the diff image is a changed pixel.
 * pixelmatch default: diff pixels = (255, 0, 0), unchanged = (232, 232, 232).
 * We check R >= 200 AND G < 50 to distinguish diff pixels from the gray background.
 */
function isDiffPixel(data: Uint8Array, pixelIdx: number): boolean {
  return data[pixelIdx] >= 200 && data[pixelIdx + 1] < 50 && data[pixelIdx + 3] >= 128;
}

/**
 * Detect spatial clusters of changed pixels in a diff image.
 *
 * Algorithm: scan the diff image for diff-colored pixels (pixelmatch marks diffs in red).
 * Group adjacent changed pixels using a flood-fill approach, then compute
 * bounding boxes for each group.
 */
function detectClusters(
  diffPng: PNG,
  minClusterSize: number
): Cluster[] {
  const { width, height, data } = diffPng;
  const visited = new Uint8Array(width * height);
  const clusters: Cluster[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;

      const pixelIdx = idx << 2;
      // pixelmatch marks diff pixels as (255, 0, 0) by default.
      // Unchanged pixels are gray (232, 232, 232). Check R is high AND G is low.
      if (!isDiffPixel(data, pixelIdx)) continue;

      // Flood-fill to find all connected diff pixels
      const pixels = floodFill(data, visited, width, height, x, y);

      if (pixels.length >= minClusterSize) {
        clusters.push({
          bounds: computeBoundingBox(pixels),
          pixelCount: pixels.length,
        });
      }
    }
  }

  return clusters;
}

/**
 * Flood-fill from a starting pixel to find all connected diff pixels.
 * Uses a queue-based BFS with 8-connectivity (including diagonals).
 */
function floodFill(
  data: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number
): Array<[number, number]> {
  const pixels: Array<[number, number]> = [];
  const queue: Array<[number, number]> = [[startX, startY]];
  let queueHead = 0;

  visited[startY * width + startX] = 1;

  while (queueHead < queue.length) {
    const [cx, cy] = queue[queueHead++];;
    pixels.push([cx, cy]);

    // Check 8 neighbors (including diagonals)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const nIdx = ny * width + nx;
        if (visited[nIdx]) continue;

        const pixelIdx = nIdx << 2;
        if (isDiffPixel(data, pixelIdx)) {
          visited[nIdx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }

  return pixels;
}

/**
 * Compute the bounding box of a set of pixel coordinates.
 */
function computeBoundingBox(pixels: Array<[number, number]>): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of pixels) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Classify a single screenshot pair into a pre-filter tier.
 *
 * Pipeline:
 * 1. SHA-256 hash comparison → SKIP if identical
 * 2. pixelmatch → SKIP if 0 diff pixels
 * 3. Cluster detection on diff image
 * 4. FAST_CHECK if scattered (no clusters), FULL_ANALYSIS if clustered or >threshold
 */
export function classifyDiff(
  baselinePath: string,
  capturePath: string,
  options: {
    threshold?: number;
    clusterMinPixels?: number;
    diffOutputPath?: string;
  } = {}
): PrefilterResult {
  const { threshold = 0.05, clusterMinPixels = 500, diffOutputPath } = options;

  const name = basename(capturePath, ".png");
  // Extract viewport from name (e.g., "index-desktop" → "desktop")
  const parts = name.split("-");
  const viewport = parts[parts.length - 1];

  // Step 1: SHA-256 hash comparison
  const baselineHash = computeHash(baselinePath);
  const captureHash = computeHash(capturePath);

  if (baselineHash === captureHash) {
    return {
      name,
      viewport,
      tier: "SKIP",
      pixelDiffCount: 0,
      pixelDiffPercent: 0,
      diffImagePath: null,
      clusters: [],
    };
  }

  // Step 2: pixelmatch comparison
  const baselineData = readFileSync(baselinePath);
  const captureData = readFileSync(capturePath);
  const { diffCount, diffPng } = runPixelmatch(baselineData, captureData, threshold);

  const totalPixels = diffPng.width * diffPng.height;
  const diffPercent = totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0;

  if (diffCount === 0) {
    return {
      name,
      viewport,
      tier: "SKIP",
      pixelDiffCount: 0,
      pixelDiffPercent: 0,
      diffImagePath: null,
      clusters: [],
    };
  }

  // Save diff image
  let savedDiffPath: string | null = null;
  if (diffOutputPath) {
    const diffBuffer = PNG.sync.write(diffPng);
    writeFileSync(diffOutputPath, diffBuffer);
    savedDiffPath = diffOutputPath;
  }

  // Step 3: Cluster detection
  const clusters = detectClusters(diffPng, clusterMinPixels);

  // Step 4: Tier classification
  let tier: Tier;
  if (clusters.length > 0 || diffCount >= clusterMinPixels) {
    tier = "FULL_ANALYSIS";
  } else {
    tier = "FAST_CHECK";
  }

  return {
    name,
    viewport,
    tier,
    pixelDiffCount: diffCount,
    pixelDiffPercent: Math.round(diffPercent * 100) / 100,
    diffImagePath: savedDiffPath,
    clusters,
  };
}

/**
 * Run prefilter on all captures that have baselines.
 */
export function prefilterAll(
  projectRoot: string
): PrefilterResult[] {
  const config = loadConfig(projectRoot);
  const dojowatchDir = getDojoWatchDir(projectRoot);
  const baselinesDir = join(dojowatchDir, "baselines");
  const capturesDir = join(dojowatchDir, "captures");
  const diffsDir = join(dojowatchDir, "diffs");

  if (!existsSync(baselinesDir) || !existsSync(capturesDir)) {
    return [];
  }

  mkdirSync(diffsDir, { recursive: true });

  const captures = readdirSync(capturesDir).filter((f) => f.endsWith(".png"));
  const results: PrefilterResult[] = [];

  for (const capture of captures) {
    const baselinePath = join(baselinesDir, capture);
    const capturePath = join(capturesDir, capture);

    if (!existsSync(baselinePath)) {
      // New screenshot — no baseline to compare against. Treat as FULL_ANALYSIS.
      const name = basename(capture, ".png");
      const parts = name.split("-");
      results.push({
        name,
        viewport: parts[parts.length - 1],
        tier: "FULL_ANALYSIS",
        pixelDiffCount: -1,
        pixelDiffPercent: 100,
        diffImagePath: null,
        clusters: [],
      });
      continue;
    }

    const diffOutputPath = join(diffsDir, capture.replace(".png", "-diff.png"));

    const result = classifyDiff(baselinePath, capturePath, {
      threshold: config.prefilter.threshold,
      clusterMinPixels: config.prefilter.clusterMinPixels,
      diffOutputPath,
    });

    results.push(result);
  }

  return results;
}

// ─── CLI entrypoint ──────────────────────────────────────────────

function main(): void {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(pc.red("No .dojowatch/config.json found. Run /vr-init first."));
    process.exit(1);
  }

  console.log(pc.bold("Running pre-filter..."));
  const results = prefilterAll(projectRoot);

  const skip = results.filter((r) => r.tier === "SKIP").length;
  const fastCheck = results.filter((r) => r.tier === "FAST_CHECK").length;
  const fullAnalysis = results.filter((r) => r.tier === "FULL_ANALYSIS").length;

  console.log(pc.dim(`\n  SKIP: ${skip} | FAST_CHECK: ${fastCheck} | FULL_ANALYSIS: ${fullAnalysis}`));

  for (const r of results) {
    const tierColor =
      r.tier === "SKIP" ? pc.green : r.tier === "FAST_CHECK" ? pc.yellow : pc.red;
    console.log(
      `  ${tierColor(r.tier.padEnd(14))} ${r.name} (${r.pixelDiffCount} px, ${r.pixelDiffPercent}%)`
    );
  }

  // Write report
  const dojowatchDir = getDojoWatchDir(projectRoot);
  const reportPath = join(dojowatchDir, "prefilter-report.json");
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(pc.green(`\n✓ Report saved to ${reportPath}`));
}

const isDirectRun =
  process.argv[1]?.endsWith("prefilter.ts") ||
  process.argv[1]?.endsWith("prefilter.js");
if (isDirectRun) {
  main();
}
