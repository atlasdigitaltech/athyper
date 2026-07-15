import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { qualifyMetaEntity } from "./qualify-meta-entity.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
if (!args.route) throw new Error("--route=<inventory id> is required");
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const load = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const inventory = load("config/governance/meta-entity-routes.json");
const current = load(args.current || "perf/qualification/current-report.json");
const baseline = load(args.baseline || "perf/baselines/meta-entity-qualification.v1.json");
const budgets = load("config/governance/meta-entity-performance-budgets.json");
const exceptions = load("config/governance/meta-entity-performance-exceptions.json");
const evidence = load(args.evidence || "config/governance/meta-entity-retirement-evidence.json");
const route = inventory.routes.find((entry) => entry.id === args.route);
if (!route) throw new Error(`unknown route '${args.route}'`);
const failures = [...qualifyMetaEntity({ inventory, budgets, baseline, current, exceptions }).failures];
if (route.rolloutState !== "full_rollout") failures.push(`${route.id}: rollout is '${route.rolloutState}', not full_rollout`);
if ((current.routes?.[route.id]?.compatibilityTraffic ?? Number.POSITIVE_INFINITY) !== 0) failures.push(`${route.id}: compatibility traffic is not zero`);
const record = evidence.routes?.[route.id];
if (!record?.zeroTrafficSince || !record?.observedThrough || !record?.approvedBy || !record?.qualificationArtifact
  || !record?.owner || !record?.releaseId || !record?.observationReleaseId) {
  failures.push(`${route.id}: complete retirement evidence is missing`);
} else {
  const started = Date.parse(record.zeroTrafficSince);
  const ended = Date.parse(record.observedThrough);
  const elapsedDays = (ended - started) / 86_400_000;
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    failures.push(`${route.id}: zero-traffic evidence dates are invalid`);
  } else if (elapsedDays < inventory.releaseWindowDays) {
    failures.push(`${route.id}: zero-traffic window ${elapsedDays.toFixed(1)}d is below ${inventory.releaseWindowDays}d`);
  }
}
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`${route.id}: compatibility path is eligible for removal.`);
