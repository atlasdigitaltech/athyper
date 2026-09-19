import type { OwnerCoordinate } from "@athyper/server-contract-master-data";
import { sql, type Transaction } from "kysely";

/** Always acquire the canonical owner lock before locking its contact/address rows. */
export async function lockMasterDataOwner(tenantId: string, owner: OwnerCoordinate, tx: Transaction<Record<string, never>>) {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([
    "master.owner", tenantId.toLowerCase(), owner.ownerTypeId.toLowerCase(), owner.ownerId.toLowerCase(),
  ])},0))`.execute(tx);
}
