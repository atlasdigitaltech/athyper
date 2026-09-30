import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const required = ["STUDIO", "NEON", "MESH"].flatMap(plane => [
  `ATHYPER_${plane}_TEST_DATABASE_URL`, `ATHYPER_${plane}_TEST_DATABASE_ROLE`,
]);
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) {
  console.error(`All-plane localization RLS validation requires: ${missing.join(", ")}`);
  process.exit(1);
}
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
  "run", "src/localization-all-plane.postgres.test.ts",
], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, ATHYPER_SERVICE_DB_TESTS: "true" },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
