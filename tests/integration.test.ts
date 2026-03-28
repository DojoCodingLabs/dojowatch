/**
 * Integration tests for DojoWatch pipeline.
 *
 * Tests the full flow: config → capture → prefilter → comment generation.
 * Uses a minimal static HTML page served by a local HTTP server.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { captureRoutes } from "../scripts/capture.js";
import { prefilterAll } from "../scripts/prefilter.js";
import { promoteToBaseline } from "../scripts/baseline.js";
import { generateCommentMarkdown } from "../scripts/comment.js";
import type { DojoWatchConfig, CheckRun } from "../scripts/types.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-integration");
const PORT = 9876;
let server: Server;

const HTML_PAGE = `<!DOCTYPE html>
<html>
<head><style>body { margin: 0; font-family: sans-serif; background: #1a1a2e; color: white; }
.header { padding: 16px; background: #16213e; } .content { padding: 32px; }
.card { background: #0f3460; border-radius: 8px; padding: 24px; margin: 16px 0; }
</style></head>
<body>
  <div class="header"><h1>DojoWatch Test</h1></div>
  <div class="content">
    <div class="card"><h2>Dashboard</h2><p>Visual regression testing works.</p></div>
  </div>
</body>
</html>`;

const MODIFIED_HTML = `<!DOCTYPE html>
<html>
<head><style>body { margin: 0; font-family: sans-serif; background: #1a1a2e; color: white; }
.header { padding: 24px; background: #e94560; } .content { padding: 32px; }
.card { background: #0f3460; border-radius: 8px; padding: 24px; margin: 16px 0; }
</style></head>
<body>
  <div class="header"><h1>DojoWatch Test — Modified</h1></div>
  <div class="content">
    <div class="card"><h2>Dashboard</h2><p>Visual regression testing works.</p></div>
    <div class="card"><h2>New Feature</h2><p>This card was added.</p></div>
  </div>
</body>
</html>`;

let currentHTML = HTML_PAGE;

const config: DojoWatchConfig = {
  project: "integration-test",
  baseUrl: `http://localhost:${PORT}`,
  viewports: [{ name: "desktop", width: 800, height: 600 }],
  routes: ["/"],
  maskSelectors: [],
  engine: {
    local: { model: "claude" },
    ci: { model: "gemini-3.1-pro-preview", apiKeyEnv: "GOOGLE_GENAI_API_KEY" },
  },
  prefilter: { threshold: 0.05, clusterMinPixels: 500 },
};

beforeAll(async () => {
  // Set up test directory
  mkdirSync(join(TEST_DIR, ".dojowatch"), { recursive: true });
  writeFileSync(
    join(TEST_DIR, ".dojowatch", "config.json"),
    JSON.stringify(config)
  );

  // Start a minimal HTTP server
  server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(currentHTML);
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, resolve);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("DojoWatch integration pipeline", () => {
  it("captures screenshots from a live server", async () => {
    const capturesDir = join(TEST_DIR, ".dojowatch", "captures");
    const results = await captureRoutes(config, ["/"], capturesDir);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("index");
    expect(results[0].viewport).toBe("desktop");
    expect(existsSync(results[0].path)).toBe(true);
    // SHA-256 hash should be a 64-char hex string
    expect(results[0].hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("promotes captures to baselines", () => {
    const { promoted } = promoteToBaseline(TEST_DIR);
    expect(promoted).toHaveLength(1);
    expect(promoted[0]).toBe("index-desktop.png");

    const baselinesDir = join(TEST_DIR, ".dojowatch", "baselines");
    expect(existsSync(join(baselinesDir, "index-desktop.png"))).toBe(true);
  });

  it("prefilter returns SKIP when captures match baselines", () => {
    const results = prefilterAll(TEST_DIR);
    expect(results).toHaveLength(1);
    expect(results[0].tier).toBe("SKIP");
    expect(results[0].pixelDiffCount).toBe(0);
  });

  it("prefilter detects changes after modifying the page", async () => {
    // Switch to the modified page
    currentHTML = MODIFIED_HTML;

    // Re-capture
    const capturesDir = join(TEST_DIR, ".dojowatch", "captures");
    await captureRoutes(config, ["/"], capturesDir);

    // Run prefilter
    const results = prefilterAll(TEST_DIR);
    expect(results).toHaveLength(1);
    expect(results[0].tier).not.toBe("SKIP");
    expect(results[0].pixelDiffCount).toBeGreaterThan(0);

    // Diff image should be generated
    const diffsDir = join(TEST_DIR, ".dojowatch", "diffs");
    const diffFiles = existsSync(diffsDir)
      ? readdirSync(diffsDir).filter((f) => f.endsWith(".png"))
      : [];
    expect(diffFiles.length).toBeGreaterThan(0);
  });

  it("generates a valid PR comment from a check run", () => {
    const prefilterResults = prefilterAll(TEST_DIR);

    const checkRun: CheckRun = {
      timestamp: new Date().toISOString(),
      branch: "test-branch",
      commitSha: "abc1234567890",
      scope: "all",
      prefilterResults,
      analysisResults: [
        {
          name: "index-desktop",
          viewport: "desktop",
          tier: "FULL_ANALYSIS",
          diffs: [
            {
              element: "header background",
              type: "REGRESSION",
              severity: "medium",
              description: "Header changed from dark blue to red",
              suggested_fix: "Check .header background color in CSS",
            },
            {
              element: "new card section",
              type: "INTENTIONAL",
              description: "New feature card added below dashboard",
            },
          ],
        },
      ],
      summary: {
        total: 1,
        skipped: 0,
        analyzed: 1,
        regressions: 1,
        intentional: 1,
        noise: 0,
      },
    };

    const markdown = generateCommentMarkdown(checkRun);

    expect(markdown).toContain("DojoWatch Visual Regression Report");
    expect(markdown).toContain("header background");
    expect(markdown).toContain("❌ Regressions");
    expect(markdown).toContain("medium");
    expect(markdown).toContain("new card section");
    expect(markdown).toContain("Intentional changes");
  });
});

describe("DojoWatch auth support", () => {
  const AUTH_TEST_DIR = join(import.meta.dirname, ".tmp-auth-test");
  const AUTH_PORT = 9879;
  let authServer: Server;

  const PROTECTED_HTML = `<!DOCTYPE html><html><body>
    <h1 id="status">Please log in</h1>
    <script>
      if (document.cookie.includes('session=authenticated')) {
        document.getElementById('status').textContent = 'Welcome, authenticated user!';
      }
    </script>
  </body></html>`;

  const authConfig: DojoWatchConfig = {
    project: "auth-test",
    baseUrl: `http://localhost:${AUTH_PORT}`,
    viewports: [{ name: "desktop", width: 800, height: 600 }],
    routes: ["/"],
    maskSelectors: [],
    engine: {
      local: { model: "claude" },
      ci: { model: "gemini", apiKeyEnv: "KEY" },
    },
    prefilter: { threshold: 0.05, clusterMinPixels: 500 },
  };

  beforeAll(async () => {
    mkdirSync(join(AUTH_TEST_DIR, ".dojowatch"), { recursive: true });
    writeFileSync(
      join(AUTH_TEST_DIR, ".dojowatch", "config.json"),
      JSON.stringify(authConfig)
    );

    authServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(PROTECTED_HTML);
    });

    await new Promise<void>((resolve) => {
      authServer.listen(AUTH_PORT, resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      authServer.close(() => resolve());
    });
    rmSync(AUTH_TEST_DIR, { recursive: true, force: true });
  });

  it("captures anonymous page when no auth is configured", async () => {
    const capturesDir = join(AUTH_TEST_DIR, ".dojowatch", "captures");
    const results = await captureRoutes(authConfig, ["/"], capturesDir);

    expect(results).toHaveLength(1);
    expect(existsSync(results[0].path)).toBe(true);
  });

  it("captures authenticated page when storageState provides session cookie", async () => {
    // Create a storageState file with the session cookie
    const storageState = {
      cookies: [
        {
          name: "session",
          value: "authenticated",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax" as const,
        },
      ],
      origins: [],
    };

    const authStatePath = join(AUTH_TEST_DIR, ".dojowatch", "auth.json");
    writeFileSync(authStatePath, JSON.stringify(storageState));

    // Capture with auth
    const configWithAuth: DojoWatchConfig = {
      ...authConfig,
      auth: { storageState: authStatePath },
    };
    const capturesDir = join(AUTH_TEST_DIR, ".dojowatch", "captures-auth");
    const results = await captureRoutes(configWithAuth, ["/"], capturesDir);

    expect(results).toHaveLength(1);
    expect(existsSync(results[0].path)).toBe(true);

    // The hashes should differ — anonymous vs authenticated show different content
    const anonDir = join(AUTH_TEST_DIR, ".dojowatch", "captures");
    const anonCaptures = await captureRoutes(authConfig, ["/"], anonDir);

    expect(results[0].hash).not.toBe(anonCaptures[0].hash);
  });
});

describe("DojoWatch advanced capture features", () => {
  const ADV_TEST_DIR = join(import.meta.dirname, ".tmp-advanced-test");
  const ADV_PORT = 9881;
  let advServer: Server;

  const THEMED_HTML = `<!DOCTYPE html>
    <html><head>
    <style>
      @media (prefers-color-scheme: dark) { body { background: #000; color: #fff; } }
      @media (prefers-color-scheme: light) { body { background: #fff; color: #000; } }
      body { margin: 0; padding: 20px; font-family: sans-serif; }
    </style>
    </head><body><h1>Theme Test</h1><p>Content</p></body></html>`;

  const baseConfig: DojoWatchConfig = {
    project: "adv-test",
    baseUrl: `http://localhost:${ADV_PORT}`,
    viewports: [{ name: "desktop", width: 800, height: 600 }],
    routes: ["/"],
    maskSelectors: [],
    engine: { local: { model: "claude" }, ci: { model: "gemini", apiKeyEnv: "KEY" } },
    prefilter: { threshold: 0.05, clusterMinPixels: 500 },
  };

  beforeAll(async () => {
    mkdirSync(join(ADV_TEST_DIR, ".dojowatch"), { recursive: true });
    writeFileSync(join(ADV_TEST_DIR, ".dojowatch", "config.json"), JSON.stringify(baseConfig));

    advServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(THEMED_HTML);
    });
    await new Promise<void>((r) => advServer.listen(ADV_PORT, r));
  });

  afterAll(async () => {
    await new Promise<void>((r) => advServer.close(() => r()));
    rmSync(ADV_TEST_DIR, { recursive: true, force: true });
  });

  it("captures with color schemes (light + dark produce different screenshots)", async () => {
    const configWithSchemes: DojoWatchConfig = {
      ...baseConfig,
      colorSchemes: ["light", "dark"],
    };
    const capturesDir = join(ADV_TEST_DIR, ".dojowatch", "captures-schemes");
    const results = await captureRoutes(configWithSchemes, ["/"], capturesDir);

    // Should produce 2 captures: one light, one dark
    expect(results.length).toBe(2);
    expect(results[0].colorScheme).toBe("light");
    expect(results[1].colorScheme).toBe("dark");
    // Light and dark should have different hashes
    expect(results[0].hash).not.toBe(results[1].hash);
  });

  it("captures with parallel concurrency", async () => {
    const configParallel: DojoWatchConfig = {
      ...baseConfig,
      viewports: [
        { name: "desktop", width: 800, height: 600 },
        { name: "mobile", width: 375, height: 812 },
      ],
      smart: { concurrency: 2 },
    };
    const capturesDir = join(ADV_TEST_DIR, ".dojowatch", "captures-parallel");
    const results = await captureRoutes(configParallel, ["/"], capturesDir);

    expect(results.length).toBe(2);
    expect(results.every((r) => r.path !== "")).toBe(true);
  });

  it("handles per-route capture timeout gracefully", async () => {
    const configTimeout: DojoWatchConfig = {
      ...baseConfig,
      baseUrl: "http://localhost:1", // unreachable
      smart: { routeTimeout: 2000 },
    };
    const capturesDir = join(ADV_TEST_DIR, ".dojowatch", "captures-timeout");
    const results = await captureRoutes(configTimeout, ["/"], capturesDir);

    // Should not crash — returns result with warning
    expect(results.length).toBe(1);
    expect(results[0].warnings.length).toBeGreaterThan(0);
  });

  it("captures include performance metrics", async () => {
    const capturesDir = join(ADV_TEST_DIR, ".dojowatch", "captures-perf");
    const results = await captureRoutes(baseConfig, ["/"], capturesDir);

    expect(results.length).toBe(1);
    // Performance metrics should be present (may be null for some values)
    expect(results[0].performance).toBeDefined();
  });
});
