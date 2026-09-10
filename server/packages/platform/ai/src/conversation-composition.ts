import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { AtlasDurableMessageAuthorizer } from "./message-lineage.js";
import { KyselyAtlasMessageLineageReader } from "./kysely-message-lineage.js";
import type { AtlasThreadServiceOptions } from "./thread-service.js";
import type {
  AtlasPlaneAdmissionResolver,
  AtlasThreadAuthorizer,
  AtlasRetentionPolicyResolver,
} from "@athyper/server-contract-ai";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";
import { assertAtlasContext, hasPermission } from "./context.js";
import { KyselyAtlasThreadRepository } from "./kysely-thread-repository.js";
import { AtlasThreadService } from "./thread-service.js";

/** Durable conversation access does not depend on an inference provider being configured. */
export function createAtlasConversationServices(
  transactions: PlaneTransactionCoordinator<Transaction<Record<string, never>>>,
  disclosure?: AtlasThreadServiceOptions["disclosure"],
  authorizeAdmission?: (context: VerifiedRequestContext) => Promise<boolean>,
) {
  const authorizer: AtlasThreadAuthorizer = {
    async authorize({ context, operation, thread }) {
      assertAtlasContext(context);
      if (!hasPermission(context, `${context.planeKey}.ai.agent.use`) || (authorizeAdmission && !await authorizeAdmission(context)))
        return false;
      if (!thread) return operation === "create" || operation === "read";
      if (
        thread.tenantId !== context.tenantId ||
        thread.planeKey !== context.planeKey
      )
        return false;
      if (thread.ownerPrincipalId === context.principalId) return true;
      const participant = thread.participants.find(
        (p) => p.principalId === context.principalId && !p.revokedAt,
      );
      return (
        !!participant &&
        operation === "read"
      );
    },
  };
  const retention: AtlasRetentionPolicyResolver = {
    resolve: (context) =>
      transactions.run(
        context.planeKey,
        { tenantId: context.tenantId, principalId: context.principalId },
        async (tx) => {
          const row = (
            await sql<{
              retention_days: number;
              revision: number;
            }>`SELECT retention_days,revision FROM ai.atlas_conversation_retention_policy
        WHERE tenant_id=${context.tenantId}::uuid AND status='active' AND effective_from<=now()
        AND (effective_to IS NULL OR effective_to>now()) ORDER BY revision DESC LIMIT 1`.execute(
              tx,
            )
          ).rows[0];
          const days = row?.retention_days ?? 30;
          if (!Number.isInteger(days) || days < 1 || days > 3650)
            throw new Error(
              "Atlas retention policy is outside the supported range",
            );
          return {
            policyId: row
              ? `tenant:${context.tenantId}:${row.revision}`
              : "platform:atlas:30-days:v1",
            retentionDays: days,
            displayText: `${days} days`,
          };
        },
      ),
  };
  const admission: AtlasPlaneAdmissionResolver = {
    async resolve(context) {
      assertAtlasContext(context);
      const allowed = hasPermission(
        context,
        `${context.planeKey}.ai.agent.use`,
      ) && (!authorizeAdmission || await authorizeAdmission(context));
      return {
        schema: "atlas-plane-admission/1",
        planeKey: context.planeKey,
        chatAllowed: false,
        persistenceAllowed: allowed,
        readToolsAllowed: false,
        mutationToolsAllowed: false,
        invoiceExtractionAllowed: false,
        allowedPublicModelIds: [],
        allowedDataClasses: [],
        policyRevision: "conversation-persistence:v1",
        reasonCode: allowed ? "provider_not_configured" : "permission_denied",
      };
    },
  };
  const repository = new KyselyAtlasThreadRepository(transactions);
  return {
    threads: new AtlasThreadService({
      repository,
      disclosure: disclosure ?? new AtlasDurableMessageAuthorizer({ reader: new KyselyAtlasMessageLineageReader(transactions) }),
      authorizer,
      retention,
      maxHistoryMessages: 20,
      maxHistoryBytes: 98304,
      maxExportMessages: 1000,
    }),
    admission,
    repository,
    authorizer,
    retention,
  };
}
