import {
  authorizationProvisionLockKey,
  forgetSeedLedger,
  type ProvisionPlane,
  type QueryClient,
} from "../../scripts/provisioning/safe-provision.js";

/** The callback includes mutation, seed receipts, and postcondition verification. */
export async function withAuthorizationProvisionTransaction<T>(
  client: QueryClient,
  plane: ProvisionPlane,
  work: (transaction: QueryClient) => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [authorizationProvisionLockKey(plane)]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    forgetSeedLedger(client);
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
