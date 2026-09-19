import { join } from "node:path";
import { loadModel } from "./model.mjs";
import { readYaml } from "./io.mjs";
import { createValidator } from "./schema.mjs";

export function inspectCatalog(repoRoot, dependencies = {}) {
  const validate = createValidator(repoRoot);
  const model = loadModel(repoRoot, "dev");
  const workloadPath = join(repoRoot, "deploy", "catalog", "workload-sets.yaml");
  let workloadCatalog;
  let catalogError;
  try { workloadCatalog = validate((dependencies.readYaml ?? readYaml)(workloadPath), workloadPath); } catch (error) {
    catalogError = `Workload-set catalog is invalid: ${error.message}.`;
    workloadCatalog = { sets: [] };
  }
  const resolved = model.services.filter((service) => service.ledger === "v2-native").map((service) => service.id).sort();
  const assigned = workloadCatalog.sets.flatMap((set) => set.services);
  const assignmentCounts = assigned.reduce((counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1), new Map());
  const blockers = catalogError ? [catalogError] : [];
  const missingDisposition = resolved.filter((id) => !assignmentCounts.has(id));
  const duplicateDisposition = [...assignmentCounts].filter(([, count]) => count > 1).map(([id]) => id).sort();
  const unknownDisposition = [...assignmentCounts.keys()].filter((id) => !resolved.includes(id)).sort();
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
      v2NativeServices: resolved.length,
      presetSelectedDevServices: model.selected.filter((service) => service.ledger === "v2-native").length,
      optionalV2NativeServices: resolved.filter((id) => !model.selected.some((service) => service.id === id)).length,
    },
    inventory: { missingDisposition, duplicateDisposition, unknownDisposition },
    workloadSets: workloadCatalog.sets.map((set) => ({
      id: set.id, placement: set.placement, activation: set.activation,
      implementation: set.implementation, serviceCount: set.services.length,
      hostProfiles: set.hostProfiles, services: set.services, rationale: set.rationale,
    })),
    blockers,
  };
}
