import { sql } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  createKyselyPermissionResolver,
  type ExactPlaneAuthorizationTransactions,
} from "./kysely-permission-resolver.js";

/** Reload local IAM authority in an exact-plane, read-only snapshot. Authentication
 * strength is retained only while the authenticated epoch is still current. */
export function createKyselyContextRefresh(
  transactions: ExactPlaneAuthorizationTransactions,
) {
  return async (
    context: VerifiedRequestContext,
  ): Promise<VerifiedRequestContext> =>
    transactions.run(context, async (transaction) => {
      await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(
        transaction,
      );
      await sql`SET LOCAL statement_timeout='1500ms'`.execute(transaction);
      await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
        transaction,
      );
      const principal = (
        await sql<{
          auth_epoch: number;
        }>`SELECT auth_epoch FROM master.principal WHERE tenant_id=${context.tenantId}::uuid AND id=${context.principalId}::uuid AND status='active'`.execute(
          transaction,
        )
      ).rows[0];
      if (!principal || principal.auth_epoch !== context.authEpoch)
        throw new Error("AUTH_CONTEXT_REAUTHENTICATION_REQUIRED");
      const permissions = await createKyselyPermissionResolver(
        {
          run: (_identity, work) => work(transaction),
        },
        Date.now,
        context.permissions.localGraphPreview,
      ).resolve(context);
      return Object.freeze({
        ...context,
        permissions,
        profileHash: permissions.profileHash,
      });
    });
}
