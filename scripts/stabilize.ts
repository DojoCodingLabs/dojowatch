import type { Page } from "playwright";

/**
 * CSS injected into pages to freeze all animations and transitions.
 * This ensures deterministic screenshots regardless of animation state.
 */
const FREEZE_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
}
`;

/**
 * CSS used to replace masked element content with a solid placeholder.
 */
const MASK_PLACEHOLDER_COLOR = "#808080";

/**
 * Inject stabilization measures into a page to ensure deterministic screenshots.
 *
 * 1. Freezes all CSS animations and transitions
 * 2. Waits for network idle (no pending requests)
 * 3. Waits for all fonts to finish loading
 */
export async function injectStabilization(page: Page): Promise<void> {
  // Freeze animations and transitions
  await page.addStyleTag({ content: FREEZE_CSS });

  // Wait for network to settle
  await page.waitForLoadState("networkidle");

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Mask dynamic elements by replacing their content with a solid placeholder.
 * This prevents false positives from timestamps, live counters, user avatars, etc.
 *
 * Elements are identified by CSS selectors (e.g., "[data-vr-mask]", ".live-timestamp").
 */
export async function maskElements(
  page: Page,
  selectors: string[]
): Promise<void> {
  if (selectors.length === 0) return;

  const combinedSelector = selectors.join(", ");

  await page.evaluate(
    ({ selector, color }) => {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const htmlEl = el as HTMLElement;
        htmlEl.style.backgroundColor = color;
        htmlEl.style.color = color;
        htmlEl.style.backgroundImage = "none";
        // Replace text content to avoid partial text rendering differences
        htmlEl.textContent = "";
        // Hide child elements (images, icons, etc.)
        for (const child of htmlEl.children) {
          (child as HTMLElement).style.visibility = "hidden";
        }
      }
    },
    { selector: combinedSelector, color: MASK_PLACEHOLDER_COLOR }
  );
}
