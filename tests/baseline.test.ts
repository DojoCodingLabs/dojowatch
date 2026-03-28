import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeHash,
  compareHash,
  getBaselines,
  getCaptures,
  promoteToBaseline,
  findBaseline,
} from "../scripts/baseline.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-baseline-test");
const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

beforeEach(() => {
  mkdirSync(join(TMP_DIR, ".dojowatch", "baselines"), { recursive: true });
  mkdirSync(join(TMP_DIR, ".dojowatch", "captures"), { recursive: true });
  // Need a config.json for findProjectRoot to work
  writeFileSync(
    join(TMP_DIR, ".dojowatch", "config.json"),
    JSON.stringify({})
  );
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("computeHash", () => {
  it("returns consistent SHA-256 hash", () => {
    const fixturePath = join(FIXTURES_DIR, "identical-a.png");
    const hash1 = computeHash(fixturePath);
    const hash2 = computeHash(fixturePath);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns different hashes for different files", () => {
    const hashA = computeHash(join(FIXTURES_DIR, "identical-a.png"));
    const hashB = computeHash(join(FIXTURES_DIR, "major-diff-b.png"));

    expect(hashA).not.toBe(hashB);
  });
});

describe("compareHash", () => {
  it("returns true for identical files", () => {
    const result = compareHash(
      join(FIXTURES_DIR, "identical-a.png"),
      join(FIXTURES_DIR, "identical-b.png")
    );
    expect(result).toBe(true);
  });

  it("returns false for different files", () => {
    const result = compareHash(
      join(FIXTURES_DIR, "minor-diff-a.png"),
      join(FIXTURES_DIR, "minor-diff-b.png")
    );
    expect(result).toBe(false);
  });
});

describe("getBaselines / getCaptures", () => {
  it("returns empty array when no PNGs exist", () => {
    expect(getBaselines(TMP_DIR)).toEqual([]);
    expect(getCaptures(TMP_DIR)).toEqual([]);
  });

  it("lists PNG files in the baselines directory", () => {
    const src = readFileSync(join(FIXTURES_DIR, "identical-a.png"));
    writeFileSync(join(TMP_DIR, ".dojowatch", "baselines", "index-desktop.png"), src);

    const baselines = getBaselines(TMP_DIR);
    expect(baselines).toHaveLength(1);
    expect(baselines[0]).toContain("index-desktop.png");
  });
});

describe("promoteToBaseline", () => {
  it("copies all captures to baselines when no pattern specified", () => {
    const src = readFileSync(join(FIXTURES_DIR, "identical-a.png"));
    writeFileSync(join(TMP_DIR, ".dojowatch", "captures", "index-desktop.png"), src);
    writeFileSync(join(TMP_DIR, ".dojowatch", "captures", "about-desktop.png"), src);

    const result = promoteToBaseline(TMP_DIR);

    expect(result.promoted).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(existsSync(join(TMP_DIR, ".dojowatch", "baselines", "index-desktop.png"))).toBe(true);
    expect(existsSync(join(TMP_DIR, ".dojowatch", "baselines", "about-desktop.png"))).toBe(true);
  });

  it("filters by pattern when specified", () => {
    const src = readFileSync(join(FIXTURES_DIR, "identical-a.png"));
    writeFileSync(join(TMP_DIR, ".dojowatch", "captures", "index-desktop.png"), src);
    writeFileSync(join(TMP_DIR, ".dojowatch", "captures", "about-desktop.png"), src);

    const result = promoteToBaseline(TMP_DIR, "index");

    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0]).toBe("index-desktop.png");
    expect(result.skipped).toHaveLength(1);
  });
});

describe("findBaseline", () => {
  it("returns path when baseline exists", () => {
    const src = readFileSync(join(FIXTURES_DIR, "identical-a.png"));
    writeFileSync(join(TMP_DIR, ".dojowatch", "baselines", "index-desktop.png"), src);

    const result = findBaseline(TMP_DIR, "index-desktop.png");
    expect(result).toContain("index-desktop.png");
  });

  it("returns null when baseline does not exist", () => {
    const result = findBaseline(TMP_DIR, "nonexistent.png");
    expect(result).toBeNull();
  });
});
