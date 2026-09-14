import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { NoSkippedPostgresReporter } from "./src/no-skipped-postgres-reporter.js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  root: repositoryRoot,
  test: {
    environment: "node",
    // This intentionally discovers all server PostgreSQL suites. It includes the
    // named qualification owners and cannot become stale when another owner adds one.
    include: ["server/packages/**/*.postgres.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    globalSetup: [
      fileURLToPath(new URL("./src/postgres-global-setup.ts", import.meta.url)),
    ],
    reporters: [
      "default",
      ...(process.env["ATHYPER_POSTGRES_JSON_REPORT"] ? ["json" as const] : []),
      new NoSkippedPostgresReporter(),
    ],
    ...(process.env["ATHYPER_POSTGRES_JSON_REPORT"]
      ? { outputFile: { json: process.env["ATHYPER_POSTGRES_JSON_REPORT"] } }
      : {}),
    passWithNoTests: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    sequence: { concurrent: false },
    fileParallelism: false,
  },
});
