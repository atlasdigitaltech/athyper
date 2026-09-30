import { sql, type Kysely } from "kysely";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import type { ConnectorHealthJobs } from "@athyper/server-contract-control-admin";
import type { ControlDb } from "./control-repository-db.js";
import { KyselyConnectorRepository } from "./kysely-connector-repository.js";
import { KyselyRoundingRepository } from "./kysely-rounding-repository.js";
import { KyselyLookupRepository } from "./kysely-lookup-repository.js";
import { KyselyBankValidationRepository } from "./kysely-bank-validation-repository.js";
export function createKyselyControlRepositories(
  databases: Readonly<Partial<Record<PlaneKey, Kysely<ControlDb>>>>,
) {
  const registry = <T>(
    factory: (db: Kysely<ControlDb>, plane: PlaneKey) => T,
    table: string,
  ) =>
    createExactPlaneRepositoryProvider<T>(
      Object.fromEntries(
        Object.entries(databases).map(([plane, db]) => [
          plane,
          factory(db, plane as PlaneKey),
        ]),
      ),
      {
        health: Object.fromEntries(
          Object.entries(databases).map(([plane, db]) => [
            plane,
            async () => {
              const result = (
                await sql<{
                  plane: string;
                }>`SELECT current_setting('app.database_plane',true) AS plane`.execute(
                  db,
                )
              ).rows[0];
              if (result?.plane !== plane)
                return {
                  status: "unhealthy" as const,
                  message: "Repository plane mismatch",
                };
              await sql`SELECT version FROM ${sql.table("control." + table)} LIMIT 0`.execute(
                db,
              );
              if (table === "lookup_domain") {
                const guard = (
                  await sql<{
                    ready: boolean;
                  }>`SELECT coalesce(has_function_privilege(current_user,to_regprocedure('control.admin_lookup_domain_change_allowed(text,boolean,boolean)'),'EXECUTE'),false) AS ready`.execute(
                    db,
                  )
                ).rows[0];
                if (!guard?.ready)
                  return {
                    status: "unhealthy" as const,
                    message:
                      "Lookup reference governance migration or grants missing",
                  };
              }
              return { status: "healthy" as const };
            },
          ]),
        ),
      },
    );
  const connectors = registry(
    (db, plane) => new KyselyConnectorRepository(db, plane),
    "connector_instance",
  );
  const healthJobs: ConnectorHealthJobs = {
    enqueue: (input) => connectors.require(input.planeKey).enqueue(input),
  };
  return {
    connectors,
    rounding: registry(
      (db, p) => new KyselyRoundingRepository(db, p),
      "rounding_rule",
    ),
    lookups: registry(
      (db, p) => new KyselyLookupRepository(db, p),
      "lookup_domain",
    ),
    bankValidation: registry(
      (db, p) => new KyselyBankValidationRepository(db, p),
      "bank_account_validation_rule",
    ),
    healthJobs,
  };
}
