import { sql, type Kysely } from "kysely";
type Database = Kysely<Record<string, never>>;
/** Reuse a publication transaction without consuming a second pool slot or
 * leaving a human read context on the worker's subsequent writes. */
export async function resourceReadTransaction<T>(
  database: Database,
  work: (tx: Database) => Promise<T>,
): Promise<T> {
  if (!database.isTransaction)
    return database
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (tx) => {
        await sql`SET TRANSACTION READ ONLY`.execute(tx);
        return work(tx);
      });
  const before = (
    await sql<{
      tenant: string;
      principal: string;
      plane: string;
    }>`SELECT current_setting('app.current_tenant_id',true) AS tenant,current_setting('app.current_principal_id',true) AS principal,current_setting('app.database_plane',true) AS plane`.execute(
      database,
    )
  ).rows[0]!;
  const result = await work(database);
  await sql`SELECT set_config('app.current_tenant_id',${before.tenant ?? ""},true),set_config('app.current_principal_id',${before.principal ?? ""},true),set_config('app.database_plane',${before.plane ?? ""},true)`.execute(
    database,
  );
  return result;
}
