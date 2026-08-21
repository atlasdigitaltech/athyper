import { join } from "node:path";
import { readFileSync } from "node:fs";
import YAML from "yaml";
import { readYaml } from "./io.mjs";
import { loadInstanceTemplates, loadModel } from "./model.mjs";

export function checkPolicy(repoRoot) {
  const errors = [];
  const instances = loadInstanceTemplates(repoRoot);
  for (const { document } of instances) loadModel(repoRoot, document.metadata.id);

  const composePath = join(repoRoot, "deploy/compose/instance/compose.yaml");
  const compose = readFileSync(composePath, "utf8");
  const parityPath = join(repoRoot, "deploy/compose/instance/compose.parity.yaml");
  const parity = readFileSync(parityPath, "utf8");
  const optionalPath = join(repoRoot, "deploy/compose/instance/compose.optional.yaml");
  const optional = readFileSync(optionalPath, "utf8");
  const baseModel = readYaml(composePath);
  const parityModel = YAML.parse(parity, { merge: true });
  const optionalModel = YAML.parse(optional, { merge: true });
  const platformPath = join(repoRoot, "deploy/compose/platform/compose.yaml");
  const platform = readFileSync(platformPath, "utf8");
  const platformModel = readYaml(platformPath);
  const operationsPath = join(repoRoot, "deploy/compose/operations/compose.yaml");
  const operations = readFileSync(operationsPath, "utf8");
  const operationsModel = YAML.parse(operations);
  const operationsProfilePath = join(repoRoot, "deploy/resources/laptop-32-ops-lite.yaml");
  const operationsProfile = readYaml(operationsProfilePath);
  const composeModel = {
    ...baseModel,
    services: { ...baseModel.services, ...parityModel.services, ...optionalModel.services },
    networks: { ...baseModel.networks, ...parityModel.networks },
    volumes: { ...baseModel.volumes, ...parityModel.volumes, ...optionalModel.volumes },
    secrets: { ...baseModel.secrets, ...parityModel.secrets, ...optionalModel.secrets },
  };
  const defaultImage = (value) => String(value).match(/^\$\{[A-Z0-9_]+:-(.+)\}$/u)?.[1] ?? value;
  const forbidden = [
    [/\bcontainer_name\s*:/u, "container_name"],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(`${compose}\n${parity}\n${optional}`)) errors.push(`${composePath}: forbidden ${label}`);
  }
  for (const [source, document] of [[composePath, baseModel], [parityPath, parityModel], [optionalPath, optionalModel]]) {
    if (document.name) errors.push(`${source}: forbidden top-level/fixed name`);
  }
  const requiredCore = [
    "gateway", "gateway-outage", "db", "db-init", "dbpool-apps",
    "dbpool-session", "memorycache", "objectstorage", "objectstorage-init", "iam",
  ];
  for (const id of requiredCore) {
    if (!composeModel.services?.[id]) errors.push(`${composePath}: missing DEV core service ${id}`);
  }
  const validateCatalogService = (selected, scope) => {
    const service = composeModel.services?.[selected.id];
    if (!service) {
      errors.push(`${composePath}: selected ${scope} service ${selected.id} is not composed`);
    } else if (defaultImage(service.image) !== selected.image) {
      errors.push(`${composePath}: ${selected.id} image differs from the service catalog`);
    } else {
      const mountedSecrets = (service.secrets ?? []).map((secret) => (
        typeof secret === "string" ? secret : secret.source
      )).sort();
      const declaredSecrets = [...selected.secrets].sort();
      if (JSON.stringify(mountedSecrets) !== JSON.stringify(declaredSecrets)) {
        errors.push(`${composePath}: ${selected.id} mounted secrets differ from the service catalog`);
      }
      if (service.mem_limit !== `${selected.resources.memoryMiB}m`) {
        errors.push(`${composePath}: ${selected.id} memory limit differs from the resource catalog`);
      }
      if (Number(service.cpus) !== selected.resources.cpu) {
        errors.push(`${composePath}: ${selected.id} CPU limit differs from the resource catalog`);
      }
    }
  };
  for (const instanceId of ["dev", "qa", "stg"]) {
    const instanceModel = loadModel(repoRoot, instanceId);
    for (const selected of instanceModel.selected) {
      validateCatalogService(selected, instanceId.toUpperCase());
    }
  }
  const optionalProfiles = new Set(["observability", "secretstore", "analytics", "admin-db", "admin-queue"]);
  const catalogServices = loadModel(repoRoot, "dev").services;
  for (const selected of catalogServices.filter((service) => service.profiles.some((profile) => optionalProfiles.has(profile)))) {
    validateCatalogService(selected, "optional");
  }
  if (composeModel.networks?.data?.internal !== true) {
    errors.push(`${composePath}: data network must be internal`);
  }
  for (const [id, service] of Object.entries(composeModel.services ?? {})) {
    if (service.privileged === true) errors.push(`${composePath}: ${id} is privileged`);
    if (service.network_mode === "host") errors.push(`${composePath}: ${id} uses host networking`);
    if ((service.volumes ?? []).some((volume) => String(volume).includes("docker.sock"))) {
      errors.push(`${composePath}: ${id} mounts the Docker socket`);
    }
    if (!(service.security_opt ?? []).includes("no-new-privileges:true")) {
      errors.push(`${composePath}: ${id} must set no-new-privileges`);
    }
    for (const port of service.ports ?? []) {
      if (!/^(127\.0\.0\.1:|\$\{ATHYPER_[A-Z_]+:-127\.0\.0\.1:)/u.test(String(port))) {
        errors.push(`${composePath}: ${id} publishes a non-loopback port`);
      }
    }
  }
  for (const [id, network] of Object.entries(composeModel.networks ?? {})) {
    if (network?.external === true && !(id === "platform-ingress" && network.name === "athyper-platform-ingress")) {
      errors.push(`${composePath}: ${id} is an undocumented external network`);
    }
    if (network?.name && id !== "platform-ingress") {
      errors.push(`${composePath}: ${id} explicitly names a normal instance network`);
    }
  }
  for (const [id, volume] of Object.entries(composeModel.volumes ?? {})) {
    if (volume?.name) errors.push(`${composePath}: ${id} explicitly names a normal instance volume`);
    if (volume?.external === true) errors.push(`${composePath}: ${id} is an undocumented external volume`);
  }
  const gateway = composeModel.services?.gateway;
  if ((gateway?.ports ?? []).length > 0) errors.push(`${composePath}: instance gateway must not publish host ports`);
  if (!gateway?.networks?.["platform-ingress"]) {
    errors.push(`${composePath}: instance gateway must join platform-ingress`);
  }
  const platformIngress = platformModel.services?.ingress;
  if (!platformIngress) errors.push(`${platformPath}: missing outer ingress service`);
  if (platformModel.networks?.["platform-ingress"]?.name !== "athyper-platform-ingress") {
    errors.push(`${platformPath}: shared ingress network name is not canonical`);
  }
  const platformPorts = (platformIngress?.ports ?? []).map(String).sort();
  if (JSON.stringify(platformPorts) !== JSON.stringify(["127.0.0.1:443:8443", "127.0.0.1:80:8080"])) {
    errors.push(`${platformPath}: outer ingress must be the sole loopback owner of ports 80 and 443`);
  }
  if (platform.includes("docker.sock")) errors.push(`${platformPath}: outer ingress mounts the Docker socket`);
  if (operationsModel.name !== "athyper-operations") errors.push(`${operationsPath}: project name must be athyper-operations`);
  if (operations.includes("docker.sock") || /discovery\.docker/u.test(operations)) {
    errors.push(`${operationsPath}: operations-lite must use push-based collection without Docker discovery`);
  }
  if (operationsModel.networks?.operations?.internal !== true) errors.push(`${operationsPath}: operations network must be internal`);
  const requiredOperations = ["metrics", "logging", "alertmanager", "logshipper", "telemetry", "tracing", "statuswatch"];
  for (const id of requiredOperations) if (!operationsModel.services?.[id]) errors.push(`${operationsPath}: missing operations service ${id}`);
  for (const [id, service] of Object.entries(operationsModel.services ?? {})) {
    if ((service.profiles ?? []).length > 1) errors.push(`${operationsPath}: ${id} belongs to multiple concurrent profiles`);
    if ((service.profiles ?? []).length && service.restart !== "no") errors.push(`${operationsPath}: on-demand service ${id} must use restart: no`);
    for (const port of service.ports ?? []) {
      if (!String(port).startsWith("127.0.0.1:")) errors.push(`${operationsPath}: ${id} publishes a non-loopback port`);
    }
  }
  const allowedProfiles = new Set(["tracing", "monitor-status"]);
  for (const service of Object.values(operationsModel.services ?? {})) {
    for (const profile of service.profiles ?? []) if (!allowedProfiles.has(profile)) errors.push(`${operationsPath}: unsupported operations profile ${profile}`);
  }
  const baseServices = Object.values(operationsModel.services ?? {}).filter((service) => !(service.profiles ?? []).length);
  for (const profile of [null, "tracing", "monitor-status"]) {
    const selected = [...baseServices, ...Object.values(operationsModel.services ?? {}).filter((service) => profile && (service.profiles ?? []).includes(profile))];
    const memory = selected.reduce((total, service) => total + Number(String(service.mem_limit).replace(/m$/u, "")), 0);
    const cpu = selected.reduce((total, service) => total + Number(service.cpus), 0);
    if (memory > operationsProfile.spec.maxContainerMemoryMiB || cpu > operationsProfile.spec.maxContainerCpu) {
      errors.push(`${operationsPath}: operations mode ${profile ?? "lite"} exceeds laptop-32-ops-lite`);
    }
  }
  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "PolicyReport",
    readOnly: true,
    status: errors.length ? "fail" : "pass",
    validatedInstances: instances.map(({ document }) => document.metadata.id),
    errors,
  };
}
