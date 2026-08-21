import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadModel } from "./model.mjs";
import { readYaml } from "./io.mjs";
import { createValidator } from "./schema.mjs";

function yamlFiles(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? yamlFiles(path) : (/\.ya?ml$/u.test(name) ? [path] : []);
  });
}

function legacyServiceIds(repoRoot) {
  const ids = new Set();
  for (const path of yamlFiles(join(repoRoot, "stack", "compose"))) {
    const document = readYaml(path);
    for (const id of Object.keys(document?.services ?? {})) ids.add(id);
  }
  return [...ids].sort();
}

export function inspectCatalog(repoRoot) {
  const validate = createValidator(repoRoot);
  const model = loadModel(repoRoot, "dev");
  const workloadPath = join(repoRoot, "deploy", "catalog", "workload-sets.yaml");
  const workloadCatalog = validate(readYaml(workloadPath), workloadPath);
  const legacy = legacyServiceIds(repoRoot);
  const resolved = model.services.filter((service) => service.ledger === "resolved-v1").map((service) => service.id).sort();
  const assigned = workloadCatalog.sets.flatMap((set) => set.services);
  const assignmentCounts = assigned.reduce((counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1), new Map());
  const blockers = [];
  const missingFromCatalog = legacy.filter((id) => !resolved.includes(id));
  const absentFromLegacy = resolved.filter((id) => !legacy.includes(id));
  const missingDisposition = resolved.filter((id) => !assignmentCounts.has(id));
  const duplicateDisposition = [...assignmentCounts].filter(([, count]) => count > 1).map(([id]) => id).sort();
  const unknownDisposition = [...assignmentCounts.keys()].filter((id) => !resolved.includes(id)).sort();
  if (missingFromCatalog.length) blockers.push(`Legacy services missing from the v2 catalog: ${missingFromCatalog.join(", ")}.`);
  if (absentFromLegacy.length) blockers.push(`resolved-v1 catalog services absent from stack/: ${absentFromLegacy.join(", ")}.`);
  if (missingDisposition.length) blockers.push(`Resolved services missing a workload-set disposition: ${missingDisposition.join(", ")}.`);
  if (duplicateDisposition.length) blockers.push(`Services assigned to multiple workload sets: ${duplicateDisposition.join(", ")}.`);
  if (unknownDisposition.length) blockers.push(`Workload sets reference unknown resolved services: ${unknownDisposition.join(", ")}.`);
  for (const set of workloadCatalog.sets) {
    if (["partial", "design-required"].includes(set.implementation)) blockers.push(`Workload set ${set.id} is ${set.implementation}.`);
  }
  return {
    apiVersion: "athyper.io/v1alpha1", kind: "CatalogReconciliation",
    status: blockers.length ? "implementation-in-progress" : "complete",
    counts: {
      legacyServices: legacy.length,
      resolvedCatalogServices: resolved.length,
      presetSelectedDevServices: model.selected.filter((service) => service.ledger === "resolved-v1").length,
      remainingLegacyServices: resolved.filter((id) => !model.selected.some((service) => service.id === id)).length,
    },
    inventory: { missingFromCatalog, absentFromLegacy, missingDisposition, duplicateDisposition, unknownDisposition },
    workloadSets: workloadCatalog.sets.map((set) => ({
      id: set.id, placement: set.placement, activation: set.activation,
      implementation: set.implementation, serviceCount: set.services.length,
      hostProfiles: set.hostProfiles, services: set.services, rationale: set.rationale,
    })),
    blockers,
  };
}
