// ─── Configuration ───────────────────────────────────────────────

export interface Viewport {
  name: string;
  width: number;
  height: number;
  /** Device pixel ratio for retina screenshots. Default: 1. */
  deviceScaleFactor?: number;
  /** Whether to emulate touch events. */
  isMobile?: boolean;
  /** User-agent string override. */
  userAgent?: string;
}

/** Well-known device presets that map to Playwright's devices. */
export type DevicePreset =
  | "iPhone 14"
  | "iPhone 14 Pro Max"
  | "iPhone SE"
  | "iPad"
  | "iPad Pro"
  | "Pixel 7"
  | "Galaxy S23"
  | "Desktop Chrome"
  | "Desktop Firefox"
  | "Desktop Safari";

export interface ComponentRegion {
  /** CSS selector for the component to capture. */
  selector: string;
  /** Human-readable name for this component. */
  name: string;
}

export interface PerformanceMetrics {
  /** Largest Contentful Paint in ms. */
  lcp: number | null;
  /** Cumulative Layout Shift. */
  cls: number | null;
  /** First Contentful Paint in ms. */
  fcp: number | null;
  /** Time to First Byte in ms. */
  ttfb: number | null;
}

export interface A11yViolation {
  /** Rule ID (e.g., "color-contrast", "image-alt"). */
  id: string;
  /** Impact level. */
  impact: "critical" | "serious" | "moderate" | "minor";
  /** Human-readable description. */
  description: string;
  /** Number of elements affected. */
  nodes: number;
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

export interface AuthConfig {
  /** Default Playwright storageState file for authenticated captures. */
  storageState?: string;
  /** Named auth profiles mapping to storageState files (e.g., { "admin": "e2e/.auth/admin.json" }). */
  profiles?: Record<string, string>;
  /** Maps routes to profile names. null = anonymous (no auth). Unlisted routes use default storageState. */
  routes?: Record<string, string | null>;
}

export interface ReadinessCheck {
  /** CSS selector to wait for before capturing. */
  waitForSelector?: string;
  /** Text content to wait for on the page. */
  waitForText?: string;
  /** Maximum time in ms to wait for readiness. Default: 10000. */
  timeout?: number;
}

export interface SmartCaptureConfig {
  /** Number of capture attempts for flaky detection. Default: 1 (no retry). */
  retries?: number;
  /** Global readiness checks applied to all routes. */
  readiness?: ReadinessCheck;
  /** Per-route readiness overrides. */
  routeReadiness?: Record<string, ReadinessCheck>;
  /** Enable bot/challenge page detection. Default: true. */
  detectBotProtection?: boolean;
  /** Enable auto-detection of dynamic content via rapid double-capture. Default: false. */
  detectDynamicContent?: boolean;
  /** Framework-specific hydration signal selectors. Auto-detected if empty. */
  hydrationSelectors?: string[];
  /** Parallel capture concurrency limit. Default: 4. */
  concurrency?: number;
  /** Compress PNGs before storage (reduces size ~60-80%). Default: false. */
  compressPng?: boolean;
  /** Per-route capture timeout in ms. Default: 30000. */
  routeTimeout?: number;
}

export interface SupabaseConfig {
  /** Supabase project URL. Read from env var in CI, .env.local locally. */
  url: string;
  /** Supabase anon key for client-side access. */
  anonKey: string;
  /** Env var name for the service role key (CI uploads). Default: "SUPABASE_SERVICE_KEY". */
  serviceKeyEnv: string;
  /** Signed URL expiration in seconds. Default: 3600 (1 hour). */
  signedUrlExpiry: number;
}

export interface DojoWatchConfig {
  /** Project identifier (used for multi-project support). */
  project: string;
  /** Local development URL to capture. */
  baseUrl: string;
  /** Storybook instance URL. If present, enables Storybook crawling. */
  storybookUrl?: string;
  /** Viewport configurations for capture. Can include DevicePreset strings. */
  viewports: Viewport[];
  /** Device preset names (resolved to Playwright device descriptors). */
  devices?: DevicePreset[];
  /** URL paths to capture for full-page regression. */
  routes: string[];
  /** CSS selectors for elements to mask before capture. */
  maskSelectors: string[];
  /** Named component regions for element-level capture. */
  components?: ComponentRegion[];
  /** Color schemes to capture. Default: page's natural scheme only. */
  colorSchemes?: Array<"light" | "dark">;
  /** Locales to capture (e.g., ["en", "ja", "ar"]). */
  locales?: string[];
  /** Engine configuration. */
  engine: EngineConfig;
  /** Pre-filter configuration. */
  prefilter: PrefilterConfig;
  /** Authentication configuration. Optional — when absent, captures run as anonymous. */
  auth?: AuthConfig;
  /** Smart capture configuration. Controls readiness, retries, bot detection, hydration. */
  smart?: SmartCaptureConfig;
  /** Supabase configuration. Optional — when absent, local file storage is used. */
  supabase?: SupabaseConfig;
}

// ─── Capture ─────────────────────────────────────────────────────

export type CaptureWarningType =
  | "bot_protection"
  | "flaky_capture"
  | "dynamic_content"
  | "hydration_timeout"
  | "readiness_timeout";

export interface CaptureWarning {
  type: CaptureWarningType;
  message: string;
  /** Suggested action (e.g., "add data-vr-mask to .live-counter"). */
  suggestion?: string;
}

export interface CaptureResult {
  /** Human-readable name derived from the route or story. */
  name: string;
  /** Viewport used for this capture. */
  viewport: string;
  /** Auth profile used (undefined = anonymous). */
  profile?: string;
  /** Color scheme used (undefined = natural). */
  colorScheme?: "light" | "dark";
  /** Locale used (undefined = default). */
  locale?: string;
  /** Absolute path to the captured PNG. */
  path: string;
  /** SHA-256 hash of the PNG file. */
  hash: string;
  /** Performance metrics captured alongside the screenshot. */
  performance?: PerformanceMetrics;
  /** Accessibility violations found at capture time. */
  a11yViolations?: A11yViolation[];
  /** Warnings from smart capture layer. */
  warnings: CaptureWarning[];
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

// ─── Supabase Database Rows ──────────────────────────────────────

export interface VrRunRow {
  id: string;
  project: string;
  pr_number: number | null;
  branch: string;
  commit_sha: string;
  status: "pending" | "pass" | "fail";
  total_diffs: number;
  regressions_count: number;
  engine: "claude" | "gemini";
  created_at: string;
}

export interface VrDiffRow {
  id: string;
  run_id: string;
  name: string;
  viewport: string;
  baseline_storage_path: string | null;
  current_storage_path: string | null;
  diff_storage_path: string | null;
  pixel_diff_percent: number;
  tier: Tier;
  analysis: DiffResult[] | null;
  severity: Severity | null;
  review_status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface VrBaselineRow {
  id: string;
  project: string;
  name: string;
  viewport: string;
  storage_path: string;
  hash: string;
  approved_at: string;
  approved_by: string | null;
}
