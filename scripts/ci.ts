/**
 * DojoWatch CI orchestrator.
 *
 * Single entrypoint for GitHub Actions:
 *   npx tsx scripts/ci.ts --pr <number>
 *
 * Pipeline: capture → prefilter → Gemini analysis → PR comment
 * Exit code 1 if high-severity regressions are found.
 */
import { join } from "node:path";
import { writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import pc from "picocolors";
import { loadConfig, findProjectRoot, getDojoWatchDir } from "./config.js";
import { captureRoutes, captureStorybook } from "./capture.js";
import { prefilterAll } from "./prefilter.js";
import { analyzeWithGemini } from "./analyze-gemini.js";
import { generateCommentMarkdown, postComment } from "./comment.js";
import type { CheckRun } from "./types.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prArg = args.find((a) => a.startsWith("--pr="))?.split("=")[1]
    ?? args[args.indexOf("--pr") + 1];
  const prNumber = prArg ? parseInt(prArg, 10) : undefined;

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(pc.red("No .dojowatch/config.json found. Cannot run CI."));
    process.exit(1);
  }

  const config = loadConfig(projectRoot);
  const dojowatchDir = getDojoWatchDir(projectRoot);
  const capturesDir = join(dojowatchDir, "captures");
  const baselinesDir = join(dojowatchDir, "baselines");

  // Verify baselines exist
  if (!existsSync(baselinesDir)) {
    console.error(pc.red("No baselines found. Run /vr-init locally first."));
    process.exit(1);
  }

  // ── Step 1: Capture ────────────────────────────────────────────
  console.log(pc.bold("Step 1: Capturing screenshots..."));
  const routes = config.routes;
  const results = await captureRoutes(config, routes, capturesDir);

  if (config.storybookUrl) {
    console.log(pc.dim("  Capturing Storybook stories..."));
    const storyResults = await captureStorybook(
      config.storybookUrl,
      config.viewports,
      capturesDir,
      config.maskSelectors
    );
    results.push(...storyResults);
  }

  console.log(pc.green(`  ✓ Captured ${results.length} screenshot(s)`));

  // ── Step 2: Pre-filter ─────────────────────────────────────────
  console.log(pc.bold("\nStep 2: Running pre-filter..."));
  const prefilterResults = prefilterAll(projectRoot);

  const skipCount = prefilterResults.filter((r) => r.tier === "SKIP").length;
  const analyzeCount = prefilterResults.filter((r) => r.tier !== "SKIP").length;
  console.log(pc.green(`  ✓ ${skipCount} unchanged, ${analyzeCount} to analyze`));

  // ── Step 3: Gemini Analysis ────────────────────────────────────
  const toAnalyze = prefilterResults.filter((r) => r.tier !== "SKIP");
  let analysisResults: import("./types.js").AnalysisResult[] = [];

  if (toAnalyze.length > 0) {
    console.log(pc.bold("\nStep 3: Running Gemini analysis..."));

    const pairs = toAnalyze.map((pf) => ({
      name: pf.name,
      viewport: pf.viewport,
      tier: pf.tier,
      baselinePath: join(baselinesDir, `${pf.name}.png`),
      capturePath: join(capturesDir, `${pf.name}.png`),
      diffPath: pf.diffImagePath,
    }));

    analysisResults = await analyzeWithGemini(pairs, {
      model: config.engine.ci.model,
      apiKeyEnv: config.engine.ci.apiKeyEnv,
    });

    console.log(pc.green(`  ✓ Analyzed ${analysisResults.length} screenshot(s)`));
  } else {
    console.log(pc.bold("\nStep 3: No screenshots need analysis."));
  }

  // ── Build check run ────────────────────────────────────────────
  const regressionCount = analysisResults.reduce(
    (sum, r) => sum + r.diffs.filter((d) => d.type === "REGRESSION").length,
    0
  );
  const intentionalCount = analysisResults.reduce(
    (sum, r) => sum + r.diffs.filter((d) => d.type === "INTENTIONAL").length,
    0
  );
  const noiseCount = analysisResults.reduce(
    (sum, r) => sum + r.diffs.filter((d) => d.type === "NOISE").length,
    0
  );

  const checkRun: CheckRun = {
    timestamp: new Date().toISOString(),
    branch: getGitBranch(),
    commitSha: getGitCommitSha(),
    scope: "all",
    prefilterResults,
    analysisResults,
    summary: {
      total: prefilterResults.length,
      skipped: skipCount,
      analyzed: analyzeCount,
      regressions: regressionCount,
      intentional: intentionalCount,
      noise: noiseCount,
    },
  };

  // Save check run
  const checkRunPath = join(dojowatchDir, "last-check.json");
  writeFileSync(checkRunPath, JSON.stringify(checkRun, null, 2));

  // ── Step 4: PR Comment ─────────────────────────────────────────
  if (prNumber) {
    console.log(pc.bold(`\nStep 4: Posting comment to PR #${prNumber}...`));
    const markdown = generateCommentMarkdown(checkRun);
    postComment(prNumber, markdown);
  } else {
    console.log(pc.dim("\nNo --pr flag. Skipping PR comment."));
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log(pc.bold("\n─── Results ───"));
  console.log(`  Total: ${checkRun.summary.total} | Unchanged: ${skipCount} | Analyzed: ${analyzeCount}`);
  console.log(`  Regressions: ${regressionCount} | Intentional: ${intentionalCount} | Noise: ${noiseCount}`);

  // Exit with error if high-severity regressions found
  const highSeverity = analysisResults.some((r) =>
    r.diffs.some((d) => d.type === "REGRESSION" && d.severity === "high")
  );

  if (highSeverity) {
    console.log(pc.red("\n✗ High-severity regressions detected. Failing CI."));
    process.exit(1);
  }

  if (regressionCount > 0) {
    console.log(pc.yellow("\n⚠ Regressions found (no high-severity). Review in PR."));
  } else {
    console.log(pc.green("\n✓ No regressions. All clear."));
  }
}

function getGitBranch(): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function getGitCommitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "0000000";
  }
}

main().catch((err) => {
  console.error(pc.red(`CI failed: ${err}`));
  process.exit(1);
});
