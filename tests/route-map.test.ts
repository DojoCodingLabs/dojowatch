import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  loadRouteMap,
  resolveScope,
  matchFilesToStories,
} from "../scripts/route-map.js";
import type { RouteMap } from "../scripts/types.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-routemap-test");

const sampleRouteMap: RouteMap = {
  routes: {
    "/": ["app/page.tsx", "app/layout.tsx"],
    "/dashboard": ["app/dashboard/page.tsx", "components/Chart.tsx"],
    "/settings": ["app/settings/page.tsx"],
  },
  stories: {
    "button--primary": ["components/Button.tsx"],
    "card--default": ["components/Card.tsx"],
  },
};

beforeEach(() => {
  mkdirSync(join(TMP_DIR, ".dojowatch"), { recursive: true });
  writeFileSync(
    join(TMP_DIR, ".dojowatch", "routeMap.json"),
    JSON.stringify(sampleRouteMap)
  );
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("loadRouteMap", () => {
  it("loads a valid route map", () => {
    const routeMap = loadRouteMap(TMP_DIR);
    expect(routeMap.routes["/"]).toEqual(["app/page.tsx", "app/layout.tsx"]);
    expect(routeMap.stories["button--primary"]).toEqual([
      "components/Button.tsx",
    ]);
  });

  it("throws when no route map exists", () => {
    rmSync(join(TMP_DIR, ".dojowatch", "routeMap.json"));
    expect(() => loadRouteMap(TMP_DIR)).toThrow("No .dojowatch/routeMap.json found");
  });
});

describe("resolveScope", () => {
  const allRoutes = ["/", "/dashboard", "/settings"];

  it("returns all routes for scope 'all'", () => {
    const routes = resolveScope("all", sampleRouteMap, allRoutes);
    expect(routes).toEqual(allRoutes);
  });

  // Note: "staged" and "branch" scopes depend on git state,
  // so we test the matching logic directly instead.
});

describe("matchFilesToStories", () => {
  it("returns stories affected by changed files", () => {
    const stories = matchFilesToStories(
      ["components/Button.tsx"],
      sampleRouteMap
    );
    expect(stories).toEqual(["button--primary"]);
  });

  it("returns empty when no stories match", () => {
    const stories = matchFilesToStories(
      ["utils/helpers.ts"],
      sampleRouteMap
    );
    expect(stories).toEqual([]);
  });

  it("handles multiple affected stories", () => {
    const stories = matchFilesToStories(
      ["components/Button.tsx", "components/Card.tsx"],
      sampleRouteMap
    );
    expect(stories).toContain("button--primary");
    expect(stories).toContain("card--default");
  });
});
