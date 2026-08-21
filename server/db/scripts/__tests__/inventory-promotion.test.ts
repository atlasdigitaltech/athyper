import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalCatalogV2 } from "../seed/canonical-catalog-v2-model.js";
import { compileInventoryPromotion, type InventoryPromotionQualificationContract, type ReviewedInventory } from "../seed/inventory-promotion-model.js";

const operation = {
  entityCode:"invoice",operationKey:"approve",permissionCode:"neon.finance.invoice.approve",permissionKind:"entity_operation",
  storageRoot:"document.invoice",requiredScopeKinds:["resource"],scopeCoordinateKeys:{resource:"invoiceId"},
  riskTier:"high",requiresMfa:true,requiresSod:true,serviceOwner:"@athyper/svc-finance",
};
const inventory:ReviewedInventory={plane:"neon",tables:[{table:"document.invoice",classification:"aggregate_root",writerKind:"user_service",writerOwner:"@athyper/svc-finance",requiredScopeKinds:["resource"]}],operations:[operation],lifecycles:[{entityCode:"invoice",transitions:[{code:"approve",permissionCode:operation.permissionCode}]}]};
const approved:InventoryPromotionQualificationContract={contractVersion:"athyper.authorization.inventory-promotion-qualification.v1",plane:"neon",defaultDecision:"deny_unqualified",qualifications:[{permissionCode:operation.permissionCode,decision:"approved",scopeCoordinatesReviewed:true,lifecycle:{disposition:"transition",lifecycleEntityCode:"invoice",transitionCode:"approve"},assurance:{riskTierReviewed:true,mfaReviewed:true,sodReviewed:true},writerOwnership:{reviewed:true,owner:"@athyper/svc-finance"},reviewedBy:"security@example.test",reviewedAt:"2026-08-18T00:00:00Z"}]};
const catalog=buildCanonicalCatalogV2({plane:"neon",permissions:[]}).catalog;

test("fails closed when an inventory operation has no qualification",()=>{const result=compileInventoryPromotion({inventory,qualification:{...approved,qualifications:[]},existingCatalog:catalog});assert.equal(result.ready,false);assert.ok(result.blockers.includes("neon.finance.invoice.approve: qualification decision is missing"));assert.equal(result.catalog,null);});
test("rejects inconsistent lifecycle and writer qualification",()=>{const qualification={...approved,qualifications:[{...approved.qualifications[0]!,lifecycle:{disposition:"state_neutral" as const},writerOwnership:{reviewed:true,owner:"wrong"}}]};const result=compileInventoryPromotion({inventory,qualification,existingCatalog:catalog});assert.equal(result.ready,false);assert.ok(result.blockers.some((item)=>item.includes("lifecycle transition qualification")));assert.ok(result.blockers.some((item)=>item.includes("writer ownership review")));});
test("emits a complete candidate chain only after every gate is approved",()=>{const result=compileInventoryPromotion({inventory,qualification:approved,existingCatalog:catalog});assert.equal(result.ready,true);assert.equal(result.catalog?.permissions.length,1);assert.equal(result.operationBindings?.authzEntityOperationBindings.length,1);assert.equal(result.scopeCompatibility?.permissions.length,1);assert.equal(result.seedPackPermissionCatalog?.operations.length,1);assert.deepEqual(result.blockers,[]);});
