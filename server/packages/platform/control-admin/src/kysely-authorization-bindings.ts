import type {
  AuthorizationManagementAudit,
  LegacyAuthorizationWriter,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { sql, type Kysely, type Transaction } from "kysely";
import { KyselyAuthorizationUnitOfWork } from "./kysely-authorization-unit-of-work.js";
import { KyselyAuthorizationManagementRepository } from "./kysely-authorization-management-repository.js";

/** A legacy binding must target its actual authority using the supplied
 * transaction. It must not alias the canonical writer during rollout. */
export type LegacyAuthorizationTransactionBinder = (
  tx: Transaction<Record<string, never>>,
  context: VerifiedRequestContext,
) => { writer: LegacyAuthorizationWriter; audit: AuthorizationManagementAudit };
export function createKyselyAuthorizationManagementUnitOfWork(
  databases: Readonly<Partial<Record<PlaneKey, Kysely<Record<string, never>>>>>,
  legacyBind?: LegacyAuthorizationTransactionBinder,
) {
  return new KyselyAuthorizationUnitOfWork(databases, (tx, context) => {
    const repository = new KyselyAuthorizationManagementRepository(tx, context);
    const legacy = legacyBind?.(tx, context);
    return {
      legacyWriter: legacy?.writer ?? {
        async execute() {
          throw Object.assign(new Error("AUTHZ_LEGACY_WRITER_UNAVAILABLE"), {
            code: "AUTHZ_LEGACY_WRITER_UNAVAILABLE",
            status: 503,
          });
        },
      },
      repositories: {
        forExactPlane: (plane) =>
          plane === context.planeKey ? repository : undefined,
      },
      audit: {
        async record(input) {
          if (input.writer === "legacy") {
            if (!legacy) throw new Error("Legacy audit binding unavailable");
            return legacy.audit.record(input);
          }
          const receipt = repository.lastReceipt;
          if (
            !receipt ||
            receipt.commandId !== input.commandId ||
            input.outcome !== "success"
          )
            throw new Error(
              "Authorization audit requires its transaction's mutation receipt",
            );
          if (receipt.replayed) return;
          const detail = { ...input, receipt };
          const audit = (
            await sql<{
              id: string;
            }>`SELECT audit.append_event(p_event_code=>'authorization.management.success',p_operation=>'execute'::audit.operation_d,p_entity_type=>'authz.management_command',p_entity_id=>${receipt.resourceId}::uuid,p_context=>${JSON.stringify(detail)}::jsonb,p_request_id=>${input.requestId ?? null}) AS id`.execute(
              tx,
            )
          ).rows[0]!;
          await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,partition_key,payload,created_by)
          VALUES(${context.tenantId}::uuid,'authorization.management','authorization.management.success',${input.commandId},'authz.management_command',${receipt.resourceId}::uuid,'authz.management_command',${receipt.resourceId}::uuid,${context.principalId}::uuid,'control-admin',${context.tenantId},${JSON.stringify({ ...detail, auditEventId: audit.id })}::jsonb,${context.principalId}::uuid)`.execute(
            tx,
          );
        },
      },
    };
  });
}
