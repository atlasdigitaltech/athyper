import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";

function normalizePattern(pattern) {
  return pattern
    .replace(/\*\*tests\*\*/g, "__tests__")
    .replace(/\/\*{2}\//g, "/**/")
    .replace(/\\/g, "/");
}

function collectFiles(patterns) {
  const roots = patterns.flatMap((pattern) => {
    const normalized = normalizePattern(pattern);
    return globSync(normalized, { nodir: true });
  });

  return [...new Set(roots)]
    .sort()
    .filter((filePath) => filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx"));
}

function main() {
  const patterns = process.argv.slice(2).filter(Boolean);

  if (patterns.length === 0) {
    console.error("Usage: node scripts/run-ci-route-suites.mjs <glob-pattern>...");
    process.exit(1);
  }

  const candidates = collectFiles(patterns);

  if (candidates.length === 0) {
    console.log(
      "No matching test files found for route suite patterns. This is treated as no-op for CI wiring robustness.",
    );
    process.exit(0);
  }

  const commandArgs = ["exec", "vitest", "run", ...candidates];
  const runner = spawnSync("pnpm", commandArgs, {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  process.exit(runner.status ?? 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
