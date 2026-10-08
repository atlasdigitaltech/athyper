import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  validateNativeOperation,
  type NativeOperationRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";
import { nativeOperationToStorage } from "./native-operation-storage.js";
import type { BranchPlan, StoredRow } from "./graph-reconciliation.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";

export interface ApprovedOperationSource {
  readonly entity_id: string;
  readonly entity_code: string;
  readonly source_change_set_id: string;
  readonly source_revision: number;
  readonly source_operation_id: string;
  readonly operation_key: string;
  readonly requires_mfa: boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reject(message: string): never {
  throw new AuthoringPolicyError(
    "OPERATION_BOOTSTRAP_SOURCE_REJECTED",
    message,
  );
}
/** Installed host configuration, never a request DTO or an approval resolver.
 * The owner-approved hash is supplied independently of the source document.
 * Targets are exact server-allocated fresh drafts, not entity-name dispatch.
 * No implicit false/default and no general initializer are provided.
 */
export function createApprovedOperationBootstrap(options: {
  approvedSourceRowsHash: string;
  sources: readonly ApprovedOperationSource[];
  targets: readonly { entityId: string; changeSetId: string }[];
}) {
  const approvedSourceRowsHash = options.approvedSourceRowsHash;
  const sources = structuredClone(options.sources);
  const targets = structuredClone(options.targets);
  if (
    !/^[a-f0-9]{64}$/.test(options.approvedSourceRowsHash) ||
    sources.length === 0 ||
    sources.length > 64 ||
    sha256(sources) !== options.approvedSourceRowsHash ||
    sources.some(
      (s) =>
        Object.keys(s).sort().join(",") !==
          "entity_code,entity_id,operation_key,requires_mfa,source_change_set_id,source_operation_id,source_revision" ||
        !uuid.test(s.entity_id) ||
        !uuid.test(s.source_change_set_id) ||
        !uuid.test(s.source_operation_id) ||
        !Number.isSafeInteger(s.source_revision) ||
        s.source_revision < 1 ||
        typeof s.requires_mfa !== "boolean" ||
        !/^[a-z][a-z0-9_]*$/.test(s.entity_code) ||
        !/^[a-z][a-z0-9_]*$/.test(s.operation_key),
    ) ||
    new Set(sources.map((s) => s.source_operation_id)).size !==
      sources.length ||
    new Set(sources.map((s) => s.entity_id + "/" + s.operation_key)).size !==
      sources.length ||
    targets.length === 0 ||
    targets.length > sources.length ||
    targets.some(
      (t) =>
        !uuid.test(t.entityId) ||
        !uuid.test(t.changeSetId) ||
        !sources.some((s) => s.entity_id === t.entityId) ||
        sources.some((s) => s.source_change_set_id === t.changeSetId),
    ) ||
    new Set(targets.map((t) => t.entityId)).size !== targets.length ||
    new Set(targets.map((t) => t.changeSetId)).size !== targets.length
  )
    reject(
      "Use the exact independently approved source document and fresh target coordinates.",
    );
  for (const entityId of new Set(sources.map((s) => s.entity_id))) {
    const entitySources = sources.filter((s) => s.entity_id === entityId);
    if (
      new Set(
        entitySources.map((s) =>
          JSON.stringify([
            s.entity_code,
            s.source_change_set_id,
            s.source_revision,
          ]),
        ),
      ).size !== 1
    )
      reject("An entity must have one exact approved source revision.");
  }
  return Object.freeze({
    /** Called after the native root/schema guard in the canonical command
     * transaction. Returned insert plans go through the existing scoped writer;
     * admission, idempotency, snapshots and commit remain the caller's duty.
     */
    async prepare(
      tx: Transaction<Record<string, never>>,
      c: NormalizedSaveCoordinate,
      incoming: readonly NativeOperationRow[],
      stored: readonly StoredRow[],
    ): Promise<BranchPlan> {
      c = structuredClone(c);
      incoming = structuredClone(incoming);
      if (
        !tx.isTransaction ||
        c.tenantId !== null ||
        stored.length ||
        !targets.some(
          (t) => t.entityId === c.entityId && t.changeSetId === c.changeSetId,
        )
      )
        reject("Only the admitted empty product target may be initialized.");
      const approved = sources.filter((s) => s.entity_id === c.entityId);
      if (
        incoming.length !== approved.length ||
        new Set(incoming.map((o) => o.id)).size !== incoming.length ||
        new Set(incoming.map((o) => o.operationKey)).size !== incoming.length
      )
        reject(
          "The entire approved operation set must be initialized exactly once.",
        );
      for (const op of incoming) {
        validateNativeOperation(op, true);
        if (
          op.operationKind !== "read" ||
          !approved.some((s) => s.operation_key === op.operationKey) ||
          sources.some((s) => s.source_operation_id === op.id)
        )
          reject(
            "New members must correspond to the approved keys without reusing source member IDs.",
          );
      }
      const actual: ApprovedOperationSource[] = [];
      for (const source of [...approved].sort((a, b) =>
        a.source_operation_id.localeCompare(b.source_operation_id),
      )) {
        const rows = (
          await sql<ApprovedOperationSource>`SELECT * FROM
          entity_command_private.read_operation_bootstrap_source(
            ${c.changeSetId}::uuid,${approvedSourceRowsHash},${source.source_operation_id}::uuid)
          `.execute(tx)
        ).rows;
        const row = rows[0];
        if (
          rows.length !== 1 ||
          !row ||
          sha256({ ...row, source_revision: Number(row.source_revision) }) !==
            sha256(source)
        )
          reject(
            "The installed source mapping, revision or operation is missing or changed.",
          );
        actual.push({ ...source, requires_mfa: row.requires_mfa });
      }
      return {
        table: "entity_operation",
        update: [],
        remove: [],
        insert: incoming.map((op) => ({
          id: op.id,
          values: {
            ...nativeOperationToStorage(op),
            requires_mfa: actual.find(
              (s) => s.operation_key === op.operationKey,
            )!.requires_mfa,
          },
        })),
      };
    },
  });
}
export type ApprovedOperationBootstrap = ReturnType<
  typeof createApprovedOperationBootstrap
>;
