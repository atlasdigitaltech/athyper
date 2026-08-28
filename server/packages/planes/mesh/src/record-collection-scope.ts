import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { RecordCollectionScopeResolution, RecordCollectionScopeResolver } from "@athyper/server-contract-records";

interface MeshNetworkAccountCatalog {
  readonly revision: string;
  readonly accounts: readonly {
    readonly networkAccountId: string;
    readonly code: string;
    readonly displayName: string;
    readonly role: "buyer" | "supplier" | "both";
  }[];
}

export interface MeshRecordCollectionScopeCatalog {
  meshNetworkAccounts(context: VerifiedRequestContext): Promise<MeshNetworkAccountCatalog>;
}

/** Maps an untrusted selected Mesh actor account to bilateral relationship visibility. */
export function createMeshRecordCollectionScopeResolver(catalog: MeshRecordCollectionScopeCatalog): RecordCollectionScopeResolver {
  return Object.freeze({
    async resolve(input: Parameters<RecordCollectionScopeResolver["resolve"]>[0]): Promise<RecordCollectionScopeResolution> {
      if (!isNetworkRelationship(input)) return tenantScope();
      const networkAccountId = input.coordinate?.networkAccountId;
      if (!networkAccountId) return Object.freeze({ status: "context_required", labels: Object.freeze([{ key: "network_account", label: "Acting account", value: "Selection required" }]) });
      const accounts = await catalog.meshNetworkAccounts(input.context);
      const account = accounts.accounts.find((candidate) => candidate.networkAccountId === networkAccountId);
      if (!account) return forbidden("MESH_NETWORK_ACCOUNT_NOT_PERMITTED", "The selected network account is not permitted for this principal");
      return Object.freeze({
        status: "ready",
        authorizationResource: Object.freeze({ networkAccountId: account.networkAccountId, actorNetworkAccountId: account.networkAccountId }),
        constraints: Object.freeze([{ kind: "mesh.network_relationship.actor_account.v1" as const, networkAccountId: account.networkAccountId }]),
        labels: Object.freeze([{ key: "network_account", label: "Acting account", value: `${account.code} · ${account.displayName}` }, { key: "network_role", label: "Role", value: humanize(account.role) }]),
        fingerprintMaterial: Object.freeze({ resolver: "mesh.network_relationship.actor_account.v1", networkAccountId: account.networkAccountId, catalogRevision: accounts.revision }),
      });
    },
  });
}

function isNetworkRelationship(input: Parameters<RecordCollectionScopeResolver["resolve"]>[0]): boolean {
  const descriptor = input.descriptor;
  return (input.operationCode === "read" || input.operationCode === "import") && descriptor.planeKey === "mesh" && descriptor.entityCode === "network_relationship" && descriptor.storage.schema === "mesh" && descriptor.storage.object === "network_relationship";
}

function tenantScope(): Extract<RecordCollectionScopeResolution, { readonly status: "ready" }> { return Object.freeze({ status: "ready", authorizationResource: Object.freeze({}), constraints: Object.freeze([]), labels: Object.freeze([]), fingerprintMaterial: Object.freeze({ mode: "tenant" }) }); }
function forbidden(code: string, message: string): Extract<RecordCollectionScopeResolution, { readonly status: "forbidden" }> { return Object.freeze({ status: "forbidden", code, message, labels: Object.freeze([]) }); }
function humanize(value: string): string { return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
