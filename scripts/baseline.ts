import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  copyFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, basename } from "node:path";
import pc from "picocolors";
import { findProjectRoot, getDojoWatchDir } from "./config.js";

/**
 * Compute SHA-256 hash of a file's contents.
 */
export function computeHash(filePath: string): string {
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Compare hashes of a baseline and a capture file.
 * Returns true if they are byte-identical.
 */
export function compareHash(
  baselinePath: string,
  capturePath: string
): boolean {
  return computeHash(baselinePath) === computeHash(capturePath);
}

/**
 * List all baseline files in .dojowatch/baselines/.
 */
export function getBaselines(projectRoot: string): string[] {
  const baselinesDir = join(getDojoWatchDir(projectRoot), "baselines");

  if (!existsSync(baselinesDir)) {
    return [];
  }

  return readdirSync(baselinesDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => join(baselinesDir, f));
}

/**
 * List all capture files in .dojowatch/captures/.
 */
export function getCaptures(projectRoot: string): string[] {
  const capturesDir = join(getDojoWatchDir(projectRoot), "captures");

  if (!existsSync(capturesDir)) {
    return [];
  }

  return readdirSync(capturesDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => join(capturesDir, f));
}

/**
 * Promote captures to baselines.
 *
 * @param projectRoot - Project root directory
 * @param pattern - Optional glob pattern to filter captures (e.g., "dashboard*")
 *                  If not provided, all captures are promoted.
 */
export function promoteToBaseline(
  projectRoot: string,
  pattern?: string
): { promoted: string[]; skipped: string[] } {
  const dojowatchDir = getDojoWatchDir(projectRoot);
  const capturesDir = join(dojowatchDir, "captures");
  const baselinesDir = join(dojowatchDir, "baselines");

  mkdirSync(baselinesDir, { recursive: true });

  if (!existsSync(capturesDir)) {
    return { promoted: [], skipped: [] };
  }

  const captures = readdirSync(capturesDir).filter((f) => f.endsWith(".png"));

  const promoted: string[] = [];
  const skipped: string[] = [];

  for (const capture of captures) {
    // Apply pattern filter if provided
    if (pattern && !capture.includes(pattern)) {
      skipped.push(capture);
      continue;
    }

    const src = join(capturesDir, capture);
    const dest = join(baselinesDir, capture);
    copyFileSync(src, dest);
    promoted.push(capture);
  }

  return { promoted, skipped };
}

/**
 * Find the baseline file matching a given capture filename.
 * Returns null if no baseline exists.
 */
export function findBaseline(
  projectRoot: string,
  captureFilename: string
): string | null {
  const baselinePath = join(
    getDojoWatchDir(projectRoot),
    "baselines",
    basename(captureFilename)
  );

  return existsSync(baselinePath) ? baselinePath : null;
}

// ─── CLI entrypoint ──────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const promoteFlag = args.includes("--promote");
  const allFlag = args.includes("--all");
  const nameArg = args.find((a) => a.startsWith("--name="))?.split("=")[1];

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(
      pc.red("No .dojowatch/config.json found. Run /vr-init first.")
    );
    process.exit(1);
  }

  if (promoteFlag) {
    const pattern = allFlag ? undefined : nameArg;
    const { promoted, skipped } = promoteToBaseline(projectRoot, pattern);

    console.log(pc.green(`✓ Promoted ${promoted.length} capture(s) to baselines`));
    if (skipped.length > 0) {
      console.log(pc.dim(`  Skipped ${skipped.length} (did not match pattern)`));
    }
  } else {
    // List baselines
    const baselines = getBaselines(projectRoot);
    if (baselines.length === 0) {
      console.log(pc.yellow("No baselines found. Run /vr-init to create initial baselines."));
    } else {
      console.log(pc.bold(`${baselines.length} baseline(s):`));
      for (const b of baselines) {
        console.log(pc.dim(`  ${basename(b)}`));
      }
    }
  }
}

const isDirectRun =
  process.argv[1]?.endsWith("baseline.ts") ||
  process.argv[1]?.endsWith("baseline.js");
if (isDirectRun) {
  main();
}
