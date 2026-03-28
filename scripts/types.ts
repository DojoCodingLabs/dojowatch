// ─── Configuration ───────────────────────────────────────────────

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export interface EngineConfig {
  local: {
    /** Model to use for local analysis. Default: "claude" (Claude Code itself). */
    model: string;
  };
  ci: {
    /** Model identifier for CI analysis. Default: "gemini-3.1-pro-preview". */
    model: string;
    /** Env var name for the API key. Default: "GOOGLE_GENAI_API_KEY". */
    apiKeyEnv: string;
  };
}

export interface PrefilterConfig {
  /** pixelmatch sensitivity threshold. Lower = more sensitive. Default: 0.05. */
  threshold: number;
  /** Minimum changed pixels to form a spatial cluster. Default: 500. */
  clusterMinPixels: number;
}

export interface DojoWatchConfig {
  /** Project identifier (used for multi-project support). */
  project: string;
  /** Local development URL to capture. */
  baseUrl: string;
  /** Storybook instance URL. If present, enables Storybook crawling. */
  storybookUrl?: string;
  /** Viewport configurations for capture. */
  viewports: Viewport[];
  /** URL paths to capture for full-page regression. */
  routes: string[];
  /** CSS selectors for elements to mask before capture. */
  maskSelectors: string[];
  /** Engine configuration. */
  engine: EngineConfig;
  /** Pre-filter configuration. */
  prefilter: PrefilterConfig;
}

// ─── Capture ─────────────────────────────────────────────────────

export interface CaptureResult {
  /** Human-readable name derived from the route or story. */
  name: string;
  /** Viewport used for this capture. */
  viewport: string;
  /** Absolute path to the captured PNG. */
  path: string;
  /** SHA-256 hash of the PNG file. */
  hash: string;
}

// ─── Pre-filter ──────────────────────────────────────────────────

export type Tier = "SKIP" | "FAST_CHECK" | "FULL_ANALYSIS";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Cluster {
  /** Bounding box of the pixel cluster. */
  bounds: BoundingBox;
  /** Number of changed pixels in this cluster. */
  pixelCount: number;
}

export interface PrefilterResult {
  /** Screenshot name. */
  name: string;
  /** Viewport name. */
  viewport: string;
  /** Classification tier. */
  tier: Tier;
  /** Total number of changed pixels. */
  pixelDiffCount: number;
  /** Percentage of pixels that differ (0-100). */
  pixelDiffPercent: number;
  /** Path to the diff overlay PNG (null if SKIP). */
  diffImagePath: string | null;
  /** Detected spatial clusters of changed pixels. */
  clusters: Cluster[];
}

// ─── Analysis ────────────────────────────────────────────────────

export type DiffClassification = "REGRESSION" | "INTENTIONAL" | "NOISE";
export type Severity = "high" | "medium" | "low";

export interface DiffResult {
  /** Human-readable description of the affected UI element. */
  element: string;
  /** Classification of this visual difference. */
  type: DiffClassification;
  /** Severity level (only for REGRESSION type). */
  severity?: Severity;
  /** What changed and the likely visual impact. */
  description: string;
  /** CSS property, component, or file likely responsible (only for REGRESSION). */
  suggested_fix?: string;
  /** Approximate coordinates of the affected region. */
  bounding_box?: BoundingBox;
}

export interface AnalysisResult {
  /** Screenshot name. */
  name: string;
  /** Viewport name. */
  viewport: string;
  /** Pre-filter tier that was applied. */
  tier: Tier;
  /** Individual visual differences found. */
  diffs: DiffResult[];
}

// ─── Check Run ───────────────────────────────────────────────────

export interface CheckRun {
  /** ISO timestamp of the check. */
  timestamp: string;
  /** Git branch name. */
  branch: string;
  /** Git commit SHA. */
  commitSha: string;
  /** Scope used for capture. */
  scope: "all" | "staged" | "branch";
  /** Pre-filter results for all screenshots. */
  prefilterResults: PrefilterResult[];
  /** AI analysis results (only for non-SKIP screenshots). */
  analysisResults: AnalysisResult[];
  /** Summary counts. */
  summary: {
    total: number;
    skipped: number;
    analyzed: number;
    regressions: number;
    intentional: number;
    noise: number;
  };
}

// ─── Route Map ───────────────────────────────────────────────────

export interface RouteMap {
  /** Maps URL routes to the source files that render them. */
  routes: Record<string, string[]>;
  /** Maps Storybook story IDs to source files. */
  stories: Record<string, string[]>;
}
