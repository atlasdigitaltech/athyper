/** Compatibility CLI; host composition stays inside the host package. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync(
  process.execPath,
  [
    "--import",
    import.meta.resolve("tsx"),
    fileURLToPath(
      new URL(
        "../../../../apps/platform-host/scripts/qualification/check-dev-principal-relationships.ts",
        import.meta.url,
      ),
    ),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
