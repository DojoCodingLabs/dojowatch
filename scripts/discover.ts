/**
 * Framework-aware route discovery.
 *
 * Auto-detects the project framework and discovers all visual routes
 * that should be captured for visual regression testing.
 *
 * Supports: Next.js (App Router + Pages Router), Vite + React Router,
 * static HTML, and Storybook.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import pc from "picocolors";
import type { RouteMap } from "./types.js";

type Framework =
  | "nextjs-app"
  | "nextjs-pages"
  | "vite"
  | "static"
  | "unknown";

/**
 * Detect the project framework from file structure and package.json.
 */
export function detectFramework(projectRoot: string): Framework {
  const pkgPath = join(projectRoot, "package.json");
  let deps: Record<string, string> = {};

  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  }

  // Next.js
  if (deps["next"]) {
    if (existsSync(join(projectRoot, "app")) || existsSync(join(projectRoot, "src/app"))) {
      return "nextjs-app";
    }
    if (existsSync(join(projectRoot, "pages")) || existsSync(join(projectRoot, "src/pages"))) {
      return "nextjs-pages";
    }
    return "nextjs-app"; // default for Next.js
  }

  // Vite (React, Vue, Svelte, etc.)
  if (deps["vite"]) {
    return "vite";
  }

  // Static HTML
  if (existsSync(join(projectRoot, "index.html"))) {
    return "static";
  }

  return "unknown";
}

/**
 * Detect the dev server port from framework config.
 */
export function detectDevPort(projectRoot: string, framework: Framework): number {
  switch (framework) {
    case "nextjs-app":
    case "nextjs-pages":
      return 3000;
    case "vite": {
      const viteConfig = join(projectRoot, "vite.config.ts");
      if (existsSync(viteConfig)) {
        const content = readFileSync(viteConfig, "utf-8");
        const portMatch = content.match(/port:\s*(\d+)/);
        if (portMatch) return parseInt(portMatch[1], 10);
      }
      return 5173;
    }
    case "static":
      return 3000;
    default:
      return 3000;
  }
}

/**
 * Discover routes for Next.js App Router.
 * Finds page files (page.tsx, page.jsx) and derives URL paths.
 */
function discoverNextAppRoutes(projectRoot: string): string[] {
  const appDir = existsSync(join(projectRoot, "src/app"))
    ? join(projectRoot, "src/app")
    : join(projectRoot, "app");

  if (!existsSync(appDir)) return ["/"];

  const routes: string[] = [];
  walkDir(appDir, (filePath) => {
    const name = filePath.split("/").pop() ?? "";
    if (!name.match(/^page\.(tsx?|jsx?)$/)) return;

    const rel = relative(appDir, filePath);
    const routePath = "/" + rel
      .replace(/\/?page\.(tsx?|jsx?)$/, "")
      .replace(/\(.*?\)\//g, "") // strip route groups like (dashboard)/
      .replace(/\[\.\.\..*?\]/g, "*") // catch-all [...slug]
      .replace(/\[(.*?)\]/g, ":$1"); // dynamic [id]

    // Skip dynamic routes — they need params we can't guess
    if (!routePath.includes(":") && !routePath.includes("*")) {
      routes.push(routePath === "/" ? "/" : routePath.replace(/\/$/, ""));
    }
  });

  return routes.length > 0 ? routes : ["/"];
}

/**
 * Discover routes for Next.js Pages Router.
 */
function discoverNextPagesRoutes(projectRoot: string): string[] {
  const pagesDir = existsSync(join(projectRoot, "src/pages"))
    ? join(projectRoot, "src/pages")
    : join(projectRoot, "pages");

  if (!existsSync(pagesDir)) return ["/"];

  const routes: string[] = [];
  const exclude = new Set(["_app", "_document", "_error", "api"]);

  walkDir(pagesDir, (filePath) => {
    const ext = extname(filePath);
    if (![".tsx", ".jsx", ".ts", ".js"].includes(ext)) return;

    const rel = relative(pagesDir, filePath);
    const name = rel.replace(ext, "");

    // Skip excluded files
    if (exclude.has(name.split("/")[0])) return;
    if (name.startsWith("api/")) return;

    // Skip dynamic routes
    if (name.includes("[")) return;

    const routePath = name === "index" ? "/" : `/${name.replace(/\/index$/, "")}`;
    routes.push(routePath);
  });

  return routes.length > 0 ? routes : ["/"];
}

/**
 * Discover routes for Vite projects.
 * Attempts to find React Router config; falls back to ["/"].
 */
function discoverViteRoutes(projectRoot: string): string[] {
  // Look for common router config patterns
  const routerFiles = [
    "src/routes.tsx",
    "src/routes.ts",
    "src/router.tsx",
    "src/router.ts",
    "src/App.tsx",
    "src/main.tsx",
    "src/pages",
  ];

  // Check if pages directory exists (file-based routing like some Vite plugins)
  if (existsSync(join(projectRoot, "src/pages"))) {
    const routes: string[] = [];
    walkDir(join(projectRoot, "src/pages"), (filePath) => {
      const ext = extname(filePath);
      if (![".tsx", ".jsx"].includes(ext)) return;
      const rel = relative(join(projectRoot, "src/pages"), filePath);
      const name = rel.replace(ext, "");
      if (name.includes("[")) return;
      const routePath = name === "index" || name === "Index"
        ? "/"
        : `/${name.replace(/\/[Ii]ndex$/, "")}`;
      routes.push(routePath);
    });
    if (routes.length > 0) return routes;
  }

  // Attempt to parse route definitions from router files
  for (const file of routerFiles) {
    const fullPath = join(projectRoot, file);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, "utf-8");
    const pathMatches = content.matchAll(/path:\s*["'`](\/[^"'`]*)["'`]/g);
    const routes = [...pathMatches]
      .map((m) => m[1])
      .filter((p) => !p.includes(":") && !p.includes("*"));

    if (routes.length > 0) return routes;
  }

  return ["/"];
}

/**
 * Discover static HTML routes.
 */
function discoverStaticRoutes(projectRoot: string): string[] {
  const routes: string[] = [];

  for (const entry of readdirSync(projectRoot)) {
    if (entry.endsWith(".html")) {
      routes.push(entry === "index.html" ? "/" : `/${entry.replace(".html", "")}`);
    }
  }

  return routes.length > 0 ? routes : ["/"];
}

/**
 * Check if Storybook is configured.
 */
export function hasStorybook(projectRoot: string): boolean {
  return existsSync(join(projectRoot, ".storybook"));
}

/**
 * Discover all routes and generate a RouteMap.
 */
export function discoverRoutes(projectRoot: string): {
  framework: Framework;
  routes: string[];
  hasStorybook: boolean;
  devPort: number;
  routeMap: RouteMap;
} {
  const framework = detectFramework(projectRoot);
  const devPort = detectDevPort(projectRoot, framework);
  const storybook = hasStorybook(projectRoot);

  let routes: string[];
  switch (framework) {
    case "nextjs-app":
      routes = discoverNextAppRoutes(projectRoot);
      break;
    case "nextjs-pages":
      routes = discoverNextPagesRoutes(projectRoot);
      break;
    case "vite":
      routes = discoverViteRoutes(projectRoot);
      break;
    case "static":
      routes = discoverStaticRoutes(projectRoot);
      break;
    default:
      routes = ["/"];
  }

  // Build a basic route map (source files → routes)
  const routeMap: RouteMap = { routes: {}, stories: {} };
  for (const route of routes) {
    routeMap.routes[route] = []; // Populated by import tracing (future)
  }

  console.log(pc.dim(`  Framework: ${framework}`));
  console.log(pc.dim(`  Dev port: ${devPort}`));
  console.log(pc.dim(`  Routes: ${routes.length}`));
  console.log(pc.dim(`  Storybook: ${storybook ? "yes" : "no"}`));

  return { framework, routes, hasStorybook: storybook, devPort, routeMap };
}

/**
 * Recursively walk a directory and call fn for each file.
 */
function walkDir(dir: string, fn: (filePath: string) => void): void {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walkDir(fullPath, fn);
    } else {
      fn(fullPath);
    }
  }
}

// ─── CLI entrypoint ──────────────────────────────────────────────

function main(): void {
  const projectRoot = process.cwd();
  console.log(pc.bold("Discovering routes..."));
  const result = discoverRoutes(projectRoot);

  console.log(pc.green(`\n✓ Found ${result.routes.length} route(s):`));
  for (const route of result.routes) {
    console.log(pc.dim(`  ${route}`));
  }
}

const isDirectRun =
  process.argv[1]?.endsWith("discover.ts") ||
  process.argv[1]?.endsWith("discover.js");
if (isDirectRun) {
  main();
}
