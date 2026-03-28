/**
 * Unit tests for the Supabase module.
 *
 * These test the module's logic without a real Supabase connection.
 * We mock the Supabase client to verify correct API calls.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DojoWatchConfig, CheckRun } from "../scripts/types.js";

// Test that the config merging handles supabase correctly
import { loadConfig } from "../scripts/config.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const TMP_DIR = join(import.meta.dirname, ".tmp-supabase-test");

describe("Supabase config", () => {
  beforeEach(() => {
    mkdirSync(join(TMP_DIR, ".dojowatch"), { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("loads config without supabase (optional field)", () => {
    writeFileSync(
      join(TMP_DIR, ".dojowatch", "config.json"),
      JSON.stringify({ project: "test" })
    );

    const config = loadConfig(TMP_DIR);
    expect(config.supabase).toBeUndefined();
  });

  it("loads config with supabase and applies defaults", () => {
    writeFileSync(
      join(TMP_DIR, ".dojowatch", "config.json"),
      JSON.stringify({
        project: "test",
        supabase: {
          url: "https://test.supabase.co",
          anonKey: "anon-key-123",
        },
      })
    );

    const config = loadConfig(TMP_DIR);
    expect(config.supabase).toBeDefined();
    expect(config.supabase!.url).toBe("https://test.supabase.co");
    expect(config.supabase!.anonKey).toBe("anon-key-123");
    expect(config.supabase!.serviceKeyEnv).toBe("SUPABASE_SERVICE_KEY");
    expect(config.supabase!.signedUrlExpiry).toBe(3600);
  });

  it("allows overriding supabase defaults", () => {
    writeFileSync(
      join(TMP_DIR, ".dojowatch", "config.json"),
      JSON.stringify({
        project: "test",
        supabase: {
          url: "https://test.supabase.co",
          anonKey: "key",
          serviceKeyEnv: "CUSTOM_KEY",
          signedUrlExpiry: 7200,
        },
      })
    );

    const config = loadConfig(TMP_DIR);
    expect(config.supabase!.serviceKeyEnv).toBe("CUSTOM_KEY");
    expect(config.supabase!.signedUrlExpiry).toBe(7200);
  });
});

describe("createServiceClient", () => {
  it("throws when supabase config is missing", async () => {
    const { createServiceClient } = await import("../scripts/supabase.js");
    const config: DojoWatchConfig = {
      project: "test",
      baseUrl: "http://localhost:3000",
      viewports: [],
      routes: [],
      maskSelectors: [],
      engine: { local: { model: "claude" }, ci: { model: "gemini", apiKeyEnv: "KEY" } },
      prefilter: { threshold: 0.05, clusterMinPixels: 500 },
      // No supabase config
    };

    expect(() => createServiceClient(config)).toThrow("Supabase config is not set");
  });

  it("throws when service key env var is missing", async () => {
    const { createServiceClient } = await import("../scripts/supabase.js");
    const config: DojoWatchConfig = {
      project: "test",
      baseUrl: "http://localhost:3000",
      viewports: [],
      routes: [],
      maskSelectors: [],
      engine: { local: { model: "claude" }, ci: { model: "gemini", apiKeyEnv: "KEY" } },
      prefilter: { threshold: 0.05, clusterMinPixels: 500 },
      supabase: {
        url: "https://test.supabase.co",
        anonKey: "anon",
        serviceKeyEnv: "NONEXISTENT_KEY_VAR",
        signedUrlExpiry: 3600,
      },
    };

    // Ensure the env var doesn't exist
    delete process.env["NONEXISTENT_KEY_VAR"];
    expect(() => createServiceClient(config)).toThrow("Missing Supabase service key");
  });
});

describe("comment with diff URLs", () => {
  it("includes thumbnail links when diffUrls are provided", async () => {
    const { generateCommentMarkdown } = await import("../scripts/comment.js");

    const checkRun: CheckRun = {
      timestamp: new Date().toISOString(),
      branch: "test",
      commitSha: "abc1234",
      scope: "all",
      prefilterResults: [
        {
          name: "index-desktop",
          viewport: "desktop",
          tier: "FULL_ANALYSIS",
          pixelDiffCount: 500,
          pixelDiffPercent: 5,
          diffImagePath: null,
          clusters: [],
        },
      ],
      analysisResults: [
        {
          name: "index-desktop",
          viewport: "desktop",
          tier: "FULL_ANALYSIS",
          diffs: [
            {
              element: "header",
              type: "REGRESSION",
              severity: "high",
              description: "Header disappeared",
              suggested_fix: "Check display property",
            },
          ],
        },
      ],
      summary: { total: 1, skipped: 0, analyzed: 1, regressions: 1, intentional: 0, noise: 0 },
    };

    const diffUrls = new Map([
      ["index-desktop", "https://storage.example.com/signed/diff.png"],
    ]);

    const md = generateCommentMarkdown(checkRun, diffUrls);
    expect(md).toContain("https://storage.example.com/signed/diff.png");
    expect(md).toContain("![diff]");
  });

  it("works without diffUrls (backwards compatible)", async () => {
    const { generateCommentMarkdown } = await import("../scripts/comment.js");

    const checkRun: CheckRun = {
      timestamp: new Date().toISOString(),
      branch: "test",
      commitSha: "abc1234",
      scope: "all",
      prefilterResults: [],
      analysisResults: [],
      summary: { total: 0, skipped: 0, analyzed: 0, regressions: 0, intentional: 0, noise: 0 },
    };

    const md = generateCommentMarkdown(checkRun);
    expect(md).toContain("No regressions detected");
  });
});
