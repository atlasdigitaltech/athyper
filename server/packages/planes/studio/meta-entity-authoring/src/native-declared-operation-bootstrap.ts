import { sql } from "kysely";
import {
  AuthoringPolicyError,
  validateNativeOperation,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";
import { nativeOperationToStorage } from "./native-operation-storage.js";
import type { ApprovedOperationBootstrap } from "./native-operation-bootstrap.js";

export interface DeclaredOperationInitialization {
  readonly schema: "entity.local-operation-initialization/1";
  readonly targets: readonly {
    readonly entityId: string;
    readonly changeSetId: string;
    readonly operations: readonly {
      readonly id: string;
      readonly operationKey: string;
      readonly operationHash: string;
      readonly requiresMfa: false;
    }[];
  }[];
}
/** The owner's source-free initialization exception. Trusted host installation
 * binds this exact declaration hash independently of requests. It is neither an
 * ordinary mutation DTO nor a general false default. Production host composition
 * must restrict installation to the approved local profile and target proposals.
 * Final DB grants/guards and enclosing authorization remain independently required.
 */
export function createDeclaredOperationBootstrap(options: {
  readonly profile: "owner-approved-local-native";
  readonly approvedDeclarationHash: string;
  readonly declaration: DeclaredOperationInitialization;
}): ApprovedOperationBootstrap {
  const reject = (): never => {
    throw new AuthoringPolicyError(
      "DECLARED_OPERATION_INITIALIZATION_REJECTED",
      "Use the exact approved local initialization declaration and admitted fresh target.",
    );
  };
  const exact = (value: object, keys: string) =>
    Object.keys(value).sort().join() === keys;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const hash = /^[a-f0-9]{64}$/;
  const declaration = structuredClone(options.declaration);
  if (
    options.profile !== "owner-approved-local-native" ||
    !hash.test(options.approvedDeclarationHash) ||
    !declaration ||
    !exact(declaration, "schema,targets") ||
    declaration.schema !== "entity.local-operation-initialization/1" ||
    !Array.isArray(declaration.targets) ||
    !declaration.targets.length ||
    declaration.targets.length > 32 ||
    sha256(declaration) !== options.approvedDeclarationHash
  )
    reject();
  const entities = new Set<string>(),
    drafts = new Set<string>(),
    members = new Set<string>();
  for (const target of declaration.targets) {
    if (
      !target ||
      !exact(target, "changeSetId,entityId,operations") ||
      !uuid.test(target.entityId) ||
      !uuid.test(target.changeSetId) ||
      entities.has(target.entityId) ||
      drafts.has(target.changeSetId) ||
      !Array.isArray(target.operations) ||
      !target.operations.length ||
      target.operations.length > 16
    )
      reject();
    entities.add(target.entityId);
    drafts.add(target.changeSetId);
    const keys = new Set<string>();
    for (const operation of target.operations) {
      if (
        !operation ||
        !exact(operation, "id,operationHash,operationKey,requiresMfa") ||
        !uuid.test(operation.id) ||
        !hash.test(operation.operationHash) ||
        typeof operation.operationKey !== "string" ||
        !/^[a-z][a-z0-9_]*$/.test(operation.operationKey) ||
        operation.requiresMfa !== false ||
        members.has(operation.id) ||
        keys.has(operation.operationKey)
      )
        reject();
      members.add(operation.id);
      keys.add(operation.operationKey);
    }
  }
  return Object.freeze({
    async prepare(tx, c, incoming, stored) {
      c = structuredClone(c);
      incoming = structuredClone(incoming);
      const target = declaration.targets.find(
        (t) => t.entityId === c.entityId && t.changeSetId === c.changeSetId,
      );
      if (
        !tx.isTransaction ||
        c.tenantId !== null ||
        !target ||
        stored.length ||
        incoming.length !== target.operations.length ||
        new Set(incoming.map((o) => o.id)).size !== incoming.length
      )
        reject();
      for (const operation of incoming) {
        validateNativeOperation(operation, true);
        const value = target!.operations.find(
          (o) =>
            o.id === operation.id && o.operationKey === operation.operationKey,
        );
        if (
          !value ||
          sha256(operation) !== value.operationHash ||
          operation.operationKind !== "read" ||
          operation.authorizationEffect !== "read"
        )
          reject();
      }
      const result = await sql<{
        id: string;
      }>`SELECT c.id FROM metadata.entity_change_set c
      WHERE c.id=${c.changeSetId}::uuid AND c.entity_id=${c.entityId}::uuid AND c.tenant_id IS NULL
      AND c.source_kind='product' AND c.native_core_layout_version=2 AND c.lock_version=1 AND c.status='draft'
      AND entity_command_private.admitted_creation(c.id,c.entity_id)
      AND c.created_by::text=current_setting('app.current_principal_id',true)
      AND NOT EXISTS(SELECT 1 FROM metadata.entity_operation o WHERE o.change_set_id=c.id)
      FOR UPDATE OF c`.execute(tx);
      if (result.rows.length !== 1 || result.rows[0]!.id !== c.changeSetId)
        reject();
      return {
        table: "entity_operation",
        update: [],
        remove: [],
        insert: incoming.map((operation) => ({
          id: operation.id,
          values: {
            ...nativeOperationToStorage(operation),
            requires_mfa: target!.operations.find((o) => o.id === operation.id)!
              .requiresMfa,
          },
        })),
      };
    },
  });
}
