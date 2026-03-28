import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { injectStabilization, maskElements } from "./stabilize.js";
import { loadConfig, findProjectRoot, getDojoWatchDir } from "./config.js";
import { loadRouteMap, resolveScope } from "./route-map.js";
import type { CaptureResult, DojoWatchConfig, Viewport } from "./types.js";

/**
 * Derive a filesystem-safe name from a route path.
 * "/" → "index", "/dashboard" → "dashboard", "/foo/bar" → "foo-bar"
 */
function routeToName(route: string): string {
  if (route === "/") return "index";
  return route
    .replace(/^\//, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "_");
}

/**
 * Compute SHA-256 hash of a file.
 */
function hashFile(filePath: string): string {
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Capture a single route at a single viewport.
 */
async function captureRoute(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  config: DojoWatchConfig,
  route: string,
  viewport: Viewport,
  outputDir: string
): Promise<CaptureResult> {
  const name = routeToName(route);
  const filename = `${name}-${viewport.name}.png`;
  const outputPath = join(outputDir, filename);

  // Set viewport size
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  // Navigate to the route
  const url = new URL(route, config.baseUrl).toString();
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });

  // Stabilize the page
  await injectStabilization(page);

  // Mask dynamic elements
  await maskElements(page, config.maskSelectors);

  // Take screenshot
  await page.screenshot({ path: outputPath, fullPage: true });

  return {
    name,
    viewport: viewport.name,
    path: outputPath,
    hash: hashFile(outputPath),
  };
}

/**
 * Capture all configured routes at all viewports.
 */
export async function captureRoutes(
  config: DojoWatchConfig,
  routes: string[],
  outputDir: string
): Promise<CaptureResult[]> {
  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results: CaptureResult[] = [];

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    for (const route of routes) {
      for (const viewport of config.viewports) {
        console.log(
          pc.dim(`  Capturing ${route} @ ${viewport.name} (${viewport.width}x${viewport.height})`)
        );
        const result = await captureRoute(page, config, route, viewport, outputDir);
        results.push(result);
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Capture Storybook stories at all viewports.
 */
export async function captureStorybook(
  storybookUrl: string,
  viewports: Viewport[],
  outputDir: string,
  maskSelectors: string[]
): Promise<CaptureResult[]> {
  mkdirSync(outputDir, { recursive: true });

  // Fetch stories.json to discover all stories
  const storiesUrl = new URL("/stories.json", storybookUrl).toString();
  const response = await fetch(storiesUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Storybook stories from ${storiesUrl}: ${response.status}`
    );
  }

  const storiesData = (await response.json()) as Record<string, { id: string; title: string; name: string }>;
  const storyIds = Object.keys(storiesData);

  console.log(pc.dim(`  Found ${storyIds.length} Storybook stories`));

  const browser = await chromium.launch({ headless: true });
  const results: CaptureResult[] = [];

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    for (const storyId of storyIds) {
      const iframeUrl = new URL(
        `/iframe.html?id=${storyId}&viewMode=story`,
        storybookUrl
      ).toString();

      for (const viewport of viewports) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });

        await page.goto(iframeUrl, { waitUntil: "load", timeout: 30_000 });
        await injectStabilization(page);
        await maskElements(page, maskSelectors);

        const name = `story-${storyId}`;
        const filename = `${name}-${viewport.name}.png`;
        const outputPath = join(outputDir, filename);

        await page.screenshot({ path: outputPath, fullPage: true });

        results.push({
          name,
          viewport: viewport.name,
          path: outputPath,
          hash: hashFile(outputPath),
        });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return results;
}

// ─── CLI entrypoint ──────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const scopeArg = args.find((a) => a.startsWith("--scope="))?.split("=")[1] ?? "all";
  const scope = scopeArg as "all" | "staged" | "branch";

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(pc.red("No .dojowatch/config.json found. Run /vr-init first."));
    process.exit(1);
  }

  const config = loadConfig(projectRoot);
  const dojowatchDir = getDojoWatchDir(projectRoot);
  const capturesDir = join(dojowatchDir, "captures");

  // Determine which routes to capture
  let routes: string[];
  if (scope === "all") {
    routes = config.routes;
  } else {
    const routeMap = loadRouteMap(projectRoot);
    routes = resolveScope(scope, routeMap, config.routes);
  }

  if (routes.length === 0) {
    console.log(pc.yellow("No routes to capture for the given scope."));
    process.exit(0);
  }

  console.log(pc.bold(`Capturing ${routes.length} route(s) × ${config.viewports.length} viewport(s)...`));

  const results = await captureRoutes(config, routes, capturesDir);

  // Capture Storybook stories if configured
  if (config.storybookUrl) {
    console.log(pc.bold("\nCapturing Storybook stories..."));
    const storyResults = await captureStorybook(
      config.storybookUrl,
      config.viewports,
      capturesDir,
      config.maskSelectors
    );
    results.push(...storyResults);
  }

  console.log(pc.green(`\n✓ Captured ${results.length} screenshot(s)`));
}

// Run if executed directly
const isDirectRun =
  process.argv[1]?.endsWith("capture.ts") ||
  process.argv[1]?.endsWith("capture.js");
if (isDirectRun) {
  main().catch((err) => {
    console.error(pc.red(String(err)));
    process.exit(1);
  });
}
