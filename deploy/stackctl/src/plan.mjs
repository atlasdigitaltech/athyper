import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RELEASE_MODES } from "./constants.mjs";
import { loadInstanceTemplates, loadModel } from "./model.mjs";
import { runReadOnly, runtimeRoot } from "./io.mjs";
import { qualificationGateFailures } from "./qualification.mjs";

const PUBLISHED_IMAGE_IDS = ["iam", "mesh-web", "neon-web", "runtime-server", "studio-web"];
const PARITY_PRESETS = new Set(["dev-full", "qa-standard", "stg-standard", "validation-full"]);

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function staticCollisionChecks(repoRoot) {
  const templates = loadInstanceTemplates(repoRoot).map(({ document }) => document);
  const debugPorts = templates.flatMap((item) => Object.values(item.spec.debugPorts ?? {}));
  return {
    ids: duplicates(templates.map((item) => item.metadata.id)),
    projects: duplicates(templates.map((item) => item.spec.composeProject)),
    domains: duplicates(templates.map((item) => item.spec.domainSuffix)),
    debugPorts: duplicates(debugPorts),
  };
}

function liveProjectObjects(project) {
  const commands = {
    containers: ["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`],
    networks: ["network", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`],
    volumes: ["volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`],
  };
  return Object.fromEntries(Object.entries(commands).map(([kind, args]) => {
    const result = runReadOnly("docker", args);
    return [kind, result.ok && result.stdout ? result.stdout.split(/\r?\n/u).filter(Boolean).sort() : []];
  }));
}

function secretProblem(path) {
  if (!existsSync(path)) return "is absent";
  const stat = statSync(path);
  if (!stat.isFile()) return "is not a regular file";
  if ((stat.mode & 0o077) !== 0) return "is readable by group or others";
  const value = readFileSync(path, "utf8").trim();
  if (!value) return "is empty";
  if (/^(changeme|placeholder|example|todo|replace-me|<.+>)$/iu.test(value)) return "contains a placeholder";
  return null;
}

function listeningPorts() {
  const result = runReadOnly("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort",
  ], { timeout: 12_000 });
  return new Set(result.ok ? result.stdout.split(/\s+/u).map(Number).filter(Number.isInteger) : []);
}

export function renderConfig(repoRoot, instanceId) {
  const model = loadModel(repoRoot, instanceId);
  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "RenderedInstance",
    metadata: {
      id: model.instance.metadata.id,
      source: model.instancePath,
    },
    spec: {
      ...model.instance.spec,
      resourceEnvelope: model.resources.spec,
      imageSet: model.imageSet,
      providerContracts: Object.fromEntries(Object.entries(model.instance.spec.providers).map(([id, mode]) => [
        id,
        { mode, ...model.providers.providers[id] },
      ])),
      services: model.selected,
    },
  };
}

export function createPlan(repoRoot, instanceId) {
  const model = loadModel(repoRoot, instanceId);
  const instance = model.instance;
  const collisions = staticCollisionChecks(repoRoot);
  const memoryMiB = model.selected.reduce((total, service) => total + service.resources.memoryMiB, 0);
  const cpu = model.selected.reduce((total, service) => total + service.resources.cpu, 0);
  const blockers = [];
  const qualification = qualificationGateFailures();
  for (const failure of qualification.failures) blockers.push(`Host qualification gate incomplete: ${failure}`);
  for (const [kind, values] of Object.entries(collisions)) {
    if (values.length) blockers.push(`Template ${kind} collide: ${values.join(", ")}`);
  }
  if (memoryMiB > model.resources.spec.maxContainerMemoryMiB) {
    blockers.push(`Preset requires ${memoryMiB} MiB; host profile permits ${model.resources.spec.maxContainerMemoryMiB} MiB.`);
  }
  if (cpu > model.resources.spec.maxContainerCpu) {
    blockers.push(`Preset requires ${cpu} CPU; host profile permits ${model.resources.spec.maxContainerCpu}.`);
  }
  if (RELEASE_MODES.has(instance.spec.mode)) {
    const imageIds = model.imageSet.spec.images.map(({ id }) => id);
    for (const id of PUBLISHED_IMAGE_IDS) {
      if (!imageIds.includes(id)) blockers.push(`Release image set is incomplete: ${id} is absent.`);
    }
    if (/^0{40}$/u.test(model.imageSet.spec.sourceRevision)) {
      blockers.push("Release image set source revision is an all-zero placeholder.");
    }
    for (const image of model.imageSet.spec.images) {
      if (!/@sha256:[a-f0-9]{64}$/u.test(image.reference)) blockers.push(`Release image is mutable: ${image.id}`);
      if (/@sha256:0{64}$/u.test(image.reference)) blockers.push(`Release image digest is an all-zero placeholder: ${image.id}`);
    }
  }

  const requiredSecrets = [...new Set(model.selected.flatMap((service) => service.secrets ?? []))].sort();
  const secretProblems = requiredSecrets.map((secret) => ({
    secret,
    problem: secretProblem(join(runtimeRoot(), "instances", instanceId, "secrets", secret)),
  })).filter(({ problem }) => problem);
  for (const { secret, problem } of secretProblems) blockers.push(`Required secret file ${problem}: ${secret}`);
  const occupiedPorts = listeningPorts();
  for (const [name, binding] of Object.entries(instance.spec.debugPorts ?? {})) {
    const port = Number(binding.slice(binding.lastIndexOf(":") + 1));
    if (occupiedPorts.has(port)) blockers.push(`Debug port ${binding} for ${name} is already listening.`);
  }
  const live = liveProjectObjects(instance.spec.composeProject);
  if (Object.values(live).some((values) => values.length)) {
    blockers.push(`Compose project ${instance.spec.composeProject} already owns Docker resources; adopt it with a receipt or choose another ID.`);
  }

  const ingressServices = ["api", "iam", "mesh", "neon", "studio"];
  if (instance.spec.mode === "development" && model.selected.some((service) => service.id === "mailtrap")) ingressServices.push("mail");
  const domains = ingressServices.map((service) => `${service}.${instance.spec.domainSuffix}`);
  const imageOverrides = new Map(model.imageSet.spec.images.map(({ id, reference }) => [id, reference]));
  const publishedImageId = (serviceId) => (
    ["api", "worker", "scheduler", "db-migration"].includes(serviceId) ? "runtime-server" : serviceId
  );
  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "DeploymentPlan",
    metadata: { instance: instanceId },
    readOnly: true,
    status: blockers.length ? "blocked" : "ready",
    blockers,
    deferredPreflights: [
      "Resolve every image reference to an immutable digest and verify registry access.",
      "Render Compose with the approved runtime root and validate all secret mounts.",
      "Capture a backup immediately before the first database migration.",
      "Require every long-running service health check before publishing host routes.",
    ],
    project: instance.spec.composeProject,
    preset: instance.spec.preset,
    hostProfile: instance.spec.hostProfile,
    sources: {
      instance: model.instancePath,
      resourceProfile: model.resourcePath,
      imageSet: model.imageSetPath,
      providers: model.providerPath,
      catalogs: model.catalogFiles,
      compose: [
        join(repoRoot, "deploy/compose/instance/compose.yaml"),
        ...(PARITY_PRESETS.has(instance.spec.preset)
          ? [join(repoRoot, "deploy/compose/instance/compose.parity.yaml")]
          : []),
      ],
      qualification: qualification.path,
    },
    services: model.selected.map((service) => ({
      id: service.id,
      lifecycle: service.lifecycle,
      image: imageOverrides.get(publishedImageId(service.id)) ?? service.image,
      profiles: service.profiles,
      resources: service.resources,
    })),
    resources: { memoryMiB, cpu: Number(cpu.toFixed(2)), limitMemoryMiB: model.resources.spec.maxContainerMemoryMiB, limitCpu: model.resources.spec.maxContainerCpu },
    networks: ["edge", "app", "data", "ops"].map((name) => `${instance.spec.composeProject}_${name}`),
    volumes: model.selected.filter((service) => service.stateful).map((service) => `${instance.spec.composeProject}_${service.id}-data`).sort(),
    debugPorts: instance.spec.debugPorts ?? {},
    domains,
    hostMappings: domains.map((domain) => `127.0.0.1 ${domain}`),
    requiredSecrets,
    liveProjectObjects: live,
    actions: ["No action: this command only validates and reports."],
  };
}
