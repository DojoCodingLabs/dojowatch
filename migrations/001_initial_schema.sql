-- DojoWatch Database Schema
-- Run this against your Supabase project via the SQL editor or CLI.

-- ─── Tables ──────────────────────────────────────────────────────

-- One row per CI or local check execution
CREATE TABLE IF NOT EXISTS vr_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project TEXT NOT NULL,
  pr_number INTEGER,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pass', 'fail')),
  total_diffs INTEGER NOT NULL DEFAULT 0,
  regressions_count INTEGER NOT NULL DEFAULT 0,
  engine TEXT NOT NULL CHECK (engine IN ('claude', 'gemini')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per changed screenshot in a run
CREATE TABLE IF NOT EXISTS vr_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES vr_runs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  viewport TEXT NOT NULL,
  baseline_storage_path TEXT,
  current_storage_path TEXT,
  diff_storage_path TEXT,
  pixel_diff_percent REAL NOT NULL DEFAULT 0,
  tier TEXT NOT NULL CHECK (tier IN ('SKIP', 'FAST_CHECK', 'FULL_ANALYSIS')),
  analysis JSONB,
  severity TEXT CHECK (severity IN ('high', 'medium', 'low')),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source of truth for approved baseline screenshots
CREATE TABLE IF NOT EXISTS vr_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project TEXT NOT NULL,
  name TEXT NOT NULL,
  viewport TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  hash TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT,
  UNIQUE (project, name, viewport)
);

-- ─── Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_vr_runs_project ON vr_runs(project);
CREATE INDEX IF NOT EXISTS idx_vr_runs_branch ON vr_runs(branch);
CREATE INDEX IF NOT EXISTS idx_vr_runs_pr ON vr_runs(pr_number);
CREATE INDEX IF NOT EXISTS idx_vr_diffs_run_id ON vr_diffs(run_id);
CREATE INDEX IF NOT EXISTS idx_vr_diffs_review ON vr_diffs(review_status);
CREATE INDEX IF NOT EXISTS idx_vr_baselines_project ON vr_baselines(project);
CREATE INDEX IF NOT EXISTS idx_vr_baselines_lookup ON vr_baselines(project, name, viewport);

-- ─── Row Level Security ──────────────────────────────────────────

ALTER TABLE vr_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vr_diffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vr_baselines ENABLE ROW LEVEL SECURITY;

-- Service role (CI uploads) has full access
CREATE POLICY "Service role full access on vr_runs"
  ON vr_runs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on vr_diffs"
  ON vr_diffs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on vr_baselines"
  ON vr_baselines FOR ALL
  USING (true)
  WITH CHECK (true);

-- Anon key can read (for dashboard, when it's built)
CREATE POLICY "Anon read on vr_runs"
  ON vr_runs FOR SELECT
  USING (true);

CREATE POLICY "Anon read on vr_diffs"
  ON vr_diffs FOR SELECT
  USING (true);

CREATE POLICY "Anon read on vr_baselines"
  ON vr_baselines FOR SELECT
  USING (true);

-- ─── Storage Buckets ─────────────────────────────────────────────
-- Create these via Supabase dashboard or CLI:
--   supabase storage create baselines --public false
--   supabase storage create captures  --public false
--   supabase storage create diffs     --public false
--
-- All buckets are private. Dashboard serves images via signed URLs.
