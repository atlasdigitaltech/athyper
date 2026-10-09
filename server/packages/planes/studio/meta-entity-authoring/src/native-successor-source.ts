import { sql, type Transaction } from "kysely";
import type { ExpandedNativeMetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import {
  nativeOperationFromStorage,
  nativeOperationToStorage,
} from "./native-operation-storage.js";
import type { NativeBootstrapInput } from "./native-bootstrap-application.js";
import type { ApprovedOperationBootstrap } from "./native-operation-bootstrap.js";
import type { NativeIdentityAdoptionSource } from "./native-bootstrap-identities.js";

/** Owner-approved exact predecessor preservation. No proposal supplies protected
 * values; no new operation or source-free initializer is admitted here. The SQL
 * reader holds the published source and operations through this transaction. */
export async function resolveNativeSuccessorSource(
  tx: Transaction<Record<string, never>>,
  input: NativeBootstrapInput,
  baseReleaseId: string,
  graph: ExpandedNativeMetaEntityGraph,
  maximumBytes: number,
): Promise<{
  operations: ApprovedOperationBootstrap;
  identitySources: readonly NativeIdentityAdoptionSource[];
}> {
  input = structuredClone(input);
  graph = structuredClone(graph);
  const fail = (): never => {
    throw Error("NATIVE_SUCCESSOR_SOURCE_REQUIRED");
  };
  if (
    !tx.isTransaction ||
    input.tenantId !== null ||
    graph.authoringSource.entityId !== input.entityId ||
    graph.authoringSource.tenantId !== null ||
    graph.ownedLabels?.changeSetId !== input.changeSetId ||
    sha256(graph) !== input.proposalHash ||
    !/^[a-f0-9-]{36}$/.test(baseReleaseId) ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 4194304
  )
    fail();
  const rows = (
    await sql<{
      source_change_set_id: string;
      source_revision: string | number;
      graph: ExpandedNativeMetaEntityGraph;
      graph_hash: string;
      operation_rows: Record<string, unknown>[];
      identity_rows: Record<string, unknown>[];
    }>`SELECT * FROM entity_command_private.read_native_successor_source(${input.changeSetId}::uuid,${input.entityId}::uuid,${baseReleaseId}::uuid,${maximumBytes})`.execute(
      tx,
    )
  ).rows;
  if (rows.length !== 1) return fail();
  const source = rows[0]!;
  if (
    sha256(source.graph) !== source.graph_hash ||
    source.graph.ownedLabels?.changeSetId !== source.source_change_set_id ||
    source.graph.authoringSource.entityId !== input.entityId ||
    source.graph.authoringSource.tenantId !== null ||
    source.graph.contractSchema !== "athyper.meta-entity-contract/2.5" ||
    source.graph.operations.length !== graph.operations.length ||
    source.operation_rows.length !== graph.operations.length ||
    source.graph.fields.length !== graph.fields.length ||
    source.identity_rows.length !== graph.fields.length
  )
    fail();
  const remap = new Map<string, string>();
  function pairs(
    previous: readonly { id: string }[],
    current: readonly { id: string }[],
    key: (row: object) => unknown,
  ) {
    for (const p of previous) {
      const matches = current.filter((c) => key(c) === key(p));
      if (matches.length !== 1 || p.id === matches[0]!.id) fail();
      remap.set(p.id, matches[0]!.id);
    }
  }
  pairs(source.graph.fields, graph.fields, (r) =>
    Reflect.get(r, "fieldIdentityId"),
  );
  pairs(source.graph.operations, graph.operations, (r) =>
    Reflect.get(r, "operationKey"),
  );
  pairs(source.graph.ownedLabels!.labels, graph.ownedLabels!.labels, (r) =>
    Reflect.get(r, "labelKey"),
  );
  pairs(source.graph.surfaces, graph.surfaces, (r) =>
    Reflect.get(r, "surfaceKey"),
  );
  const controls = new Map<string, boolean>();
  for (const previous of source.graph.operations) {
    const actual = source.operation_rows.filter((r) => r.id === previous.id);
    if (
      actual.length !== 1 ||
      typeof actual[0]!.requires_mfa !== "boolean" ||
      canonicalJson(nativeOperationFromStorage(actual[0]!)) !==
        canonicalJson(previous) ||
      previous.operationKind !== "read"
    )
      fail();
    const expected = Object.fromEntries(
      Object.entries(previous).map(([k, v]) => [
        k,
        typeof v === "string" && (k === "id" || k.endsWith("Id"))
          ? (remap.get(v) ?? v)
          : v,
      ]),
    );
    const incoming = graph.operations.find(
      (o) => o.id === remap.get(previous.id),
    );
    if (!incoming || canonicalJson(incoming) !== canonicalJson(expected))
      fail();
    controls.set(incoming!.id, actual[0]!.requires_mfa as boolean);
  }
  const identitySources: NativeIdentityAdoptionSource[] = [];
  for (const field of graph.fields) {
    const previous = source.graph.fields.find(
      (f) => f.fieldIdentityId === field.fieldIdentityId,
    );
    const identities = source.identity_rows.filter(
      (i) =>
        i.id === field.fieldIdentityId &&
        i.entity_id === input.entityId &&
        i.tenant_id === null &&
        i.native_available === true,
    );
    if (
      !previous ||
      identities.length !== 1 ||
      !["reserved", "active"].includes(String(identities[0]!.identity_status))
    )
      fail();
    if (identities[0]!.identity_status === "reserved")
      identitySources.push({
        identityId: field.fieldIdentityId,
        targetFieldId: field.id,
        sourceChangeSetId: source.source_change_set_id,
        sourceFieldId: previous!.id,
        sourceRevision: Number(source.source_revision),
        sourceHash: source.graph_hash,
        sourceReleaseId: baseReleaseId,
      });
  }
  const captured = structuredClone(graph.operations);
  return {
    identitySources,
    operations: {
      async prepare(transaction, coordinate, incoming, stored) {
        if (
          transaction !== tx ||
          coordinate.changeSetId !== input.changeSetId ||
          coordinate.entityId !== input.entityId ||
          coordinate.tenantId !== null ||
          stored.length ||
          canonicalJson(incoming) !== canonicalJson(captured)
        )
          fail();
        return {
          table: "entity_operation",
          update: [],
          remove: [],
          insert: incoming.map((o) => ({
            id: o.id,
            values: {
              ...nativeOperationToStorage(o),
              requires_mfa: controls.get(o.id)!,
            },
          })),
        };
      },
    },
  };
}
