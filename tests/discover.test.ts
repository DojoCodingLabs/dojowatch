import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { detectFramework, detectDevPort, hasStorybook, discoverRoutes } from "../scripts/discover.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-discover-test");

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("detectFramework", () => {
  it("detects Next.js App Router", () => {
    writeFileSync(join(TMP_DIR, "package.json"), JSON.stringify({
      dependencies: { next: "16.0.0", react: "19.0.0" },
    }));
    mkdirSync(join(TMP_DIR, "app"), { recursive: true });
    expect(detectFramework(TMP_DIR)).toBe("nextjs-app");
  });

  it("detects Next.js Pages Router", () => {
    writeFileSync(join(TMP_DIR, "package.json"), JSON.stringify({
      dependencies: { next: "16.0.0" },
    }));
    mkdirSync(join(TMP_DIR, "pages"), { recursive: true });
    expect(detectFramework(TMP_DIR)).toBe("nextjs-pages");
  });

  it("detects Vite", () => {
    writeFileSync(join(TMP_DIR, "package.json"), JSON.stringify({
      devDependencies: { vite: "5.0.0" },
    }));
    expect(detectFramework(TMP_DIR)).toBe("vite");
  });

  it("detects static HTML", () => {
    writeFileSync(join(TMP_DIR, "index.html"), "<html></html>");
    expect(detectFramework(TMP_DIR)).toBe("static");
  });

  it("returns unknown when nothing matches", () => {
    writeFileSync(join(TMP_DIR, "package.json"), JSON.stringify({}));
    expect(detectFramework(TMP_DIR)).toBe("unknown");
  });
});

describe("detectDevPort", () => {
  it("returns 3000 for Next.js", () => {
    expect(detectDevPort(TMP_DIR, "nextjs-app")).toBe(3000);
  });

  it("returns 5173 for Vite (default)", () => {
    expect(detectDevPort(TMP_DIR, "vite")).toBe(5173);
  });

  it("reads custom port from vite.config.ts", () => {
    writeFileSync(join(TMP_DIR, "vite.config.ts"), `
      export default { server: { port: 8080 } }
    `);
    expect(detectDevPort(TMP_DIR, "vite")).toBe(8080);
  });
});

describe("hasStorybook", () => {
  it("returns true when .storybook exists", () => {
    mkdirSync(join(TMP_DIR, ".storybook"), { recursive: true });
    expect(hasStorybook(TMP_DIR)).toBe(true);
  });

  it("returns false when .storybook does not exist", () => {
    expect(hasStorybook(TMP_DIR)).toBe(false);
  });
});

describe("discoverRoutes", () => {
  it("discovers Next.js App Router routes", () => {
    writeFileSync(join(TMP_DIR, "package.json"), JSON.stringify({
      dependencies: { next: "16.0.0" },
    }));
    mkdirSync(join(TMP_DIR, "app/dashboard"), { recursive: true });
    mkdirSync(join(TMP_DIR, "app/settings"), { recursive: true });
    writeFileSync(join(TMP_DIR, "app/page.tsx"), "export default function() {}");
    writeFileSync(join(TMP_DIR, "app/dashboard/page.tsx"), "export default function() {}");
    writeFileSync(join(TMP_DIR, "app/settings/page.tsx"), "export default function() {}");

    const result = discoverRoutes(TMP_DIR);
    expect(result.framework).toBe("nextjs-app");
    expect(result.routes).toContain("/");
    expect(result.routes).toContain("/dashboard");
    expect(result.routes).toContain("/settings");
  });

  it("discovers static HTML routes", () => {
    writeFileSync(join(TMP_DIR, "index.html"), "<html></html>");
    writeFileSync(join(TMP_DIR, "about.html"), "<html></html>");

    const result = discoverRoutes(TMP_DIR);
    expect(result.framework).toBe("static");
    expect(result.routes).toContain("/");
    expect(result.routes).toContain("/about");
  });

  it("returns / as fallback for unknown frameworks", () => {
    writeFileSync(join(TMP_DIR, "package.json"), JSON.stringify({}));
    const result = discoverRoutes(TMP_DIR);
    expect(result.routes).toEqual(["/"]);
  });
});
