/**
 * DojoWatch statistics and trend tracking.
 *
 * Queries Supabase for historical regression data and produces
 * insights about visual quality trends.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import pc from "picocolors";
import { findProjectRoot, loadConfig } from "./config.js";
import { createAnonClient } from "./supabase.js";

export interface ProjectStats {
  totalRuns: number;
  totalDiffs: number;
  totalRegressions: number;
  passRate: number;
  avgRegressionsPerRun: number;
  topFlakyRoutes: Array<{ name: string; flagCount: number }>;
  recentRuns: Array<{
    id: string;
    branch: string;
    status: string;
    regressions: number;
    createdAt: string;
  }>;
}

/**
 * Fetch project statistics from Supabase.
 */
export async function getProjectStats(
  client: SupabaseClient,
  project: string,
  limit: number = 20
): Promise<ProjectStats> {
  // Recent runs
  const { data: runs } = await client
    .from("vr_runs")
    .select("id, branch, status, regressions_count, created_at")
    .eq("project", project)
    .order("created_at", { ascending: false })
    .limit(limit);

  const recentRuns = (runs ?? []).map((r) => ({
    id: r.id,
    branch: r.branch,
    status: r.status,
    regressions: r.regressions_count,
    createdAt: r.created_at,
  }));

  const totalRuns = recentRuns.length;
  const totalRegressions = recentRuns.reduce((s, r) => s + r.regressions, 0);
  const passCount = recentRuns.filter((r) => r.status === "pass").length;

  // Top flaky routes (most frequently flagged)
  const { data: diffs } = await client
    .from("vr_diffs")
    .select("name, tier")
    .in("run_id", recentRuns.map((r) => r.id))
    .neq("tier", "SKIP");

  const routeCounts = new Map<string, number>();
  for (const d of diffs ?? []) {
    routeCounts.set(d.name, (routeCounts.get(d.name) ?? 0) + 1);
  }

  const topFlakyRoutes = [...routeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, flagCount]) => ({ name, flagCount }));

  return {
    totalRuns,
    totalDiffs: (diffs ?? []).length,
    totalRegressions,
    passRate: totalRuns > 0 ? Math.round((passCount / totalRuns) * 100) : 0,
    avgRegressionsPerRun: totalRuns > 0 ? Math.round((totalRegressions / totalRuns) * 10) / 10 : 0,
    topFlakyRoutes,
    recentRuns,
  };
}

/**
 * Format stats as a readable report.
 */
export function formatStats(stats: ProjectStats): string {
  const lines: string[] = [];
  lines.push("## DojoWatch Statistics\n");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Total runs | ${stats.totalRuns} |`);
  lines.push(`| Pass rate | ${stats.passRate}% |`);
  lines.push(`| Total regressions | ${stats.totalRegressions} |`);
  lines.push(`| Avg regressions/run | ${stats.avgRegressionsPerRun} |`);
  lines.push(`| Total diffs analyzed | ${stats.totalDiffs} |`);

  if (stats.topFlakyRoutes.length > 0) {
    lines.push("\n### Most Flagged Routes\n");
    lines.push("| Route | Times flagged |");
    lines.push("|-------|-------------:|");
    for (const r of stats.topFlakyRoutes) {
      lines.push(`| ${r.name} | ${r.flagCount} |`);
    }
  }

  if (stats.recentRuns.length > 0) {
    lines.push("\n### Recent Runs\n");
    lines.push("| Branch | Status | Regressions | Date |");
    lines.push("|--------|--------|------------:|------|");
    for (const r of stats.recentRuns.slice(0, 10)) {
      const status = r.status === "pass" ? "pass" : "fail";
      const date = new Date(r.createdAt).toLocaleDateString();
      lines.push(`| ${r.branch} | ${status} | ${r.regressions} | ${date} |`);
    }
  }

  return lines.join("\n");
}

// ─── CLI entrypoint ──────────────────────────────────────────────

async function main(): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(pc.red("No .dojowatch/config.json found."));
    process.exit(1);
  }

  const config = loadConfig(projectRoot);
  if (!config.supabase) {
    console.error(pc.red("Stats require Supabase. Add supabase config to .dojowatch/config.json."));
    process.exit(1);
  }

  const client = createAnonClient(config);
  console.log(pc.bold("Fetching statistics...\n"));
  const stats = await getProjectStats(client, config.project);
  console.log(formatStats(stats));
}

const isDirectRun =
  process.argv[1]?.endsWith("stats.ts") ||
  process.argv[1]?.endsWith("stats.js");
if (isDirectRun) {
  main().catch((err) => {
    console.error(pc.red(String(err)));
    process.exit(1);
  });
}
