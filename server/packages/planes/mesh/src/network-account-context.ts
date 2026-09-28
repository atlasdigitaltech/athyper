import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MeshRecordCollectionScopeCatalog } from "./record-collection-scope.js";

class MeshNetworkContextError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "MeshNetworkContextError";
  }
}

/** A browser selection is a coordinate, never proof of account membership. */
export async function resolveMeshNetworkAccountContext(
  context: VerifiedRequestContext,
  requested: unknown,
  catalog: MeshRecordCollectionScopeCatalog,
): Promise<VerifiedRequestContext> {
  if (context.planeKey !== "mesh") throw new MeshNetworkContextError(403, "MESH_PLANE_REQUIRED", "Mesh context is required");
  if (typeof requested !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requested)) {
    throw new MeshNetworkContextError(400, "MESH_NETWORK_ACCOUNT_INVALID", "A valid acting network account ID is required");
  }
  const accounts = await catalog.meshNetworkAccounts(context);
  const selected = accounts.accounts.find((account) => account.networkAccountId.toLowerCase() === requested.toLowerCase());
  if (!selected) throw new MeshNetworkContextError(403, "MESH_NETWORK_ACCOUNT_NOT_PERMITTED", "The selected network account is not permitted for this principal");
  return { ...context, permissions: { ...context.permissions, networkAccountId: selected.networkAccountId } };
}
