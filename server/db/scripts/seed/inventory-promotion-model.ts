import { parseInstant } from "@athyper/platform-temporal";
import { createHash } from "node:crypto";

import { buildCanonicalCatalogV2, type CanonicalCatalogV2, type CatalogPlane } from "./canonical-catalog-v2-model.js";
import { buildExactScopeCompatibility, type ExactScopeCompatibilityContract, type ScopeKind, type ScopePropagation } from "./exact-scope-compatibility-model.js";

export type PromotionPlane = Exclude<CatalogPlane, "studio">;
export type LifecycleDisposition = "transition" | "initial_state" | "state_neutral" | "not_applicable";

export interface InventoryPromotionQualification {
  permissionCode: string;
  decision: "approved" | "rejected" | "pending";
  scopeCoordinatesReviewed: boolean;
  lifecycle: { disposition: LifecycleDisposition; lifecycleEntityCode?: string; transitionCode?: string };
  assurance: { riskTierReviewed: boolean; mfaReviewed: boolean; sodReviewed: boolean };
  writerOwnership: { reviewed: boolean; owner: string };
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface InventoryPromotionQualificationContract {
  contractVersion: "athyper.authorization.inventory-promotion-qualification.v1";
  plane: PromotionPlane;
  defaultDecision: "deny_unqualified";
  qualifications: readonly InventoryPromotionQualification[];
}

export interface InventoryOperation {
  entityCode: string; operationKey: string; permissionCode: string; permissionKind: string;
  storageRoot: string; riskTier: string; requiresMfa: boolean; requiresSod: boolean; serviceOwner: string;
  requiredScopeKinds?: readonly string[];
  scopeCoordinateKeys?: Readonly<Record<string, string>>;
  coordinates?: readonly { scopeKind: string; coordinateKey: string; authorizationRequired: boolean }[];
}
export interface InventoryTable { table: string; classification: string; writerKind: string | null; writerOwner: string | null; requiredScopeKinds: readonly string[]; }
export interface InventoryLifecycle { entityCode: string; transitions: readonly { code: string; permissionCode: string }[]; }
export interface ReviewedInventory { plane: PromotionPlane; tables: readonly InventoryTable[]; operations: readonly InventoryOperation[]; lifecycles: readonly InventoryLifecycle[]; }

export interface PromotionResult {
  ready: boolean;
  blockers: readonly string[];
  qualifiedPermissionCodes: readonly string[];
  catalog: CanonicalCatalogV2 | null;
  operationBindings: { contractVersion: string; plane: PromotionPlane; defaultBehavior: "deny_unbound_operation"; authzEntityOperationBindings: readonly unknown[] } | null;
  scopeCompatibility: ExactScopeCompatibilityContract | null;
  seedPackPermissionCatalog: { version: string; operations: readonly unknown[] } | null;
}

export function compileInventoryPromotion(input: {
  inventory: ReviewedInventory;
  qualification: InventoryPromotionQualificationContract;
  existingCatalog: CanonicalCatalogV2;
}): PromotionResult {
  const { inventory, qualification } = input;
  const blockers: string[] = [];
  if (qualification.contractVersion !== "athyper.authorization.inventory-promotion-qualification.v1" || qualification.defaultDecision !== "deny_unqualified") blockers.push("qualification contract must deny unqualified operations");
  if (qualification.plane !== inventory.plane || input.existingCatalog.plane !== inventory.plane) blockers.push("cross-plane promotion rejected");
  unique(inventory.operations.map((item) => item.permissionCode), "inventory permission", blockers);
  unique(qualification.qualifications.map((item) => item.permissionCode), "qualification", blockers);
  const tables = new Map(inventory.tables.map((table) => [table.table, table]));
  const qualifications = new Map(qualification.qualifications.map((item) => [item.permissionCode, item]));
  const transitions = new Map(inventory.lifecycles.flatMap((lifecycle) => lifecycle.transitions.map((transition) => [transition.permissionCode, { entityCode: lifecycle.entityCode, transitionCode: transition.code }] as const)));
  const approved: InventoryOperation[] = [];

  for (const operation of inventory.operations) {
    const prefix = operation.permissionCode;
    const table = tables.get(operation.storageRoot);
    if (!table || table.classification === "pending_review") blockers.push(`${prefix}: storage root is not reviewed`);
    if (!table?.writerOwner || !table.writerKind || (isMutation(operation.operationKey) && table.writerOwner !== operation.serviceOwner)) blockers.push(`${prefix}: writer ownership is missing or inconsistent`);
    const scopeKinds = operationScopeKinds(operation);
    if (!scopeKinds.length || scopeKinds.some((kind) => !hasCoordinate(operation, kind))) blockers.push(`${prefix}: exact scope coordinates are incomplete`);
    const q = qualifications.get(prefix);
    if (!q || q.decision === "pending") { blockers.push(`${prefix}: qualification decision is missing`); continue; }
    if (q.decision === "rejected") { blockers.push(`${prefix}: qualification was rejected`); continue; }
    if (!q.scopeCoordinatesReviewed) blockers.push(`${prefix}: scope coordinates are not reviewed`);
    if (!q.assurance.riskTierReviewed || !q.assurance.mfaReviewed || !q.assurance.sodReviewed) blockers.push(`${prefix}: risk/MFA/SoD review is incomplete`);
    if (!q.writerOwnership.reviewed || q.writerOwnership.owner !== operation.serviceOwner) blockers.push(`${prefix}: writer ownership review is incomplete or mismatched`);
    if (!q.reviewedBy?.trim() || !validDate(q.reviewedAt)) blockers.push(`${prefix}: reviewer provenance is incomplete`);
    const transition = transitions.get(prefix);
    if (transition) {
      if (q.lifecycle.disposition !== "transition" || q.lifecycle.lifecycleEntityCode !== transition.entityCode || q.lifecycle.transitionCode !== transition.transitionCode) blockers.push(`${prefix}: lifecycle transition qualification is inconsistent`);
    } else if (q.lifecycle.disposition === "transition") blockers.push(`${prefix}: lifecycle transition does not exist in inventory`);
    if (q.lifecycle.disposition === "not_applicable" && isMutation(operation.operationKey)) blockers.push(`${prefix}: mutations cannot use lifecycle not_applicable`);
    approved.push(operation);
  }
  for (const q of qualification.qualifications) if (!inventory.operations.some((operation) => operation.permissionCode === q.permissionCode)) blockers.push(`${q.permissionCode}: qualification has no inventory operation`);
  if (blockers.length) return { ready: false, blockers: [...new Set(blockers)].sort(), qualifiedPermissionCodes: approved.map((item) => item.permissionCode).sort(), catalog: null, operationBindings: null, scopeCompatibility: null, seedPackPermissionCatalog: null };

  const byCode = new Map(input.existingCatalog.permissions.map((permission) => [permission.canonicalCode, permission]));
  const built = buildCanonicalCatalogV2({ plane: inventory.plane, permissions: inventory.operations.map((operation) => ({ canonicalCode: operation.permissionCode, permissionKind: operation.permissionKind, riskTier: operation.riskTier, requiresMfa: operation.requiresMfa, requiresSod: operation.requiresSod })) }).catalog;
  for (const permission of built.permissions) byCode.set(permission.canonicalCode, permission);
  const catalog = buildCanonicalCatalogV2({ plane: inventory.plane, permissions: [...byCode.values()].map((permission) => ({ canonicalCode: permission.canonicalCode, permissionKind: permission.permissionKind, riskTier: permission.riskTier, requiresMfa: permission.requiresMfa, ...(permission.requiresSod === undefined ? {} : { requiresSod: permission.requiresSod }) })) }).catalog;
  const requiredScopesByPermission = Object.fromEntries(inventory.operations.map((operation) => [operation.permissionCode, operationScopeKinds(operation).map((kind) => ({ kind: kind as ScopeKind, propagation: propagation(inventory.plane, kind) }))]));
  const scopeCompatibility = buildExactScopeCompatibility({ plane: inventory.plane, permissionCodes: catalog.permissions.map((item) => item.canonicalCode), requiredScopesByPermission });
  const catalogByCode = new Map(catalog.permissions.map((item) => [item.canonicalCode, item]));
  const authzEntityOperationBindings = inventory.operations.map((operation) => ({
    bindingId: deterministicId(`${inventory.plane}:${operation.entityCode}:${operation.operationKey}`),
    entityCode: operation.entityCode, operationKey: operation.operationKey,
    permissionId: catalogByCode.get(operation.permissionCode)!.permissionId,
    permissionCode: operation.permissionCode, status: "draft",
  })).sort((a,b) => a.permissionCode.localeCompare(b.permissionCode));
  const seedPackPermissionCatalog={version:catalog.catalogVersion,operations:catalog.permissions.map((permission)=>({permissionId:permission.permissionId,canonicalPermissionCode:permission.canonicalCode,plane:inventory.plane,entityCode:permission.entity,operationCode:permission.operation,operationKind:isMutation(permission.operation)?"mutation":"read",riskTier:permission.riskTier,requiresMfa:permission.requiresMfa,requiresSod:permission.requiresSod??permission.riskTier==="critical",shareable:false,delegable:false,definitionSha256:permission.definitionSha256,permissionKind:permission.permissionKind,moduleCode:`${inventory.plane}.${permission.domain}`}))};
  return { ready: true, blockers: [], qualifiedPermissionCodes: approved.map((item) => item.permissionCode).sort(), catalog,
    operationBindings: { contractVersion: "athyper.authorization.operation-bindings.v1", plane: inventory.plane, defaultBehavior: "deny_unbound_operation", authzEntityOperationBindings }, scopeCompatibility, seedPackPermissionCatalog };
}

function operationScopeKinds(operation: InventoryOperation): string[] { return [...new Set(operation.requiredScopeKinds ?? operation.coordinates?.filter((item) => item.authorizationRequired).map((item) => item.scopeKind) ?? [])].sort(); }
function isMutation(operationKey:string):boolean { return !["read","download","list","search","preview"].includes(operationKey); }
function hasCoordinate(operation: InventoryOperation, kind: string): boolean { return Boolean(operation.scopeCoordinateKeys?.[kind]?.trim()) || Boolean(operation.coordinates?.some((item) => item.authorizationRequired && item.scopeKind === kind && item.coordinateKey?.trim())); }
function propagation(plane: PromotionPlane, kind: string): ScopePropagation { if (plane === "mesh" && kind === "network_relationship") return "relationship_participants"; return kind === "operating_organization" ? "subtree" : "exact"; }
function validDate(value?: string): boolean { return Boolean(value && !Number.isNaN(parseInstant(value))); }
function unique(values: readonly string[], label: string, blockers: string[]): void { const seen=new Set<string>(); for(const value of values){if(seen.has(value))blockers.push(`duplicate ${label}: ${value}`);seen.add(value);} }
function deterministicId(value:string):string { const hash=createHash("sha256").update(value).digest("hex"); return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`; }
