import {
  AuthoringPolicyError,
  normalizedCoreMembers,
  normalizedLayoutMembers,
  nativeStructuralMembers,
  referenceMembers,
  nativeAiMembers,
  ownedLabelMappings,
  nativeRetiredColumns,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { planBranch, type BranchPlan, type GraphWriteTable, type StoredRow } from "./graph-reconciliation.js";
import { validateNativeSnapshotReferences } from "./native-snapshot-validation.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";

/** A closed, insert-only projection for a fresh root, using the same descriptors
 * and scoped writer as ordinary authoring. The enclosing transaction must verify
 * emptiness, installed resources, stable identities and compiler/reader evidence.
 * Operations are supplied separately by the approved-source initializer.
 */
export function nativeBootstrapPlans(
  graph: ExpandedNativeMetaEntityGraph,
  coordinate: NormalizedSaveCoordinate,
  maximumMembers: number,
): readonly BranchPlan[] {
  validateNativeSnapshotReferences(graph, coordinate, maximumMembers);
  const plans: BranchPlan[] = [];
  function mapped(table: string, rows: readonly object[], columns: Readonly<Record<string, string | { column: string }>>) {
    const name=table.replace(/^metadata\./, "") as GraphWriteTable;
    const retired=nativeRetiredColumns[name as keyof typeof nativeRetiredColumns] ?? [];
    plans.push({ table:name, update:[], remove:[], insert:rows.map((row)=>({
      id:String(Reflect.get(row,"id")),
      values:{
        id:Reflect.get(row,"id"),
        ...Object.fromEntries(Object.entries(columns).filter(([key])=>key!=="id" && Object.hasOwn(row,key)).map(([key,column])=>[
          typeof column==="string"?column:column.column,Reflect.get(row,key),
        ])),
        ...Object.fromEntries(retired.map((column)=>[column,null])),
      },
    })) });
  }
  for(const kind of ["labels","translations"] as const)
    mapped(ownedLabelMappings[kind].table,graph.ownedLabels![kind],ownedLabelMappings[kind].columns);
  for(const [kind,key] of [["field","fields"],["runtime","runtimeProfiles"],["surface","surfaces"]] as const)
    mapped(normalizedCoreMembers[kind].table,graph[key],normalizedCoreMembers[kind].columns);
  for(const [kind,d] of Object.entries(nativeStructuralMembers)) {
    const rows=(Reflect.get(graph,kind) ?? []) as readonly object[];
    mapped(d.table,rows,d.columns);
  }
  // Groups precede sections. Cross references such as a surface's default view
  // retain the canonical deferrable FK semantics; no row is silently omitted.
  for(const [kind,d] of Object.entries(referenceMembers))
    mapped(d.table,Reflect.get(graph.referenceMembers!.members,kind),d.columns);
  for(const [kind,key] of [["section","surfaceSections"],["binding","surfaceFieldBindings"]] as const)
    mapped(normalizedLayoutMembers[kind].table,graph[key],normalizedLayoutMembers[kind].columns);
  for(const [key,table] of [["fieldReferenceBindings","entity_field_reference_binding"],["operationPermissions","entity_operation_permission"],["operationScopeBindings","entity_operation_scope_binding"]] as const)
    plans.push(planBranch(table,graph[key] ?? [],[]));
  for(const [kind,d] of Object.entries(nativeAiMembers))
    mapped(d.table,Reflect.get(graph.ai,kind),d.columns);
  if(new Set(plans.map(p=>p.table)).size!==plans.length)
    throw new AuthoringPolicyError("NATIVE_BOOTSTRAP_DUPLICATE_FAMILY","Each native family must have one canonical writer.");
  return plans;
}
/** Verify all mapped tables are empty while the caller holds the fresh root lock.
 * Unknown/nonempty unsupported families are rejected by the native compiler.
 */
export function assertBootstrapPlansEmpty(stored: readonly StoredRow[]) {
  if(stored.length) throw new AuthoringPolicyError("NATIVE_BOOTSTRAP_TARGET_NOT_EMPTY","Bootstrap cannot replace an existing authored graph.");
}
