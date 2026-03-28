import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
import pc from "picocolors";
import type { AnalysisResult, DiffResult, PrefilterResult } from "./types.js";

/**
 * Analyze screenshot pairs using Gemini's multimodal capabilities.
 *
 * Designed for CI environments where Claude Code isn't available.
 * Batches pairs into groups for efficient token usage with Gemini's
 * large context window.
 */
export async function analyzeWithGemini(
  pairs: Array<{
    name: string;
    viewport: string;
    tier: PrefilterResult["tier"];
    baselinePath: string;
    capturePath: string;
    diffPath: string | null;
  }>,
  options: {
    model?: string;
    apiKeyEnv?: string;
    batchSize?: number;
  } = {}
): Promise<AnalysisResult[]> {
  const {
    model = "gemini-3.1-pro-preview",
    apiKeyEnv = "GOOGLE_GENAI_API_KEY",
    batchSize = 20,
  } = options;

  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `Missing API key. Set the ${apiKeyEnv} environment variable.`
    );
  }

  const genai = new GoogleGenAI({ apiKey });

  const results: AnalysisResult[] = [];

  // Process in batches
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    console.log(
      pc.dim(`  Analyzing batch ${Math.floor(i / batchSize) + 1} (${batch.length} pairs)...`)
    );

    const batchResults = await analyzeBatch(genai, model, batch);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Analyze a batch of screenshot pairs in a single Gemini API call.
 */
async function analyzeBatch(
  genai: GoogleGenAI,
  model: string,
  batch: Array<{
    name: string;
    viewport: string;
    tier: PrefilterResult["tier"];
    baselinePath: string;
    capturePath: string;
    diffPath: string | null;
  }>
): Promise<AnalysisResult[]> {
  // Build the content parts: text prompt + image pairs
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  parts.push({
    text: buildBatchPrompt(batch.length),
  });

  for (let i = 0; i < batch.length; i++) {
    const pair = batch[i];

    parts.push({
      text: `\n--- Screenshot ${i + 1}: "${pair.name}" (${pair.viewport}, tier: ${pair.tier}) ---\nBaseline:`,
    });

    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: readFileSync(pair.baselinePath).toString("base64"),
      },
    });

    parts.push({ text: "Current:" });

    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: readFileSync(pair.capturePath).toString("base64"),
      },
    });

    if (pair.diffPath) {
      parts.push({ text: "Diff overlay:" });
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: readFileSync(pair.diffPath).toString("base64"),
        },
      });
    }
  }

  const response = await genai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const text = response.text ?? "[]";
  return parseBatchResponse(text, batch);
}

/**
 * Build the system prompt for batch analysis.
 */
function buildBatchPrompt(pairCount: number): string {
  return `You are a visual regression testing AI. Analyze ${pairCount} screenshot pair(s).

For each pair, compare the baseline against the current capture and classify every visual difference.

## Classification
- **REGRESSION**: Unintended visual change (bug). Include severity: "high", "medium", or "low".
- **INTENTIONAL**: Deliberate change (feature, design update).
- **NOISE**: Insignificant rendering variance (anti-aliasing, sub-pixel).

## Severity Guide
- **high**: Element disappeared, layout broken, text unreadable, design token violation
- **medium**: Element shifted >4px, spacing inconsistency, unexpected border/shadow change
- **low**: Minor spacing (1-4px), subtle color shift, slight font change

## Output Format
Return a JSON array with one object per screenshot pair, in order:

\`\`\`json
[
  {
    "index": 0,
    "diffs": [
      {
        "element": "primary CTA button",
        "type": "REGRESSION",
        "severity": "medium",
        "description": "Button shifted 12px right, breaking alignment with the form above",
        "suggested_fix": "Check margin-left on the .cta-button class"
      }
    ]
  }
]
\`\`\`

Rules:
- If a pair has NO visual differences, return \`{"index": N, "diffs": []}\`
- For INTENTIONAL and NOISE, omit "severity" and "suggested_fix"
- Be concise but specific in descriptions
- Focus on visual impact, not pixel counts`;
}

/**
 * Parse Gemini's JSON response into AnalysisResult objects.
 */
function parseBatchResponse(
  responseText: string,
  batch: Array<{ name: string; viewport: string; tier: PrefilterResult["tier"] }>
): AnalysisResult[] {
  let parsed: Array<{ index: number; diffs: DiffResult[] }>;

  try {
    parsed = JSON.parse(responseText);
  } catch {
    console.error(pc.yellow("  Warning: Failed to parse Gemini response as JSON. Raw:"));
    console.error(pc.dim(`  ${responseText.slice(0, 500)}`));
    // Return empty results for all pairs in the batch
    return batch.map((pair) => ({
      name: pair.name,
      viewport: pair.viewport,
      tier: pair.tier,
      diffs: [],
    }));
  }

  if (!Array.isArray(parsed)) {
    parsed = [parsed as { index: number; diffs: DiffResult[] }];
  }

  // Map parsed results back to batch items
  return batch.map((pair, i) => {
    const entry = parsed.find((r) => r.index === i) ?? { diffs: [] };
    return {
      name: pair.name,
      viewport: pair.viewport,
      tier: pair.tier,
      diffs: Array.isArray(entry.diffs) ? entry.diffs : [],
    };
  });
}
