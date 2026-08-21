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
  const composeModel = {
    ...baseModel,
    services: { ...baseModel.services, ...parityModel.services, ...optionalModel.services },
    networks: { ...baseModel.networks, ...parityModel.networks },
    volumes: { ...baseModel.volumes, ...parityModel.volumes, ...optionalModel.volumes },
    secrets: { ...baseModel.secrets, ...parityModel.secrets, ...optionalModel.secrets },
  };
  const defaultImage = (value) => String(value).match(/^\$\{[A-Z0-9_]+:-(.+)\}$/u)?.[1] ?? value;
  const forbidden = [
    [/^\s*name\s*:/mu, "top-level/fixed name"],
    [/\bcontainer_name\s*:/u, "container_name"],
    [/\bexternal\s*:\s*true/u, "undocumented external resource"],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(`${compose}\n${parity}\n${optional}`)) errors.push(`${composePath}: forbidden ${label}`);
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
  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "PolicyReport",
    readOnly: true,
    status: errors.length ? "fail" : "pass",
    validatedInstances: instances.map(({ document }) => document.metadata.id),
    errors,
  };
}
