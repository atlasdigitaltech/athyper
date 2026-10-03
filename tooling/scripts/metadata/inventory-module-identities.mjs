/** Read-only local registry inventory and review plan. No registry/release writes. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { discoverWorkspace } from "./source-workspace.mjs";

export function assessRegistry(products, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.entities) || !Array.isArray(snapshot.modules)) throw Error("Registry snapshot incomplete");
  return products.map(product => {
    const rows = snapshot.entities.filter(row => row.entityCode === product.entityCode);
    const module = snapshot.modules.find(row => row.code === product.moduleCode);
    let disposition;
    if (rows.length > 1) disposition = "ambiguous_identity_blocked";
    else if (!rows.length) disposition = module?.status === "active" ? "unregistered" : "unregistered_module_unavailable";
    else if (rows[0].entityClass !== product.entityClass || rows[0].ownershipModel !== product.ownershipModel || !["draft", "active"].includes(rows[0].status)) disposition = "identity_conflict_blocked";
    else if (rows[0].moduleCode !== product.moduleCode) disposition = module?.status === "active" ? "module_correction_required" : "module_correction_target_unavailable";
    else disposition = "module_matches";
    return { ...product, disposition, targetModule: module ?? null, registryRows: rows,
      successorPreparation: rows.length === 1 && rows[0].releases?.length ? "capture_pinned_source_graph_and_target_activation_heads" : "no_source_release_evidence",
      approval: "Platform Admin authors; independent Platform Owner reviews; unsigned preparation is not approval",
    };
  });
}

export function inventoryQuery(authoringAvailable = true) {
  const entities = authoringAvailable ? `coalesce((SELECT json_agg(json_build_object(
   'id',e.id,'entityCode',e.entity_code,'entityClass',e.entity_class,
   'ownershipModel',e.ownership_model,'status',e.status,'moduleId',e.module_id,'moduleCode',m.code,
   'baseline', (SELECT json_build_object('releaseId',r.id,'releaseNo',r.release_no,'releaseHash',r.release_hash,
     'contractHash',r.contract_hash,'revisionId',r.revision_id,'validationStatus',s.validation_status,
     'revisionContractHash',s.contract_hash,'snapshotHashVerified',s.contract_hash=snapshot.fn_compute_entity_contract_hash(s.contract_json),
     'hashScheme','postgres_jsonb_text_sha256','graph',s.contract_json)
     FROM metadata.entity_release r JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.entity_id=e.id
     WHERE r.entity_id=e.id AND r.tenant_id IS NULL ORDER BY r.release_no DESC LIMIT 1),
   'releases',coalesce((SELECT json_agg(json_build_object('id',r.id,'releaseNo',r.release_no,
     'releaseHash',r.release_hash,'contractHash',r.contract_hash,'changeSetId',r.change_set_id,
     'supersedesReleaseId',r.supersedes_release_id,'targetPlanes',r.target_planes)
     ORDER BY r.release_no) FROM metadata.entity_release r WHERE r.entity_id=e.id AND r.tenant_id IS NULL),'[]'::json))
   ORDER BY e.entity_code,e.id)
   FROM metadata.entity e LEFT JOIN control.module m ON m.id=e.module_id
   WHERE e.tenant_id IS NULL AND e.entity_code IN (SELECT jsonb_array_elements_text(:'entity_codes'::jsonb))),'[]'::json)` : `'[]'::json`;
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT json_build_object(
 'database',current_database(), 'capturedAt',clock_timestamp(),
 'authoringRegistryAvailable',${authoringAvailable ? "true" : "false"},
 'entities',${entities},
 'modules',coalesce((SELECT json_agg(json_build_object('id',m.id,'code',m.code,'status',m.status) ORDER BY m.code)
   FROM control.module m WHERE m.code IN (SELECT jsonb_array_elements_text(:'module_codes'::jsonb))),'[]'::json)
);
ROLLBACK;`;
}

export function main(args = process.argv.slice(2)) {
  const output = args[args.indexOf("--output") + 1];
  const container = args[args.indexOf("--container") + 1];
  if (!args.includes("--output") || !args.includes("--container") || !output || !container || args.length !== 4) throw Error("Usage: --container <local-postgres-container> --output <review-json>");
  const workspace = discoverWorkspace();
  const products = [...workspace.entities.values()].filter(entity => entity.descriptor.definition).map(entity => {
    const path = workspace.resolveRef(`${entity.entityCode}/${entity.descriptor.definition}`);
    const bytes = readFileSync(path);
    const source = JSON.parse(bytes);
    return { entityCode: entity.entityCode, moduleCode: source.moduleCode,
      entityClass: entity.descriptor.entityClass, ownershipModel: entity.descriptor.ownershipModel,
      declaredPlanes: source.planes, sourceRef: `${entity.entityCode}/${entity.descriptor.definition}`,
      sourceByteHash: createHash("sha256").update(bytes).digest("hex") };
  });
  const registries = [];
  for (const plane of ["studio", "neon", "mesh"]) {
    const command = ["exec", "-i", "-u", "postgres", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", `entity_codes=${JSON.stringify(products.map(p => p.entityCode))}`, "-v", `module_codes=${JSON.stringify([...new Set(products.map(p => p.moduleCode))])}`, "-d", `athyper_${plane}`];
    const availability = JSON.parse(execFileSync("docker", command, { input: "BEGIN READ ONLY; SELECT json_build_object('entity',to_regclass('metadata.entity') IS NOT NULL,'release',to_regclass('metadata.entity_release') IS NOT NULL); ROLLBACK;", encoding: "utf8", timeout: 45000 }).trim());
    if (availability.entity !== availability.release) throw Error(`Incomplete authoring registry on ${plane}`);
    const stdout = execFileSync("docker", command, { input: inventoryQuery(availability.entity), encoding: "utf8", timeout: 45000 });
    const snapshot = JSON.parse(stdout.trim());
    if (snapshot.database !== `athyper_${plane}`) throw Error("Registry database identity mismatch");
    registries.push({ plane, scope: "local_development_platform_owned_rows", snapshot,
      products: availability.entity ? assessRegistry(products, snapshot) : products.map(product => ({ ...product, disposition: "authoring_registry_not_hosted", targetModule: snapshot.modules.find(module => module.code === product.moduleCode) ?? null })) });
  }
  const report = { schema: "athyper.module-identity-review/1", status: "unsigned_review_only", purpose: "Finite source-derived module identity correction inventory; local plane scope only; no grants, activation or immutable evidence edits", publicationVerified: false, registries };
  writeFileSync(resolve(output), JSON.stringify(report, null, 2) + "\n");
  for (const registry of registries) {
    const counts = {};
    for (const product of registry.products) counts[product.disposition] = (counts[product.disposition] ?? 0) + 1;
    console.log(`${registry.snapshot.database}: ${JSON.stringify(counts)}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
