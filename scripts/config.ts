import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { DojoWatchConfig } from "./types.js";

const CONFIG_FILENAME = "config.json";
const CONFIG_DIR = ".dojowatch";

const DEFAULT_CONFIG: DojoWatchConfig = {
  project: "default",
  baseUrl: "http://localhost:3000",
  viewports: [{ name: "desktop", width: 1440, height: 900 }],
  routes: ["/"],
  maskSelectors: ["[data-vr-mask]"],
  engine: {
    local: { model: "claude" },
    ci: { model: "gemini-3.1-pro-preview", apiKeyEnv: "GOOGLE_GENAI_API_KEY" },
  },
  prefilter: {
    threshold: 0.05,
    clusterMinPixels: 500,
  },
};

/**
 * Find the project root by looking for .dojowatch/ directory,
 * walking up from the given starting path.
 */
export function findProjectRoot(startFrom?: string): string | null {
  let dir = resolve(startFrom ?? process.cwd());
  const root = resolve("/");

  while (dir !== root) {
    if (existsSync(join(dir, CONFIG_DIR, CONFIG_FILENAME))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * Load and validate the DojoWatch config from .dojowatch/config.json.
 * Merges with defaults so partial configs are valid.
 */
export function loadConfig(projectRoot?: string): DojoWatchConfig {
  const root = projectRoot ?? findProjectRoot();
  if (!root) {
    throw new Error(
      "No .dojowatch/config.json found. Run /vr-init to initialize."
    );
  }

  const configPath = join(root, CONFIG_DIR, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    throw new Error(
      "No .dojowatch/config.json found. Run /vr-init to initialize."
    );
  }
  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<DojoWatchConfig>;

  return mergeConfig(DEFAULT_CONFIG, parsed);
}

/**
 * Returns the path to the .dojowatch directory for a given project root.
 */
export function getDojoWatchDir(projectRoot: string): string {
  return join(projectRoot, CONFIG_DIR);
}

/**
 * Deep-merge user config over defaults.
 */
function mergeConfig(
  defaults: DojoWatchConfig,
  overrides: Partial<DojoWatchConfig>
): DojoWatchConfig {
  return {
    project: overrides.project ?? defaults.project,
    baseUrl: overrides.baseUrl ?? defaults.baseUrl,
    storybookUrl: overrides.storybookUrl,
    viewports: overrides.viewports ?? defaults.viewports,
    routes: overrides.routes ?? defaults.routes,
    maskSelectors: overrides.maskSelectors ?? defaults.maskSelectors,
    engine: {
      local: {
        ...defaults.engine.local,
        ...overrides.engine?.local,
      },
      ci: {
        ...defaults.engine.ci,
        ...overrides.engine?.ci,
      },
    },
    prefilter: {
      ...defaults.prefilter,
      ...overrides.prefilter,
    },
    auth: overrides.auth
      ? {
          storageState: overrides.auth.storageState,
          profiles: overrides.auth.profiles,
          routes: overrides.auth.routes,
        }
      : undefined,
    supabase: overrides.supabase
      ? {
          url: overrides.supabase.url,
          anonKey: overrides.supabase.anonKey,
          serviceKeyEnv: overrides.supabase.serviceKeyEnv ?? "SUPABASE_SERVICE_KEY",
          signedUrlExpiry: overrides.supabase.signedUrlExpiry ?? 3600,
        }
      : undefined,
  };
}
