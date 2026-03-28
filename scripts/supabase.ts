import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import pc from "picocolors";
import type {
  DojoWatchConfig,
  CheckRun,
  PrefilterResult,
  AnalysisResult,
  VrRunRow,
  VrDiffRow,
  VrBaselineRow,
} from "./types.js";

// ─── Client Creation ─────────────────────────────────────────────

/**
 * Create a Supabase client using the service role key (for CI uploads).
 */
export function createServiceClient(config: DojoWatchConfig): SupabaseClient {
  const supabase = config.supabase;
  if (!supabase) {
    throw new Error("Supabase config is not set in .dojowatch/config.json");
  }

  const serviceKey = process.env[supabase.serviceKeyEnv];
  if (!serviceKey) {
    throw new Error(
      `Missing Supabase service key. Set ${supabase.serviceKeyEnv} environment variable.`
    );
  }

  return createClient(supabase.url, serviceKey);
}

/**
 * Create a Supabase client using the anon key (for read-only dashboard access).
 */
export function createAnonClient(config: DojoWatchConfig): SupabaseClient {
  const supabase = config.supabase;
  if (!supabase) {
    throw new Error("Supabase config is not set in .dojowatch/config.json");
  }

  return createClient(supabase.url, supabase.anonKey);
}

// ─── Storage ─────────────────────────────────────────────────────

/**
 * Upload a PNG file to a Supabase Storage bucket.
 * Returns the storage path.
 */
export async function uploadImage(
  client: SupabaseClient,
  bucket: "baselines" | "captures" | "diffs",
  filePath: string,
  storagePath: string
): Promise<string> {
  const fileData = readFileSync(filePath);

  const { error } = await client.storage
    .from(bucket)
    .upload(storagePath, fileData, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload to ${bucket}/${storagePath}: ${error.message}`);
  }

  return storagePath;
}

/**
 * Generate a signed URL for a stored image.
 */
export async function getSignedUrl(
  client: SupabaseClient,
  bucket: "baselines" | "captures" | "diffs",
  storagePath: string,
  expiresIn: number = 3600
): Promise<string> {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data) {
    throw new Error(`Failed to create signed URL for ${bucket}/${storagePath}: ${error?.message}`);
  }

  return data.signedUrl;
}

/**
 * Download a baseline image from Supabase Storage.
 * Returns the image as a Buffer.
 */
export async function downloadBaseline(
  client: SupabaseClient,
  storagePath: string
): Promise<Buffer> {
  const { data, error } = await client.storage
    .from("baselines")
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download baseline ${storagePath}: ${error?.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

// ─── Runs ────────────────────────────────────────────────────────

/**
 * Insert a new visual regression run.
 */
export async function insertRun(
  client: SupabaseClient,
  run: Omit<VrRunRow, "id" | "created_at">
): Promise<string> {
  const { data, error } = await client
    .from("vr_runs")
    .insert(run)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert run: ${error?.message}`);
  }

  return data.id;
}

/**
 * Update a run's status.
 */
export async function updateRunStatus(
  client: SupabaseClient,
  runId: string,
  status: "pending" | "pass" | "fail",
  regressionsCount: number
): Promise<void> {
  const { error } = await client
    .from("vr_runs")
    .update({ status, regressions_count: regressionsCount })
    .eq("id", runId);

  if (error) {
    throw new Error(`Failed to update run ${runId}: ${error.message}`);
  }
}

// ─── Diffs ───────────────────────────────────────────────────────

/**
 * Insert diff rows for a run.
 */
export async function insertDiffs(
  client: SupabaseClient,
  runId: string,
  prefilterResults: PrefilterResult[],
  analysisResults: AnalysisResult[],
  project: string
): Promise<void> {
  const analysisMap = new Map(
    analysisResults.map((a) => [`${a.name}-${a.viewport}`, a])
  );

  const rows: Array<Omit<VrDiffRow, "id" | "created_at">> = prefilterResults
    .filter((pf) => pf.tier !== "SKIP")
    .map((pf) => {
      const analysis = analysisMap.get(`${pf.name}-${pf.viewport}`);
      const highestSeverity = analysis?.diffs
        .filter((d) => d.type === "REGRESSION")
        .reduce<"high" | "medium" | "low" | null>((highest, d) => {
          if (!d.severity) return highest;
          if (!highest) return d.severity;
          const order = { high: 0, medium: 1, low: 2 };
          return order[d.severity] < order[highest] ? d.severity : highest;
        }, null);

      return {
        run_id: runId,
        name: pf.name,
        viewport: pf.viewport,
        baseline_storage_path: `${project}/${pf.name}.png`,
        current_storage_path: `${project}/captures/${pf.name}.png`,
        diff_storage_path: pf.diffImagePath
          ? `${project}/diffs/${basename(pf.diffImagePath)}`
          : null,
        pixel_diff_percent: pf.pixelDiffPercent,
        tier: pf.tier,
        analysis: analysis?.diffs ?? null,
        severity: highestSeverity ?? null,
        review_status: "pending" as const,
        reviewed_by: null,
        reviewed_at: null,
      };
    });

  if (rows.length === 0) return;

  const { error } = await client.from("vr_diffs").insert(rows);

  if (error) {
    throw new Error(`Failed to insert diffs: ${error.message}`);
  }
}

// ─── Baselines ───────────────────────────────────────────────────

/**
 * Get the current baseline for a screenshot from Supabase.
 */
export async function getRemoteBaseline(
  client: SupabaseClient,
  project: string,
  name: string,
  viewport: string
): Promise<VrBaselineRow | null> {
  const { data, error } = await client
    .from("vr_baselines")
    .select("*")
    .eq("project", project)
    .eq("name", name)
    .eq("viewport", viewport)
    .single();

  if (error) return null;
  return data as VrBaselineRow;
}

/**
 * Upsert a baseline record and upload the image.
 */
export async function promoteRemoteBaseline(
  client: SupabaseClient,
  project: string,
  name: string,
  viewport: string,
  localPath: string,
  hash: string,
  approvedBy?: string
): Promise<void> {
  const storagePath = `${project}/${name}-${viewport}.png`;

  // Upload image
  await uploadImage(client, "baselines", localPath, storagePath);

  // Upsert baseline record
  const { error } = await client.from("vr_baselines").upsert(
    {
      project,
      name,
      viewport,
      storage_path: storagePath,
      hash,
      approved_at: new Date().toISOString(),
      approved_by: approvedBy ?? null,
    },
    { onConflict: "project,name,viewport" }
  );

  if (error) {
    throw new Error(`Failed to upsert baseline: ${error.message}`);
  }
}

/**
 * List all baselines for a project.
 */
export async function listRemoteBaselines(
  client: SupabaseClient,
  project: string
): Promise<VrBaselineRow[]> {
  const { data, error } = await client
    .from("vr_baselines")
    .select("*")
    .eq("project", project)
    .order("name");

  if (error) {
    throw new Error(`Failed to list baselines: ${error.message}`);
  }

  return (data ?? []) as VrBaselineRow[];
}

// ─── Full Upload ─────────────────────────────────────────────────

/**
 * Upload a complete check run to Supabase: run record, diff images, diff rows.
 */
export async function uploadCheckRun(
  client: SupabaseClient,
  checkRun: CheckRun,
  config: DojoWatchConfig,
  options: {
    prNumber?: number;
    engine: "claude" | "gemini";
    capturesDir: string;
    diffsDir: string;
  }
): Promise<string> {
  const { prNumber, engine, capturesDir } = options;

  console.log(pc.dim("  Uploading run to Supabase..."));

  // 1. Insert run
  const runId = await insertRun(client, {
    project: config.project,
    pr_number: prNumber ?? null,
    branch: checkRun.branch,
    commit_sha: checkRun.commitSha,
    status: "pending",
    total_diffs: checkRun.summary.analyzed,
    regressions_count: checkRun.summary.regressions,
    engine,
  });

  // 2. Upload diff images
  const nonSkip = checkRun.prefilterResults.filter((pf) => pf.tier !== "SKIP");
  for (const pf of nonSkip) {
    const capturePath = `${capturesDir}/${pf.name}.png`;
    const captureStoragePath = `${config.project}/captures/${runId}/${pf.name}.png`;

    try {
      await uploadImage(client, "captures", capturePath, captureStoragePath);
    } catch {
      console.log(pc.yellow(`  Warning: Could not upload capture ${pf.name}`));
    }

    if (pf.diffImagePath) {
      const diffStoragePath = `${config.project}/diffs/${runId}/${basename(pf.diffImagePath)}`;
      try {
        await uploadImage(client, "diffs", pf.diffImagePath, diffStoragePath);
      } catch {
        console.log(pc.yellow(`  Warning: Could not upload diff ${pf.name}`));
      }
    }
  }

  // 3. Insert diff rows
  await insertDiffs(
    client,
    runId,
    checkRun.prefilterResults,
    checkRun.analysisResults,
    config.project
  );

  // 4. Update run status
  const status = checkRun.summary.regressions > 0 ? "fail" : "pass";
  await updateRunStatus(client, runId, status, checkRun.summary.regressions);

  console.log(pc.green(`  ✓ Run ${runId} uploaded (${status})`));
  return runId;
}

/**
 * Generate signed URLs for diff images in a check run.
 * Returns a map of screenshot name → signed URL.
 */
export async function getSignedDiffUrls(
  client: SupabaseClient,
  runId: string,
  project: string,
  prefilterResults: PrefilterResult[],
  expiresIn: number = 3600
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();

  const nonSkip = prefilterResults.filter(
    (pf) => pf.tier !== "SKIP" && pf.diffImagePath
  );

  for (const pf of nonSkip) {
    const storagePath = `${project}/diffs/${runId}/${pf.name}-diff.png`;
    try {
      const url = await getSignedUrl(client, "diffs", storagePath, expiresIn);
      urls.set(pf.name, url);
    } catch {
      // Silently skip if URL generation fails
    }
  }

  return urls;
}
