/**
 * Script to generate test fixture PNGs for DojoWatch tests.
 * Run: npx tsx tests/create-fixtures.ts
 */
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
mkdirSync(FIXTURES_DIR, { recursive: true });

function createPNG(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number]
): Buffer {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const [r, g, b, a] = fill(x, y);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  return PNG.sync.write(png);
}

// 100x100 solid blue image
const solidBlue = createPNG(100, 100, () => [0, 0, 255, 255]);
writeFileSync(join(FIXTURES_DIR, "identical-a.png"), solidBlue);
writeFileSync(join(FIXTURES_DIR, "identical-b.png"), solidBlue);

// Minor diff: 100x100 blue with 10 scattered red pixels
const minorDiff = createPNG(100, 100, (x, y) => {
  // 10 specific pixels changed to red
  const changedPixels = [
    [5, 5], [15, 20], [30, 40], [50, 10], [70, 80],
    [90, 30], [25, 75], [60, 60], [85, 15], [40, 90],
  ];
  for (const [cx, cy] of changedPixels) {
    if (x === cx && y === cy) return [255, 0, 0, 255];
  }
  return [0, 0, 255, 255];
});
writeFileSync(join(FIXTURES_DIR, "minor-diff-a.png"), solidBlue);
writeFileSync(join(FIXTURES_DIR, "minor-diff-b.png"), minorDiff);

// Major diff: 100x100 blue with a large 30x30 red block (clustered change)
const majorDiff = createPNG(100, 100, (x, y) => {
  if (x >= 20 && x < 50 && y >= 20 && y < 50) {
    return [255, 0, 0, 255]; // 30x30 red block = 900 pixels
  }
  return [0, 0, 255, 255];
});
writeFileSync(join(FIXTURES_DIR, "major-diff-a.png"), solidBlue);
writeFileSync(join(FIXTURES_DIR, "major-diff-b.png"), majorDiff);

console.log("✓ Test fixtures created in tests/fixtures/");
