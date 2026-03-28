#!/usr/bin/env node
/**
 * DojoWatch CLI — unified entrypoint for all commands.
 *
 * Usage:
 *   dojowatch init              — Discover routes, create config and baselines
 *   dojowatch capture [--scope] — Capture screenshots
 *   dojowatch check [--fast]    — Full pipeline: capture → prefilter → analysis
 *   dojowatch approve [--all]   — Promote captures to baselines
 *   dojowatch stats             — Show regression statistics
 *   dojowatch discover          — Auto-detect framework and routes
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";

const __dirname = dirname(fileURLToPath(import.meta.url));

const COMMANDS: Record<string, { script: string; description: string }> = {
  init: { script: "discover.ts", description: "Discover routes, create config and baselines" },
  capture: { script: "capture.ts", description: "Capture screenshots" },
  check: { script: "ci.ts", description: "Full pipeline: capture → prefilter → analysis" },
  approve: { script: "baseline.ts", description: "Promote captures to baselines" },
  discover: { script: "discover.ts", description: "Auto-detect framework and routes" },
  prefilter: { script: "prefilter.ts", description: "Run pixelmatch pre-filter" },
};

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  const restArgs = args.slice(1);

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log("dojowatch v0.6.0");
    return;
  }

  const cmd = COMMANDS[command];
  if (!cmd) {
    console.error(pc.red(`Unknown command: ${command}`));
    console.error(pc.dim(`Run 'dojowatch --help' for available commands.`));
    process.exit(1);
  }

  const scriptPath = join(__dirname, cmd.script);

  try {
    execFileSync("npx", ["tsx", scriptPath, ...restArgs], {
      stdio: "inherit",
      env: process.env,
    });
  } catch (err) {
    // execFileSync throws on non-zero exit — the child already printed its error
    const code = (err as { status?: number }).status ?? 1;
    process.exit(code);
  }
}

function printHelp(): void {
  console.log(pc.bold("DojoWatch — AI-native visual regression testing\n"));
  console.log("Usage: dojowatch <command> [options]\n");
  console.log("Commands:");
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    console.log(`  ${pc.cyan(name.padEnd(12))} ${cmd.description}`);
  }
  console.log(`\n  ${pc.cyan("--help".padEnd(12))} Show this help`);
  console.log(`  ${pc.cyan("--version".padEnd(12))} Show version`);
  console.log(`\nExamples:`);
  console.log(pc.dim("  dojowatch discover            # Auto-detect framework and routes"));
  console.log(pc.dim("  dojowatch capture --scope=all  # Capture all routes"));
  console.log(pc.dim("  dojowatch check --fast         # Pixelmatch only, no AI"));
  console.log(pc.dim("  dojowatch approve --promote --all  # Promote all captures to baselines"));
}

main();
