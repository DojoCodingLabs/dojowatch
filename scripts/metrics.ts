/**
 * Performance and accessibility metrics capture.
 *
 * Collects Web Vitals (LCP, CLS, FCP, TTFB) and a11y violations
 * alongside visual screenshots.
 */
import type { PerformanceMetrics, A11yViolation } from "./types.js";

/**
 * Capture Web Vital performance metrics from the current page.
 */
export async function capturePerformanceMetrics(
  page: { evaluate: (fn: () => unknown) => Promise<unknown> }
): Promise<PerformanceMetrics> {
  const metrics = await page.evaluate(() => {
    const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    const paintEntries = performance.getEntriesByType("paint") as PerformanceEntry[];

    const nav = navEntries[0];
    const fcp = paintEntries.find((e) => e.name === "first-contentful-paint");

    // LCP: use the PerformanceObserver-recorded value if available
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    const lcp = lcpEntries.length > 0
      ? (lcpEntries[lcpEntries.length - 1] as PerformanceEntry & { startTime: number }).startTime
      : null;

    // CLS: sum of layout shift entries (if available)
    const layoutShifts = performance.getEntriesByType("layout-shift") as Array<
      PerformanceEntry & { value: number; hadRecentInput: boolean }
    >;
    const cls = layoutShifts.length > 0
      ? layoutShifts
          .filter((e) => !e.hadRecentInput)
          .reduce((sum, e) => sum + e.value, 0)
      : null;

    return {
      lcp: lcp ?? null,
      cls: cls !== null ? Math.round(cls * 10000) / 10000 : null,
      fcp: fcp?.startTime ?? null,
      ttfb: nav?.responseStart ? Math.round(nav.responseStart) : null,
    };
  });

  return metrics as PerformanceMetrics;
}

/**
 * Run accessibility audit on the current page using axe-core (injected at runtime).
 * Falls back gracefully if axe-core is not available.
 */
export async function captureA11yViolations(
  page: {
    evaluate: (fn: () => Promise<unknown>) => Promise<unknown>;
    addScriptTag: (options: { url?: string; content?: string }) => Promise<unknown>;
  }
): Promise<A11yViolation[]> {
  try {
    // Inject axe-core from CDN (only if not already present)
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if ((window as unknown as Record<string, unknown>).axe) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";
        script.onload = () => resolve();
        script.onerror = () => resolve(); // Don't fail if CDN is unreachable
        document.head.appendChild(script);
      });
    });

    // Run axe analysis
    const results = await page.evaluate(async () => {
      const axe = (window as unknown as Record<string, { run: () => Promise<{ violations: Array<{ id: string; impact: string; description: string; nodes: unknown[] }> }> }>).axe;
      if (!axe) return [];
      const result = await axe.run();
      return result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      }));
    });

    return (results as A11yViolation[]) ?? [];
  } catch {
    // Graceful fallback — a11y is optional
    return [];
  }
}
