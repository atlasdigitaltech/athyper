import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const allowSkip = process.argv.includes("--allow-skip");
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const vitestEntry = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const environment = { ...process.env };
if (allowSkip) environment.ATHYPER_POSTGRES_LOCAL_SKIP = "true";

const result = spawnSync(process.execPath, [vitestEntry, "run", "--config", "vitest.integration.config.ts"], {
  cwd: packageRoot,
  env: environment,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
