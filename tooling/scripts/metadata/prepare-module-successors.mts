/** Prepare unsigned review inputs; never import, update registries or publish. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { discoverWorkspace } from "./source-workspace.mjs";
import { loadReferenceProduct } from "../../../server/db/scripts/provisioning/prepare-reference-runtime.js";
import { parseTableEntityProduct } from "../../../server/packages/planes/studio/meta-entity-authoring/src/authoring/table-product.js";
import { compileGraph, sha256 } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";

const [inventoryPath, outputPath] = process.argv.slice(2);
if (!inventoryPath || !outputPath || process.argv.length !== 4) throw Error("Usage: <inventory-json> <unsigned-review-output-json>");
const inventoryBytes = readFileSync(resolve(inventoryPath));
const inventory = JSON.parse(inventoryBytes.toString());
if (inventory.schema !== "athyper.module-identity-review/1" || inventory.status !== "unsigned_review_only") throw Error("Unsupported module inventory");
const workspace = discoverWorkspace();
const plans = [];
for (const registry of inventory.registries.filter((entry: any) => entry.snapshot.authoringRegistryAvailable)) {
  for (const product of registry.products) {
    const row = product.registryRows.length === 1 ? product.registryRows[0] : undefined;
    const baseline = row?.baseline;
    const plan: Record<string, any> = {
      entityCode: product.entityCode, database: registry.snapshot.database, status: "blocked",
      sourceByteHash: product.sourceByteHash,
      registryCorrection: row ? { entityId: row.id, expectedModuleId: row.moduleId, expectedModuleCode: row.moduleCode,
        targetModuleId: product.targetModule?.id ?? null, targetModuleCode: product.moduleCode,
        entityClass: row.entityClass, ownershipModel: row.ownershipModel, expectedStatus: row.status,
        scope: "tenant_id IS NULL; exact entity/module identity; local development database only" } : null,
      predecessor: baseline ? { releaseId: baseline.releaseId, releaseNo: baseline.releaseNo, releaseHash: baseline.releaseHash, contractHash: baseline.contractHash, revisionId: baseline.revisionId } : null,
      review: { authorRole: "Platform Admin", independentReviewerRole: "Platform Owner", authorId: null, reviewerId: null, approval: null, signature: null },
      publicationPrerequisites: ["recheck registry and predecessor pins", "capture and verify active target heads and publication lineage", "governed atomic registry correction and successor enrollment", "independent human review and signature", "per-target verification and activation receipts"],
      blockers: [],
    };
    plans.push(plan);
    if (product.disposition !== "module_correction_required") {
      plan.blockers.push(product.disposition); continue;
    }
    try {
      if (!baseline || baseline.validationStatus !== "valid" || baseline.revisionContractHash !== baseline.contractHash || baseline.snapshotHashVerified !== true) throw Error("PINNED_VALID_BASELINE_REQUIRED");
      const source = workspace.entities.get(product.entityCode);
      if (!source?.descriptor.definition) throw Error("NATIVE_SOURCE_REQUIRED");
      const bytes = readFileSync(workspace.resolveRef(product.sourceRef));
      if (createHash("sha256").update(bytes).digest("hex") !== product.sourceByteHash) throw Error("SOURCE_CHANGED_SINCE_INVENTORY");
      const raw = JSON.parse(bytes.toString());
      const current = raw.schema === "athyper.shared-reference-product/1" ? loadReferenceProduct(source.directory) : parseTableEntityProduct(raw);
      const markerKey = raw.schema === "athyper.shared-reference-product/1" ? "systemReferenceProduct" : "tableEntityProduct";
      const graph = structuredClone(baseline.graph);
      const oldArtifact = compileGraph(graph);
      plan.baselineCompilerContractHash = oldArtifact.contractHash;
      plan.baselineRegistryHashScheme = baseline.hashScheme;
      const surfaces = (graph.surfaces ?? []).filter((surface: any) => surface.layoutConfig?.[markerKey]);
      if (surfaces.length !== 1) throw Error("EXACT_PRODUCT_MARKER_REQUIRED");
      const marker = surfaces[0].layoutConfig[markerKey];
      const previousProduct = { ...current, moduleCode: row.moduleCode };
      if (marker.moduleCode !== row.moduleCode || marker.productHash !== sha256(previousProduct)) throw Error("PREDECESSOR_PRODUCT_SOURCE_RECONCILIATION_REQUIRED");
      marker.moduleCode = current.moduleCode;
      marker.productHash = sha256(current);
      const artifact = compileGraph(graph);
      plan.status = "unsigned_candidate_prepared";
      plan.successor = { releaseNo: baseline.releaseNo + 1, supersedesReleaseId: baseline.releaseId,
        sourceProductHash: sha256(current), contractHash: artifact.contractHash, descriptorHash: artifact.descriptorHash,
        graph, artifact, targetPlanes: current.planes, approved: false, published: false };
    } catch (error) { plan.blockers.push(error instanceof Error ? error.message : String(error)); }
  }
}
writeFileSync(resolve(outputPath), JSON.stringify({ schema: "athyper.module-successor-review/1", status: "unsigned_review_only",
  inventoryByteHash: createHash("sha256").update(inventoryBytes).digest("hex"), plans }, null, 2) + "\n");
for (const plan of plans) console.log(`${plan.entityCode}: ${plan.status}${plan.blockers.length ? ` (${plan.blockers.join(", ")})` : ""}`);
