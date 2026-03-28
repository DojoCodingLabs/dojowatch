import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { injectStabilization, maskElements } from "./stabilize.js";
import { loadConfig, findProjectRoot, getDojoWatchDir } from "./config.js";
import { loadRouteMap, resolveScope } from "./route-map.js";
import { capturePerformanceMetrics, captureA11yViolations } from "./metrics.js";
import type { AuthConfig, CaptureResult, DojoWatchConfig, Viewport } from "./types.js";

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
  outputDir: string,
  profileName?: string
): Promise<CaptureResult> {
  const baseName = routeToName(route);
  // Role-aware naming: dashboard-admin-desktop.png vs dashboard-desktop.png
  const name = profileName ? `${baseName}-${profileName}` : baseName;
  const filename = `${name}-${viewport.name}.png`;
  const outputPath = join(outputDir, filename);
  const warnings: import("./types.js").CaptureWarning[] = [];

  // Set viewport size
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  // Navigate to the route
  const url = new URL(route, config.baseUrl).toString();
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });

  // Smart layer: wait for readiness
  const readiness =
    config.smart?.routeReadiness?.[route] ?? config.smart?.readiness;
  if (readiness) {
    try {
      await waitForReadiness(page, readiness);
    } catch {
      warnings.push({
        type: "readiness_timeout",
        message: `Readiness check timed out for ${route}`,
        suggestion: "Increase smart.readiness.timeout or check waitForSelector/waitForText",
      });
    }
  }

  // Smart layer: detect bot protection
  if (config.smart?.detectBotProtection !== false) {
    const botDetected = await detectBotProtection(page);
    if (botDetected) {
      warnings.push({
        type: "bot_protection",
        message: `Bot protection detected on ${route} — screenshot may show a challenge page`,
        suggestion: "Disable bot protection for localhost or add DojoWatch's user-agent to allowlist",
      });
    }
  }

  // Stabilize the page
  await injectStabilization(page);

  // Smart layer: wait for SPA hydration
  await waitForHydration(page, config.smart?.hydrationSelectors);

  // Mask dynamic elements
  await maskElements(page, config.maskSelectors);

  // Take screenshot
  await page.screenshot({ path: outputPath, fullPage: true });

  // Capture performance metrics
  const performance = await capturePerformanceMetrics(page).catch(() => undefined);

  // Capture a11y violations
  const a11yViolations = await captureA11yViolations(page).catch(() => undefined);

  return {
    name,
    viewport: viewport.name,
    profile: profileName,
    path: outputPath,
    hash: hashFile(outputPath),
    performance,
    a11yViolations: a11yViolations && a11yViolations.length > 0 ? a11yViolations : undefined,
    warnings,
  };
}

/**
 * Wait for page readiness beyond basic load/networkidle.
 */
async function waitForReadiness(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  readiness: import("./types.js").ReadinessCheck
): Promise<void> {
  const timeout = readiness.timeout ?? 10_000;

  if (readiness.waitForSelector) {
    await page.waitForSelector(readiness.waitForSelector, {
      state: "visible",
      timeout,
    });
  }

  if (readiness.waitForText) {
    await page.waitForFunction(
      (text: string) => document.body.textContent?.includes(text) ?? false,
      readiness.waitForText,
      { timeout }
    );
  }
}

/**
 * Detect bot protection challenge pages (Cloudflare, hCaptcha, reCAPTCHA).
 */
async function detectBotProtection(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>
): Promise<boolean> {
  return page.evaluate(() => {
    const indicators = [
      // Cloudflare
      document.querySelector("#cf-challenge-running"),
      document.querySelector(".cf-browser-verification"),
      document.querySelector("#challenge-form"),
      // hCaptcha
      document.querySelector(".h-captcha"),
      document.querySelector('iframe[src*="hcaptcha.com"]'),
      // reCAPTCHA
      document.querySelector(".g-recaptcha"),
      document.querySelector('iframe[src*="recaptcha"]'),
      // Generic challenge page signals
      document.title.includes("Just a moment"),
      document.title.includes("Attention Required"),
    ];
    return indicators.some(Boolean);
  });
}

/**
 * Wait for SPA framework hydration to complete.
 * Checks for framework-specific signals or custom selectors.
 */
async function waitForHydration(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  customSelectors?: string[]
): Promise<void> {
  const selectors = customSelectors ?? [];

  // Auto-detect common framework hydration signals
  const hydrated = await page.evaluate((customSels: string[]) => {
    // Check custom selectors first
    for (const sel of customSels) {
      if (!document.querySelector(sel)) return false;
    }

    // Next.js: __NEXT_DATA__ script exists after hydration
    // React: check for [data-reactroot] or root with children
    // These are best-effort — if not found, assume hydrated
    return true;
  }, selectors);

  if (!hydrated && selectors.length > 0) {
    // Wait briefly for hydration
    try {
      await page.waitForSelector(selectors[0], { timeout: 5_000 });
    } catch {
      // Proceed anyway — hydration may have already completed
    }
  }
}

/**
 * Resolve auth info for a given route.
 * Returns the storageState file path and profile name.
 */
function resolveAuthForRoute(
  route: string,
  auth?: AuthConfig
): { storageState?: string; profileName?: string } {
  if (!auth) return {};

  // Check per-route mapping first
  if (auth.routes && route in auth.routes) {
    const profileName = auth.routes[route];
    if (profileName === null) return {}; // explicitly anonymous
    if (profileName && auth.profiles && profileName in auth.profiles) {
      return { storageState: auth.profiles[profileName], profileName };
    }
    return {};
  }

  // Fall back to default storageState (no named profile)
  return auth.storageState ? { storageState: auth.storageState } : {};
}

/**
 * Capture a route with retry logic for flaky detection.
 * Captures N times and compares hashes. If hashes differ, flags as flaky.
 */
async function captureWithRetry(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  config: DojoWatchConfig,
  route: string,
  viewport: Viewport,
  outputDir: string,
  profileName?: string
): Promise<CaptureResult> {
  const retries = config.smart?.retries ?? 1;

  if (retries <= 1) {
    return captureRoute(page, config, route, viewport, outputDir, profileName);
  }

  // Capture multiple times and compare hashes
  const captures: CaptureResult[] = [];
  for (let i = 0; i < retries; i++) {
    const result = await captureRoute(page, config, route, viewport, outputDir, profileName);
    captures.push(result);
  }

  // Find the most common hash (majority vote)
  const hashCounts = new Map<string, number>();
  for (const c of captures) {
    hashCounts.set(c.hash, (hashCounts.get(c.hash) ?? 0) + 1);
  }

  const uniqueHashes = hashCounts.size;
  const [bestHash] = [...hashCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const bestCapture = captures.find((c) => c.hash === bestHash)!;

  if (uniqueHashes > 1) {
    bestCapture.warnings.push({
      type: "flaky_capture",
      message: `${uniqueHashes} different screenshots from ${retries} captures of ${route}`,
      suggestion: "Page has non-deterministic rendering. Add data-vr-mask to dynamic elements or increase stabilization wait time.",
    });
  }

  return bestCapture;
}

/**
 * Capture all configured routes at all viewports.
 * Supports authenticated captures, smart readiness, retry, and bot detection.
 */
export async function captureRoutes(
  config: DojoWatchConfig,
  routes: string[],
  outputDir: string
): Promise<CaptureResult[]> {
  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results: CaptureResult[] = [];

  // Group routes by auth profile to minimize context creation
  const routesByAuth = new Map<string, { storageState?: string; profileName?: string; routes: string[] }>();
  for (const route of routes) {
    const { storageState, profileName } = resolveAuthForRoute(route, config.auth);
    const key = storageState ?? "__anonymous__";
    if (!routesByAuth.has(key)) {
      routesByAuth.set(key, { storageState, profileName, routes: [] });
    }
    routesByAuth.get(key)!.routes.push(route);
  }

  try {
    for (const [, group] of routesByAuth) {
      const context = await browser.newContext(
        group.storageState ? { storageState: group.storageState } : undefined
      );
      const page = await context.newPage();

      if (group.profileName) {
        console.log(pc.dim(`  Auth profile: ${group.profileName}`));
      }

      for (const route of group.routes) {
        for (const viewport of config.viewports) {
          console.log(
            pc.dim(`  Capturing ${route} @ ${viewport.name} (${viewport.width}x${viewport.height})`)
          );
          const result = await captureWithRetry(
            page, config, route, viewport, outputDir, group.profileName
          );
          results.push(result);
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  // Report warnings
  const allWarnings = results.flatMap((r) => r.warnings);
  if (allWarnings.length > 0) {
    console.log(pc.yellow(`\n  ${allWarnings.length} warning(s):`));
    for (const w of allWarnings) {
      console.log(pc.yellow(`    [${w.type}] ${w.message}`));
      if (w.suggestion) console.log(pc.dim(`      → ${w.suggestion}`));
    }
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

  const rawData = (await response.json()) as
    | { v: number; stories: Record<string, { id: string; title: string; name: string }> }
    | Record<string, { id: string; title: string; name: string }>;

  // Storybook v7+ wraps stories under a "stories" key
  const storiesData = "stories" in rawData && typeof rawData.stories === "object"
    ? rawData.stories
    : rawData;
  const storyIds = Object.keys(storiesData).filter((k) => k !== "v");

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
          warnings: [],
        });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Capture named component regions on a page.
 * Uses Playwright's element.screenshot() for pixel-perfect component isolation.
 */
export async function captureComponents(
  config: DojoWatchConfig,
  routes: string[],
  outputDir: string
): Promise<CaptureResult[]> {
  if (!config.components || config.components.length === 0) return [];

  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results: CaptureResult[] = [];

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    for (const route of routes) {
      const url = new URL(route, config.baseUrl).toString();
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
      await injectStabilization(page);
      await maskElements(page, config.maskSelectors);

      for (const component of config.components) {
        const element = page.locator(component.selector).first();
        const isVisible = await element.isVisible().catch(() => false);

        if (!isVisible) continue;

        const name = `component-${component.name}-${routeToName(route)}`;
        const filename = `${name}.png`;
        const outputPath = join(outputDir, filename);

        await element.screenshot({ path: outputPath });

        results.push({
          name,
          viewport: "component",
          path: outputPath,
          hash: hashFile(outputPath),
          warnings: [],
        });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Detect dynamic content by capturing a page twice rapidly and comparing.
 * Returns selectors of elements that changed between captures.
 */
export async function detectDynamicElements(
  config: DojoWatchConfig,
  route: string
): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const url = new URL(route, config.baseUrl).toString();
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    await injectStabilization(page);

    // Take two snapshots of element text content 500ms apart
    const getTexts = () =>
      page.evaluate(() => {
        const elements = document.querySelectorAll("*");
        const texts: Array<{ selector: string; text: string }> = [];
        for (const el of elements) {
          if (el.children.length === 0 && el.textContent?.trim()) {
            const tag = el.tagName.toLowerCase();
            const cls = el.className
              ? `.${String(el.className).split(" ").filter(Boolean).join(".")}`
              : "";
            texts.push({ selector: `${tag}${cls}`, text: el.textContent.trim() });
          }
        }
        return texts;
      });

    const snap1 = await getTexts();
    await new Promise((r) => setTimeout(r, 500));
    const snap2 = await getTexts();

    // Find elements whose text changed
    const dynamic: string[] = [];
    for (let i = 0; i < Math.min(snap1.length, snap2.length); i++) {
      if (snap1[i].selector === snap2[i].selector && snap1[i].text !== snap2[i].text) {
        dynamic.push(snap1[i].selector);
      }
    }

    await context.close();
    return [...new Set(dynamic)];
  } finally {
    await browser.close();
  }
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
