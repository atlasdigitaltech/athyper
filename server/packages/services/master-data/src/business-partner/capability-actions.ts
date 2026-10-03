import { sql, type Kysely } from "kysely";
import type {
  RegisteredActionCommand,
  RecordMutationResult,
} from "@athyper/server-contract-records";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { TransactionalRecordActionHandler } from "@athyper/server-service-records";

/** Domain-owned command adapters. Metadata selects the registered contract;
 * permission codes and entity identities are never inferred here. The shared
 * transactional runner owns authorization, receipts, audit and outbox. */
export function createPartnerCapabilityActionHandlers<
  T extends Kysely<Record<string, never>>,
>(): ReadonlyMap<string, TransactionalRecordActionHandler<T>> {
  const entries = [
    {
      key: "neon.bp.capability.supplier.v1",
      capability: "supplier",
      field: "supplier_enabled",
    },
    {
      key: "neon.bp.capability.customer.v1",
      capability: "customer",
      field: "customer_enabled",
    },
  ] as const;
  return new Map(
    entries.map((binding) => {
      const validate = (
        command: RegisteredActionCommand,
        descriptor: EntityRuntimeDescriptor,
      ): RecordMutationResult | undefined => {
        const action = descriptor.actions?.find(
          (action) => action.code === command.actionCode,
        );
        if (
          command.context.planeKey !== "neon" ||
          descriptor.planeKey !== command.context.planeKey ||
          action?.handlerKey !== binding.key ||
          descriptor.storage.versionField !== "record_version" ||
          !descriptor.fields.some(
            (field) =>
              field.key === binding.field &&
              field.storagePath === binding.field &&
              field.type === "boolean",
          )
        )
          return {
            kind: "CapabilityUnavailable",
            entityCode: command.entityCode,
          };
        if (
          !Number.isSafeInteger(command.expectedVersion) ||
          Number(command.expectedVersion) < 1
        )
          return { kind: "VersionRequired" };
        if (
          !command.input ||
          Object.keys(command.input).some(
            (key) => !["enabled", "reason"].includes(key),
          ) ||
          typeof command.input.enabled !== "boolean" ||
          typeof command.input.reason !== "string" ||
          command.input.reason.trim().length < 1 ||
          command.input.reason.trim().length > 4000
        )
          return {
            kind: "ValidationFailed",
            code: "PARTNER_CAPABILITY_INPUT_INVALID",
            message: "Enabled and a reason of 1–4000 characters are required.",
            fields: ["enabled", "reason"],
          };
      };
      const handler: TransactionalRecordActionHandler<T> = {
        // This contract is tenant-scoped. The verified actor context, not request
        // payload coordinates, supplies its resource. IAM still checks the exact
        // published action permission before any receipt or command execution.
        async resolveAuthorizationResource(command, descriptor) {
          const invalid = validate(command, descriptor);
          return (
            invalid ?? {
              kind: "Resolved",
              resource: { tenantId: command.context.tenantId },
            }
          );
        },
        async authorize(command, descriptor) {
          return validate(command, descriptor);
        },
        async execute(command, descriptor, transaction) {
          const invalid = validate(command, descriptor);
          if (invalid) return invalid;
          const result = (
            await sql<{
              business_partner_id: string;
              capability: string;
              enabled: boolean;
              record_version: string | number;
              evidence_id: string;
              replayed: boolean;
            }>`SELECT * FROM control.command_business_partner_capability(
          ${command.context.tenantId}::uuid, ${command.recordId}::uuid,
          ${binding.capability}::text, ${command.input!.enabled}::boolean,
          ${command.expectedVersion}::bigint, ${command.input!.reason}::text,
          ${command.idempotencyKey}::text, ${command.context.principalId}::uuid
        )`.execute(transaction)
          ).rows;
          const row = result[0],
            version = Number(row?.record_version);
          if (
            result.length !== 1 ||
            row?.business_partner_id !== command.recordId ||
            row.capability !== binding.capability ||
            row.enabled !== command.input!.enabled ||
            !Number.isSafeInteger(version) ||
            version !== command.expectedVersion! + 1 ||
            typeof row.evidence_id !== "string" ||
            !row.evidence_id ||
            typeof row.replayed !== "boolean"
          )
            throw Error("PARTNER_CAPABILITY_COMMAND_RESULT_INVALID");
          return {
            kind: "Committed",
            action: "domain",
            entityCode: command.entityCode,
            recordId: command.recordId,
            version,
            replayed: row.replayed,
          };
        },
      };
      return [binding.key, handler];
    }),
  );
}
