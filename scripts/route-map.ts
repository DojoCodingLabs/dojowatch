import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { RouteMap } from "./types.js";

const ROUTE_MAP_FILENAME = "routeMap.json";
const CONFIG_DIR = ".dojowatch";

/**
 * Load the route map from .dojowatch/routeMap.json.
 */
export function loadRouteMap(projectRoot: string): RouteMap {
  const mapPath = join(projectRoot, CONFIG_DIR, ROUTE_MAP_FILENAME);

  if (!existsSync(mapPath)) {
    throw new Error(
      "No .dojowatch/routeMap.json found. Run /vr-init to generate it."
    );
  }

  const raw = readFileSync(mapPath, "utf-8");
  return JSON.parse(raw) as RouteMap;
}

/**
 * Resolve which routes need to be captured based on the scope.
 *
 * - "all": return all routes from the route map
 * - "staged": return routes affected by currently staged files (git add)
 * - "branch": return routes affected by all files changed vs main
 */
export function resolveScope(
  scope: "all" | "staged" | "branch",
  routeMap: RouteMap,
  allRoutes: string[]
): string[] {
  if (scope === "all") {
    return allRoutes;
  }

  const changedFiles = getChangedFiles(scope);
  if (changedFiles.length === 0) {
    return [];
  }

  return matchFilesToRoutes(changedFiles, routeMap);
}

/**
 * Get the list of changed files based on scope.
 */
function getChangedFiles(scope: "staged" | "branch"): string[] {
  try {
    let output: string;
    if (scope === "staged") {
      output = execFileSync("git", ["diff", "--name-only", "--cached"], {
        encoding: "utf-8",
      }).trim();
    } else {
      const defaultBranch = getDefaultBranch();
      output = execFileSync(
        "git",
        ["diff", "--name-only", `${defaultBranch}...HEAD`],
        { encoding: "utf-8" }
      ).trim();
    }

    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    // Not a git repo or git not available
    return [];
  }
}

/**
 * Detect the default branch name (main or master).
 */
function getDefaultBranch(): string {
  try {
    const result = execFileSync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      { encoding: "utf-8" }
    ).trim();
    return result.replace("refs/remotes/origin/", "");
  } catch {
    return "main";
  }
}

/**
 * Given a list of changed files, find all routes that are affected.
 * A route is affected if any of its mapped source files appear in the changed list.
 */
function matchFilesToRoutes(
  changedFiles: string[],
  routeMap: RouteMap
): string[] {
  const changedSet = new Set(changedFiles);
  const affectedRoutes = new Set<string>();

  for (const [route, sourceFiles] of Object.entries(routeMap.routes)) {
    for (const sourceFile of sourceFiles) {
      if (changedSet.has(sourceFile)) {
        affectedRoutes.add(route);
        break;
      }
    }
  }

  return [...affectedRoutes];
}

/**
 * Given a list of changed files, find all Storybook stories that are affected.
 */
export function matchFilesToStories(
  changedFiles: string[],
  routeMap: RouteMap
): string[] {
  const changedSet = new Set(changedFiles);
  const affectedStories = new Set<string>();

  for (const [storyId, sourceFiles] of Object.entries(routeMap.stories)) {
    for (const sourceFile of sourceFiles) {
      if (changedSet.has(sourceFile)) {
        affectedStories.add(storyId);
        break;
      }
    }
  }

  return [...affectedStories];
}
