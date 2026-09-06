import { randomUUID } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { fingerprintCommand, parseIdempotencyKey, type OutboxWriter } from "@athyper/server-contract-events";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { assertIamPlane } from "./iam-contracts.js";
import { normalizeIdentityIdentifier, type ProvisioningRequest } from "./provisioning.js";

export const CREATE_PROVISIONING_PERMISSION = "iam.provisioning.create";

export interface ProvisioningCreateCommand {
  readonly context: VerifiedRequestContext;
  readonly idempotencyKey?: string;
  readonly identifier: string;
  readonly realmKey?: string;
  readonly planes: readonly PlaneKey[];
}

export type ProvisioningCreateResult =
  | { readonly kind: "Created"; readonly request: ProvisioningRequest }
  | { readonly kind: "Replayed"; readonly request: ProvisioningRequest }
  | { readonly kind: "Forbidden"; readonly permissionCode: string }
  | { readonly kind: "IdempotencyConflict"; readonly reason: "required" | "invalid" | "reused" };

export interface ProvisioningCreateRepository<Transaction> {
  createOrReplay(input: ProvisioningRequest & { readonly subjectKey: string }, transaction: Transaction): Promise<
    | { readonly kind: "created"; readonly request: ProvisioningRequest }
    | { readonly kind: "replay"; readonly request: ProvisioningRequest }
    | { readonly kind: "conflict" }
  >;
}

export interface ProvisioningTransactionCoordinator<Transaction> {
  run<Result>(actor: { readonly tenantId: string; readonly principalId: string }, work: (transaction: Transaction) => Promise<Result>): Promise<Result>;
}

export interface ProvisioningVerticalOptions<Transaction> {
  readonly authorizer: Authorizer;
  readonly repository: ProvisioningCreateRepository<Transaction>;
  readonly transactions: ProvisioningTransactionCoordinator<Transaction>;
  readonly audit: AuditRecorder<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly createId?: () => string;
}

export function createProvisioningVertical<Transaction>(options: ProvisioningVerticalOptions<Transaction>) {
  return {
    async request(command: ProvisioningCreateCommand): Promise<ProvisioningCreateResult> {
      if (command.context.planeKey !== "studio" ||
          (command.realmKey !== undefined && normalizeRealmKey(command.realmKey) !== command.context.realmKey)) {
        return { kind: "Forbidden", permissionCode: CREATE_PROVISIONING_PERMISSION };
      }
      const idempotency = parseIdempotencyKey(command.idempotencyKey);
      if (!idempotency.ok) return { kind: "IdempotencyConflict", reason: idempotency.reason };
      const authorization = await options.authorizer.authorize({ context: command.context, permissionCode: CREATE_PROVISIONING_PERMISSION });
      if (!authorization.allowed) return { kind: "Forbidden", permissionCode: CREATE_PROVISIONING_PERMISSION };

      const normalizedIdentifier = normalizeIdentityIdentifier(command.identifier);
      const realmKey = normalizeRealmKey(command.realmKey ?? command.context.realmKey);
      const planes = Object.freeze([...new Set(command.planes)].sort());
      if (!planes.length) throw new TypeError("At least one target plane is required");
      planes.forEach(assertIamPlane);
      const subjectKey = fingerprintCommand({ tenantId: command.context.tenantId, realmKey, normalizedIdentifier });
      const requestFingerprint = fingerprintCommand({ tenantId: command.context.tenantId, realmKey, normalizedIdentifier, planes });
      const request: ProvisioningRequest = Object.freeze({
        id: options.createId?.() ?? randomUUID(),
        idempotencyKey: idempotency.value,
        requestFingerprint,
        tenantId: command.context.tenantId,
        realmKey,
        normalizedIdentifier,
        displayIdentifier: command.identifier.trim(),
        planes,
        state: "requested",
        version: 1,
      });

      return options.transactions.run({ tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
        const persisted = await options.repository.createOrReplay({ ...request, subjectKey }, transaction);
        if (persisted.kind === "conflict") return { kind: "IdempotencyConflict", reason: "reused" };
        if (persisted.kind === "replay") return { kind: "Replayed", request: persisted.request };
        await options.outbox.append({
          tenantId: command.context.tenantId,
          topic: "iam.provisioning",
          eventType: "iam.provisioning.requested",
          eventKey: idempotency.value,
          entityType: "iam.provisioning_request",
          entityId: request.id,
          aggregateType: "iam.principal",
          actorId: command.context.principalId,
          correlationId: command.context.correlationId,
          payload: { requestId: request.id, realmKey, normalizedIdentifier, planes },
        }, transaction);
        await options.audit.record({
          eventCode: "iam.provisioning.requested",
          action: "create",
          outcome: "success",
          actor: { kind: "user", principalId: command.context.principalId },
          tenantId: command.context.tenantId,
          entityType: "iam.provisioning_request",
          entityId: request.id,
          requestId: command.context.requestId,
          ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}),
          metadata: { realmKey, targetPlanes: planes },
        }, transaction);
        return { kind: "Created", request: persisted.request };
      });
    },
  };
}

export type ProvisioningVertical = ReturnType<typeof createProvisioningVertical>;

function normalizeRealmKey(value: string): string {
  const normalized = value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
  if (!/^[a-z][a-z0-9_.-]{1,62}$/.test(normalized)) throw new TypeError("realmKey is invalid");
  return normalized;
}
