import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { createValidator } from "./schema.mjs";
import { listYaml, readYaml } from "./io.mjs";

function checkedRead(path, validate) {
  if (!existsSync(path)) throw new Error(`Required configuration not found: ${path}`);
  return validate(readYaml(path), path);
}

export function loadModel(repoRoot, instanceId) {
  const validate = createValidator(repoRoot);
  const instancePath = join(repoRoot, "deploy/instances/templates", `${instanceId}.yaml`);
  const instance = checkedRead(instancePath, validate);
  const resourcePath = join(repoRoot, "deploy/resources", `${instance.spec.hostProfile}.yaml`);
  const resources = checkedRead(resourcePath, validate);
  const imageSetPath = join(repoRoot, "deploy", instance.spec.imageSet);
  const imageSet = checkedRead(imageSetPath, validate);
  const providerPath = join(repoRoot, "deploy/providers/catalog.yaml");
  const providers = checkedRead(providerPath, validate);
  for (const [id, mode] of Object.entries(instance.spec.providers)) {
    const contract = providers.providers[id];
    if (!contract) throw new Error(`${instancePath}: provider ${id} has no catalog contract`);
    if (!contract.allowedModes.includes(mode)) {
      throw new Error(`${instancePath}: provider ${id} does not allow mode ${mode}`);
    }
  }
  const catalogFiles = listYaml(join(repoRoot, "deploy/catalog"));
  const catalogs = catalogFiles.map((path) => checkedRead(path, validate));
  const services = catalogs.filter((catalog) => catalog.kind === "ServiceCatalog")
    .flatMap((catalog) => catalog.services);
  const selected = services
    .filter((service) => service.presets.includes(instance.spec.preset))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    repoRoot,
    instancePath,
    resourcePath,
    imageSetPath,
    providerPath,
    catalogFiles,
    instance,
    resources,
    imageSet,
    providers,
    services,
    selected,
  };
}

export function loadInstanceTemplates(repoRoot) {
  const validate = createValidator(repoRoot);
  return listYaml(join(repoRoot, "deploy/instances/templates")).map((path) => ({
    path,
    name: basename(path),
    document: checkedRead(path, validate),
  }));
}
