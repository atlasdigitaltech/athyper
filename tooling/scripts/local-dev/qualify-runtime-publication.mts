/** DEV-only exact-release workload qualification. Runs checks; never forges human review. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { discoverRuntimeQualificationTests, runtimeQualificationSuites } from "./runtime-qualification-checks.mjs";
const root = process.cwd();
const discovery = discoverRuntimeQualificationTests(root);
if (process.argv.includes("--check-test-discovery")) {
  console.log(JSON.stringify(discovery, null, 2));
  process.exit(0);
}
const output = resolve(process.argv[2] ?? "docs/reports/bp-integration-20260921/runtime-workload");
const install = process.argv.includes("--install");
const configPath = join(homedir(), ".athyper/instances/dev/secrets/dev-publication/server.json");
if (statSync(configPath).mode & 0o077) throw Error("Owner-only DEV configuration required");
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (config.instance !== "dev" || config.entityCode !== "business_partner" || config.targets.join() !== "neon") throw Error("Configured DEV intake scope required");
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "test-discovery.json"), JSON.stringify(discovery, null, 2) + "\n", { mode: 0o600 });
const checks: { kind: string; path: string; sha256: string }[] = [];
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const paths = execFileSync("rg", ["--files", "server/apps/platform-host/src", "server/apps/platform-host/scripts", "server/packages/services/publication/src", "server/packages/services/master-data/src", "server/packages/services/records/src", "server/packages/contracts/records/src", "server/packages/platform/experience/src", "server/packages/runtime/jobs/src", "server/packages/runtime/scheduling/src", "server/packages/contracts/metadata/src", "server/packages/planes/studio/meta-entity-authoring/src", "server/packages/platform/metadata/src", "packages/contracts/platform/entity-runtime/src"], { encoding: "utf8" }).trim().split("\n").filter(p => /\.(ts|tsx|json)$/.test(p));
paths.push("tooling/scripts/local-dev/qualify-runtime-publication.mts", "tooling/scripts/local-dev/runtime-qualification-checks.mjs", "server/apps/platform-host/vitest.config.ts");
const sources = paths.sort().map(path => ({ kind: "source", path: resolve(path), sha256: hash(readFileSync(path)) }));
function check(kind: "build" | "tests", name: string, args: string[]) {
  const result = spawnSync("pnpm", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const path = join(output, name + ".log");
  writeFileSync(path, result.stdout + result.stderr, { mode: 0o600 });
  if (result.error || result.status !== 0) throw Error(`Qualification failed: ${name}; inspect ${path}`);
  checks.push({ kind, path, sha256: hash(readFileSync(path)) });
  console.log(`${name}: passed`);
}
check("build", "build", ["build"]);
check("tests", "publication-services", ["--filter", "@athyper/server-service-publication", "--filter", "@athyper/server-service-master-data", "--filter", "@athyper/server-plane-studio-meta-entity-authoring", "test"]);
for (const suite of runtimeQualificationSuites)
  check("tests", suite.name, ["--filter", suite.packageName, "exec", "vitest", "run", "--passWithNoTests=false", "--allowOnly=false"]);
check("tests", "workload-configuration", ["exec", "node", "--test", "tooling/scripts/local-dev/dev-publish.test.mjs"]);
execFileSync("pnpm", ["exec", "tsx", "tooling/scripts/verification/capture-business-partner-intake-exact-release.mts"], { stdio: "pipe" });
const exact = JSON.parse(readFileSync("docs/reports/bp-integration-20260921/native-intake-exact-release.json", "utf8"));
if (exact.coordinate.tenantId !== config.tenantId || exact.coordinate.entityCode !== config.entityCode || exact.durable.createdBy !== config.author.principalId || exact.durable.approvedBy !== config.publisher.principalId) throw Error("Exact workload release required");
for (const entry of sources) {
  if (hash(readFileSync(entry.path)) !== entry.sha256) throw Error(`Source changed during qualification: ${entry.path}`);
  checks.push(entry);
}
const now = Date.now();
const q = { schemaVersion: 1, kind: "devfull_runtime_qualification", coordinate: exact.coordinate, signingKeyId: exact.source.contract_signing_key_id, qualifiedAt: new Date(now).toISOString(), expiresAt: new Date(now + 86400000).toISOString(), checks };
const path = join(output, "qualification.json"), bytes = JSON.stringify(q, null, 2) + "\n";
writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
if (install) {
  writeFileSync(configPath + ".before-runtime-approval", readFileSync(configPath), { mode: 0o600 });
  config.runtimeApproval = { releaseId: exact.coordinate.releaseId, path, sha256: hash(Buffer.from(bytes)) };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}
console.log(JSON.stringify({ releaseId: exact.coordinate.releaseId, path, evidenceFiles: checks.length, installed: install, humanApprovalsCreated: false, activated: false }));
