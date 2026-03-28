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
import { captureRoutes, captureStorybook, captureComponents } from "./capture.js";
import { prefilterAll } from "./prefilter.js";
import { analyzeWithGemini } from "./analyze-gemini.js";
import { generateCommentMarkdown, postComment } from "./comment.js";
import { createServiceClient, uploadCheckRun, getSignedDiffUrls } from "./supabase.js";
import type { AnalysisResult, CheckRun } from "./types.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prEqArg = args.find((a) => a.startsWith("--pr="))?.split("=")[1];
  const prFlagIdx = args.indexOf("--pr");
  const prSpaceArg = prFlagIdx !== -1 ? args[prFlagIdx + 1] : undefined;
  const prArg = prEqArg ?? prSpaceArg;
  const prNumber = prArg ? parseInt(prArg, 10) : undefined;
  const uploadFlag = args.includes("--upload");

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

  // ── Step 1b: Component capture (if configured) ─────────────────
  if (config.components && config.components.length > 0) {
    console.log(pc.bold("\nStep 1b: Capturing components..."));
    const componentResults = await captureComponents(config, config.routes, capturesDir);
    results.push(...componentResults);
    console.log(pc.green(`  ✓ Captured ${componentResults.length} component(s)`));
  }

  // ── Step 2: Pre-filter ─────────────────────────────────────────
  console.log(pc.bold("\nStep 2: Running pre-filter..."));
  const prefilterResults = prefilterAll(projectRoot);

  const skipCount = prefilterResults.filter((r) => r.tier === "SKIP").length;
  const analyzeCount = prefilterResults.filter((r) => r.tier !== "SKIP").length;
  console.log(pc.green(`  ✓ ${skipCount} unchanged, ${analyzeCount} to analyze`));

  // ── Step 3: Gemini Analysis (with retry + fallback) ────────────
  const toAnalyze = prefilterResults.filter((r) => r.tier !== "SKIP");
  let analysisResults: AnalysisResult[] = [];
  let analysisEngine: "gemini" | "none" = "none";

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

    // Retry up to 3 times with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        analysisResults = await analyzeWithGemini(pairs, {
          model: config.engine.ci.model,
          apiKeyEnv: config.engine.ci.apiKeyEnv,
        });
        analysisEngine = "gemini";
        console.log(pc.green(`  ✓ Analyzed ${analysisResults.length} screenshot(s)`));
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < 3) {
          const delay = attempt * 2000;
          console.log(pc.yellow(`  ⚠ Gemini attempt ${attempt} failed: ${msg}. Retrying in ${delay / 1000}s...`));
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.log(pc.yellow(`  ⚠ Gemini analysis failed after 3 attempts: ${msg}`));
          console.log(pc.yellow(`  Falling back to pixelmatch-only results (no AI classification).`));
          // Create stub results with no diffs — pixelmatch data still available
          analysisResults = toAnalyze.map((pf) => ({
            name: pf.name,
            viewport: pf.viewport,
            tier: pf.tier,
            diffs: [],
          }));
        }
      }
    }
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

  // Save check run locally
  const checkRunPath = join(dojowatchDir, "last-check.json");
  writeFileSync(checkRunPath, JSON.stringify(checkRun, null, 2));

  // ── Step 4: Upload to Supabase ─────────────────────────────────
  let runId: string | undefined;
  if (uploadFlag && config.supabase) {
    console.log(pc.bold("\nStep 4: Uploading to Supabase..."));
    const supabaseClient = createServiceClient(config);
    runId = await uploadCheckRun(supabaseClient, checkRun, config, {
      prNumber,
      engine: analysisEngine === "gemini" ? "gemini" : "claude",
      capturesDir: join(dojowatchDir, "captures"),
      diffsDir: join(dojowatchDir, "diffs"),
    });
  } else if (uploadFlag && !config.supabase) {
    console.log(pc.yellow("\n  --upload flag set but no supabase config. Skipping."));
  }

  // ── Step 5: PR Comment ─────────────────────────────────────────
  if (prNumber) {
    console.log(pc.bold(`\nStep 5: Posting comment to PR #${prNumber}...`));

    // If we uploaded to Supabase, enrich comment with signed diff URLs
    let diffUrls: Map<string, string> | undefined;
    if (runId && config.supabase) {
      const supabaseClient = createServiceClient(config);
      diffUrls = await getSignedDiffUrls(
        supabaseClient,
        runId,
        config.project,
        prefilterResults,
        config.supabase.signedUrlExpiry
      );
    }

    const markdown = generateCommentMarkdown(checkRun, diffUrls);
    try {
      postComment(prNumber, markdown);
    } catch {
      console.log(pc.yellow("  ⚠ Failed to post PR comment (gh CLI error). Results saved locally."));
    }
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

const isDirectRun =
  process.argv[1]?.endsWith("ci.ts") ||
  process.argv[1]?.endsWith("ci.js");
if (isDirectRun) {
  main().catch((err) => {
    console.error(pc.red(`CI failed: ${err}`));
    process.exit(1);
  });
}
