import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
if (args.length !== 1 || !["--check", "--confirm=DEV-COMPILATION-RECOVERY-GUARD"].includes(args[0])) throw Error("Use --check|--confirm=DEV-COMPILATION-RECOVERY-GUARD");
const check = args[0] === "--check";
const container = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
if (!container.State.Running || container.Config.Labels["com.docker.compose.project"] !== "athyper-dev") throw Error("DEV_DATABASE_REQUIRED");
const ddl = readFileSync(new URL("../../../ddl/planes/studio/publication/18_compilation_recovery.sql", import.meta.url), "utf8");
execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c", 'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'], {
  input: `BEGIN; SET LOCAL lock_timeout='5s'; ${ddl} ${check ? "ROLLBACK" : "COMMIT"};`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
});
console.log(JSON.stringify({ schema: "athyper.compilation-recovery-guard-install/1", mode: check ? "rolled_back" : "installed",
  ddlSha256: createHash("sha256").update(ddl).digest("hex"), releaseWrites: 0, approvals: 0, activations: 0 }));
