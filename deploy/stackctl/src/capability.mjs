import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { runReadOnly, runtimeRoot } from "./io.mjs";
import { loadModel } from "./model.mjs";
import { createPlan } from "./plan.mjs";
import { qualificationRoot } from "./qualification.mjs";

const PROFILES = new Set(["observability", "secretstore", "analytics", "admin-db", "admin-queue"]);
const PORT_BASES = { dev: 53000, qa: 53100, stg: 53200 };
const PROFILE_BINDING = {
  observability: "grafana",
  secretstore: "infisical",
  analytics: "analytics",
  "admin-db": "pgweb",
  "admin-queue": "queue",
};

function secretProblem(path) {
  if (!existsSync(path)) return "is absent";
  const stat = statSync(path);
  if (!stat.isFile()) return "is not a regular file";
  if ((stat.mode & 0o077) !== 0) return "is readable by group or others";
  if (!readFileSync(path, "utf8").trim()) return "is empty";
  return null;
}

export function createCapabilityPlan(repoRoot, instanceId, profile) {
  if (!PROFILES.has(profile)) throw new Error(`Unsupported optional capability profile: ${profile}`);
  const model = loadModel(repoRoot, instanceId);
  const deployment = createPlan(repoRoot, instanceId);
  const optionalPath = join(repoRoot, "deploy/compose/instance/compose.optional.yaml");
  const optionalCompose = YAML.parse(readFileSync(optionalPath, "utf8"), { merge: true });
  const services = model.services
    .filter((service) => service.profiles.includes(profile))
    .sort((left, right) => left.id.localeCompare(right.id));
  const blockers = [...deployment.blockers];
  for (const service of services) {
    if (!optionalCompose.services?.[service.id]) blockers.push(`Optional service is not composed: ${service.id}.`);
  }

  const additionalMemoryMiB = services.reduce((total, service) => total + service.resources.memoryMiB, 0);
  const additionalCpu = services.reduce((total, service) => total + service.resources.cpu, 0);
  const totalMemoryMiB = deployment.resources.memoryMiB + additionalMemoryMiB;
  const totalCpu = Number((deployment.resources.cpu + additionalCpu).toFixed(2));
  if (totalMemoryMiB > deployment.resources.limitMemoryMiB) {
    blockers.push(`Capability profile requires ${totalMemoryMiB} MiB with ${instanceId}; host profile permits ${deployment.resources.limitMemoryMiB} MiB.`);
  }
  if (totalCpu > deployment.resources.limitCpu) {
    blockers.push(`Capability profile requires ${totalCpu} CPU with ${instanceId}; host profile permits ${deployment.resources.limitCpu}.`);
  }

  const requiredSecrets = [...new Set(services.flatMap((service) => service.secrets))].sort();
  for (const secret of requiredSecrets) {
    const problem = secretProblem(join(runtimeRoot(), "instances", instanceId, "secrets", secret));
    if (problem) blockers.push(`Optional secret file ${problem}: ${secret}.`);
  }
  const recoveryEvidence = {
    secretstore: join(qualificationRoot(), "capabilities", "infisical-recovery.yaml"),
    analytics: join(qualificationRoot(), "capabilities", "analytics-backup.yaml"),
  }[profile];
  if (recoveryEvidence && !existsSync(recoveryEvidence)) {
    blockers.push(`Capability recovery evidence is absent: ${recoveryEvidence}.`);
  }

  const portBase = PORT_BASES[instanceId];
  if (!portBase) blockers.push(`No optional-capability port allocation exists for instance ${instanceId}.`);
  const bindings = portBase ? {
    grafana: `127.0.0.1:${portBase}`,
    infisical: `127.0.0.1:${portBase + 1}`,
    analytics: `127.0.0.1:${portBase + 2}`,
    pgweb: `127.0.0.1:${portBase + 3}`,
    queue: `127.0.0.1:${portBase + 4}`,
  } : {};
  const bindingId = PROFILE_BINDING[profile];
  const activeBindings = bindingId && bindings[bindingId] ? { [bindingId]: bindings[bindingId] } : {};
  const occupiedResult = runReadOnly("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort",
  ], { timeout: 12_000 });
  const occupiedPorts = new Set(occupiedResult.ok
    ? occupiedResult.stdout.split(/\s+/u).map(Number).filter(Number.isInteger)
    : []);
  for (const [id, binding] of Object.entries(activeBindings)) {
    const port = Number(binding.slice(binding.lastIndexOf(":") + 1));
    if (occupiedPorts.has(port)) blockers.push(`Optional loopback binding is already listening: ${id} (${binding}).`);
  }
  const environment = {
    grafana: { ATHYPER_GRAFANA_BIND: activeBindings.grafana },
    infisical: {
      ATHYPER_INFISICAL_BIND: activeBindings.infisical,
      ATHYPER_INFISICAL_URL: activeBindings.infisical ? `http://${activeBindings.infisical}` : undefined,
    },
    analytics: { ATHYPER_ANALYTICS_BIND: activeBindings.analytics },
    pgweb: { ATHYPER_PGWEB_BIND: activeBindings.pgweb },
    queue: { ATHYPER_QUEUE_BIND: activeBindings.queue },
  }[bindingId] ?? {};

  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "CapabilityPlan",
    metadata: { instance: instanceId, profile },
    readOnly: true,
    executionAuthorized: false,
    status: blockers.length ? "blocked" : "ready-for-explicit-authorization",
    blockers,
    project: model.instance.spec.composeProject,
    composeFiles: [...deployment.sources.compose, optionalPath],
    composeProfiles: [profile],
    services: services.map(({ id, image, lifecycle, resources, secrets }) => ({ id, image, lifecycle, resources, secrets })),
    resources: {
      baselineMemoryMiB: deployment.resources.memoryMiB,
      additionalMemoryMiB,
      totalMemoryMiB,
      limitMemoryMiB: deployment.resources.limitMemoryMiB,
      baselineCpu: deployment.resources.cpu,
      additionalCpu: Number(additionalCpu.toFixed(2)),
      totalCpu,
      limitCpu: deployment.resources.limitCpu,
    },
    bindings: activeBindings,
    environment: Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined)),
    accessPolicy: { loopbackOnly: true, externallyRouted: false, enabledOnlyByProfile: profile },
    requiredSecrets,
    recoveryEvidence: recoveryEvidence ?? null,
    actions: ["No action: this command only validates an optional capability profile."],
  };
}
