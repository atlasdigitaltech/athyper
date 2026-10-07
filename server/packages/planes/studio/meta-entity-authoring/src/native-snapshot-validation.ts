import {
  FoundationContractError,
  parseReferenceMembers,
  type NativeAuthoringSnapshot,
} from "@athyper/server-contract-meta-entity-authoring";
import { snakeKey } from "./graph-reconciliation.js";
import { validateNativeSupplementalReferences } from "./native-supplemental-storage.js";
import { validateNativeEntityLabelOwner } from "./native-localized-labels.js";

/** Aggregate local closure for current and immutable saved snapshots. Resource
 * resolution, core/layout semantics and database guards remain mandatory at the
 * caller. This never establishes host, permission or storage authority. */
export function validateNativeSnapshotReferences(
  graph: NativeAuthoringSnapshot,
  coordinate: {
    entityId: string;
    tenantId: string | null;
    changeSetId: string;
  },
  maximumMembers: number,
): void {
  const fail = (code: string, path: string): never => {
    throw new FoundationContractError(code, path);
  };
  if (!Number.isSafeInteger(maximumMembers) || maximumMembers < 1)
    fail("NATIVE_SNAPSHOT_LIMIT", "/snapshot");
  if (
    ![
      "athyper.meta-entity-contract/2.4",
      "athyper.meta-entity-contract/2.5",
    ].includes(graph.contractSchema) ||
    graph.authoringSource?.entityId !== coordinate.entityId ||
    graph.authoringSource?.tenantId !== coordinate.tenantId ||
    !/^[a-f0-9]{64}$/.test(graph.authoringSource?.authoringSchemaHash ?? "") ||
    graph.authoringSource?.sourceKind !==
      (coordinate.tenantId === null ? "product" : "tenant_entity") ||
    graph.ownedLabels?.changeSetId !== coordinate.changeSetId
  )
    fail("NATIVE_SNAPSHOT_SOURCE_INVALID", "/authoringSource");
  validateNativeEntityLabelOwner(graph, coordinate);
  // A limit per branch lets many individually valid branches exceed the host's
  // snapshot budget. Count each authored row once, excluding identity catalogues.
  let count = 0;
  for (const [key, value] of Object.entries(graph))
    if (key !== "fieldIdentities" && Array.isArray(value))
      count += value.length;
  count +=
    (graph.ownedLabels?.labels.length ?? 0) +
    (graph.ownedLabels?.translations.length ?? 0);
  for (const rows of Object.values(graph.referenceMembers?.members ?? {}))
    count += rows.length;
  if (graph.contractSchema === "athyper.meta-entity-contract/2.5")
    for (const rows of Object.values(graph.ai)) count += rows.length;
  if (count > maximumMembers) fail("NATIVE_SNAPSHOT_LIMIT", "/snapshot");

  const table = (rows: readonly object[] | undefined) =>
    (rows ?? []).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [snakeKey(key), value]),
      ),
    );
  // Reference validation consumes SQL-shaped anchors, not independently supplied
  // IDs that could hide a removed field/operation in a historical snapshot.
  parseReferenceMembers(graph.referenceMembers, {
    changeSetId: coordinate.changeSetId,
    maxMembers: maximumMembers,
    maxPredicateDepth: 32,
    tables: {
      entity_field: table(graph.fields),
      entity_operation: table(graph.operations),
      entity_surface: table(graph.surfaces),
      entity_surface_section: table(graph.surfaceSections),
      entity_surface_field_binding: table(graph.surfaceFieldBindings),
      entity_surface_operation: table(graph.surfaceOperations),
      entity_label: table(graph.ownedLabels?.labels),
      entity_change_set: [{ id: coordinate.changeSetId }],
    },
  });
  if (graph.contractSchema === "athyper.meta-entity-contract/2.5")
    validateNativeSupplementalReferences(graph, maximumMembers);
}
