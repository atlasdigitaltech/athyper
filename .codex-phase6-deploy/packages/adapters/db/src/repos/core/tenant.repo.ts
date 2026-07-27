import type { Kysely } from "kysely";
import type { DB } from "../../generated/kysely/types.js";

export type TenantRow = {
  id: string;
  code: string;
  name: string;
  realm_key: string;
  status: string;
};

export async function findTenantByCode(
  db: Kysely<DB>,
  code: string,
  realmKey = "athyper",
): Promise<TenantRow | undefined> {
  const row = await db
    .selectFrom("master.tenant as t")
    .select(["t.id", "t.code", "t.name", "t.realm_key", "t.status"])
    .where("t.code", "=", code)
    .where("t.realm_key", "=", realmKey)
    .executeTakeFirst();
  return row as TenantRow | undefined;
}

export async function findTenantById(
  db: Kysely<DB>,
  id: string,
): Promise<TenantRow | undefined> {
  const row = await db
    .selectFrom("master.tenant as t")
    .select(["t.id", "t.code", "t.name", "t.realm_key", "t.status"])
    .where("t.id", "=", id)
    .executeTakeFirst();
  return row as TenantRow | undefined;
}
