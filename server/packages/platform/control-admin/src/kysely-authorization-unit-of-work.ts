import type {
  AuthorizationManagementTransaction,
  AuthorizationManagementUnitOfWork,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { sql, type Kysely, type Transaction } from "kysely";

type Database = Record<string, never>;
/** Host bindings must construct every port using this transaction, including
 * legacy effects, receipts and audit. External effects belong in its outbox. */
export type AuthorizationTransactionBinder = (
  transaction: Transaction<Database>,
  context: VerifiedRequestContext,
) => AuthorizationManagementTransaction;

export class KyselyAuthorizationUnitOfWork implements AuthorizationManagementUnitOfWork {
  constructor(
    private readonly databases: Readonly<
      Partial<Record<PlaneKey, Kysely<Database>>>
    >,
    private readonly bind: AuthorizationTransactionBinder,
  ) {}

  async run<T>(
    context: VerifiedRequestContext,
    work: (ports: AuthorizationManagementTransaction) => Promise<T>,
  ): Promise<T> {
    const database = this.databases[context.planeKey];
    if (!database) throw failure("AUTHZ_EXACT_PLANE_REPOSITORY_REQUIRED", 503);
    try {
      return await database
        .transaction()
        .setIsolationLevel("read committed")
        .execute(async (transaction) => {
          const { rows } = await sql<{
            plane: string;
          }>`SELECT current_setting('app.database_plane',true) AS plane`.execute(
            transaction,
          );
          if (rows[0]?.plane !== context.planeKey)
            throw failure("AUTHZ_EXACT_PLANE_REPOSITORY_REQUIRED", 503);
          await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true),set_config('app.current_actor_type','user',true),set_config('lock_timeout','5s',true)`.execute(
            transaction,
          );
          // Serialize approvals and governance writes even across different
          // command keys. Bound readers also lock rows against other writers.
          await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`authorization-management:${context.tenantId}`},0))`.execute(
            transaction,
          );
          const ports = this.bind(transaction, context);
          return work({
            ...ports,
            repositories: {
              forExactPlane(plane) {
                const repository = ports.repositories.forExactPlane(plane);
                if (!repository) return undefined;
                return {
                  planeKey: repository.planeKey,
                  ...(repository.findReceipt
                    ? { findReceipt: repository.findReceipt.bind(repository) }
                    : {}),
                  apply: (command) => repository.apply(command),
                  ...(repository.readOverrideRequest
                    ? {
                        readOverrideRequest:
                          repository.readOverrideRequest.bind(repository),
                      }
                    : {}),
                  async preview(command) {
                    // An observational SQL error must not poison the legacy
                    // write's transaction. Undo any accidental preview effects
                    // on success as well: shadow preview is read-only.
                    await sql`SAVEPOINT authorization_shadow`.execute(
                      transaction,
                    );
                    try {
                      return await repository.preview(command);
                    } finally {
                      await sql`ROLLBACK TO SAVEPOINT authorization_shadow`.execute(
                        transaction,
                      );
                      await sql`RELEASE SAVEPOINT authorization_shadow`.execute(
                        transaction,
                      );
                    }
                  },
                };
              },
            },
          });
        });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code && ["40001", "40P01", "55P03", "23P01"].includes(code))
        throw failure("AUTHZ_WRITE_CONFLICT", 409);
      if (code && ["42501", "42P01", "42703"].includes(code))
        throw failure("AUTHZ_WRITER_DATABASE_UNAVAILABLE", 503);
      if (code === "23505")
        throw failure("AUTHZ_IDEMPOTENCY_OR_COORDINATE_CONFLICT", 409);
      if (
        code &&
        [
          "23503",
          "23514",
          "23502",
          "22P02",
          "22007",
          "22008",
          "22003",
          "55000",
        ].includes(code)
      )
        throw failure("AUTHZ_INVALID_MUTATION", 400);
      throw error;
    }
  }
}
function failure(code: string, status: number): Error {
  return Object.assign(new Error(code), { code, status });
}
