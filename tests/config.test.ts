import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, findProjectRoot } from "../scripts/config.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-config-test");

beforeEach(() => {
  mkdirSync(join(TMP_DIR, ".dojowatch"), { recursive: true });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("loads a valid config and merges with defaults", () => {
    writeFileSync(
      join(TMP_DIR, ".dojowatch", "config.json"),
      JSON.stringify({
        project: "test-app",
        baseUrl: "http://localhost:4000",
        routes: ["/", "/about"],
      })
    );

    const config = loadConfig(TMP_DIR);

    expect(config.project).toBe("test-app");
    expect(config.baseUrl).toBe("http://localhost:4000");
    expect(config.routes).toEqual(["/", "/about"]);
    // Defaults should fill in
    expect(config.viewports).toEqual([
      { name: "desktop", width: 1440, height: 900 },
    ]);
    expect(config.maskSelectors).toEqual(["[data-vr-mask]"]);
    expect(config.prefilter.threshold).toBe(0.05);
    expect(config.prefilter.clusterMinPixels).toBe(500);
    expect(config.engine.local.model).toBe("claude");
    expect(config.engine.ci.model).toBe("gemini-3.1-pro-preview");
  });

  it("uses all defaults when config is minimal", () => {
    writeFileSync(
      join(TMP_DIR, ".dojowatch", "config.json"),
      JSON.stringify({})
    );

    const config = loadConfig(TMP_DIR);

    expect(config.project).toBe("default");
    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.routes).toEqual(["/"]);
  });

  it("allows overriding nested engine config", () => {
    writeFileSync(
      join(TMP_DIR, ".dojowatch", "config.json"),
      JSON.stringify({
        engine: {
          ci: { model: "gemini-2.5-pro" },
        },
      })
    );

    const config = loadConfig(TMP_DIR);

    expect(config.engine.ci.model).toBe("gemini-2.5-pro");
    expect(config.engine.ci.apiKeyEnv).toBe("GOOGLE_GENAI_API_KEY"); // default preserved
    expect(config.engine.local.model).toBe("claude"); // default preserved
  });

  it("throws when no config exists", () => {
    expect(() => loadConfig("/nonexistent/path")).toThrow(
      "No .dojowatch/config.json found"
    );
  });
});

describe("findProjectRoot", () => {
  it("finds root when .dojowatch/config.json exists", () => {
    writeFileSync(
      join(TMP_DIR, ".dojowatch", "config.json"),
      JSON.stringify({})
    );

    const root = findProjectRoot(TMP_DIR);
    expect(root).toBe(TMP_DIR);
  });

  it("returns null when no config exists", () => {
    rmSync(join(TMP_DIR, ".dojowatch"), { recursive: true, force: true });
    const root = findProjectRoot(TMP_DIR);
    expect(root).toBeNull();
  });
});
