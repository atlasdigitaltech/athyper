import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { createValidator } from "./schema.mjs";
import { readYaml, runReadOnly, runtimeRoot } from "./io.mjs";

const MODE_PROFILE = Object.freeze({
  lite: null,
  tracing: "tracing",
  statuswatch: "monitor-status",
  cronwatch: "monitor-cron",
  errorcollect: "monitor-errors",
});

function memoryMiB(value) {
  const match = String(value).match(/^(\d+)m$/u);
  if (!match) throw new Error(`Operations service has a non-MiB memory limit: ${value}`);
  return Number(match[1]);
}

function secretProblem(path) {
  if (!existsSync(path)) return "is absent";
  const stat = statSync(path);
  if (!stat.isFile()) return "is not a regular file";
  if ((stat.mode & 0o077) !== 0) return "is readable by group or others";
  if (!readFileSync(path, "utf8").trim()) return "is empty";
  return null;
}

export function createOperationsPlan(repoRoot, mode, probes = {}) {
  if (!Object.hasOwn(MODE_PROFILE, mode)) throw new Error(`Unsupported operations mode: ${mode}`);
  const composePath = join(repoRoot, "deploy/compose/operations/compose.yaml");
  const compose = YAML.parse(readFileSync(composePath, "utf8"));
  const profilePath = join(repoRoot, "deploy/resources/laptop-32-ops-lite.yaml");
  const profile = createValidator(repoRoot)(readYaml(profilePath), profilePath);
  const selectedProfile = MODE_PROFILE[mode];
  const services = Object.entries(compose.services).filter(([, service]) => {
    const profiles = service.profiles ?? [];
    return profiles.length === 0 || profiles.includes(selectedProfile);
  }).map(([id, service]) => ({
    id, image: service.image, profiles: service.profiles ?? [], memoryMiB: memoryMiB(service.mem_limit), cpu: Number(service.cpus),
  }));
  const memory = services.reduce((total, service) => total + service.memoryMiB, 0);
  const cpu = Number(services.reduce((total, service) => total + service.cpu, 0).toFixed(2));
  const blockers = [];
  if ((compose["x-athyper"]?.["incomplete-modes"] ?? []).includes(mode)) {
    blockers.push(`${mode} remains design-only until its dedicated database/cache identities and secret-loading contract are composed.`);
  }
  if (memory > profile.spec.maxContainerMemoryMiB) blockers.push(`Operations mode requires ${memory} MiB; profile permits ${profile.spec.maxContainerMemoryMiB} MiB.`);
  if (cpu > profile.spec.maxContainerCpu) blockers.push(`Operations mode requires ${cpu} CPU; profile permits ${profile.spec.maxContainerCpu}.`);
  const secretPath = join(probes.runtimeRoot ?? runtimeRoot(), "operations", "secrets", "grafana-admin-password");
  const problem = (probes.secretProblem ?? secretProblem)(secretPath);
  if (problem) blockers.push(`Operations secret file ${problem}: grafana-admin-password.`);
  const live = (probes.liveProject ?? (() => runReadOnly("docker", ["ps", "-aq", "--filter", "label=com.docker.compose.project=athyper-operations"]).stdout))();
  if (live && !probes.owned) blockers.push("Compose project athyper-operations already exists without an operations ownership receipt.");
  return {
    apiVersion: "athyper.io/v1alpha1", kind: "OperationsPlan",
    readOnly: true, executionAuthorized: false,
    status: blockers.length ? "blocked" : "ready-for-explicit-authorization",
    project: "athyper-operations", mode, resourceProfile: profile.metadata.id,
    composeFile: composePath, composeProfiles: selectedProfile ? [selectedProfile] : [],
    services, resources: { memoryMiB: memory, limitMemoryMiB: profile.spec.maxContainerMemoryMiB, cpu, limitCpu: profile.spec.maxContainerCpu },
    concurrencyPolicy: {
      exactlyOneMode: true,
      fullObservabilityProhibited: true,
      simultaneousMonitoringModesProhibited: true,
      allowedModes: Object.keys(MODE_PROFILE),
    },
    blockers,
    actions: ["No action: this command only validates the selected operations mode."],
  };
}
