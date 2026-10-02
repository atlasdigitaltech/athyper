/** Compatibility CLI; domain composition belongs to the host package. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync(
  "pnpm",
  [
    "--filter",
    "@athyper/server-platform-host",
    "exec",
    "tsx",
    "scripts/qualification/qualify-installed-profile-source-dev.ts",
    ...process.argv.slice(2),
  ],
  {
    cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
