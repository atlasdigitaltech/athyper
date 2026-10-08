import type { ExpandedNativeMetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  validateEntitySecurityManifestV1,
  validateEntityStorageAuthorityV1,
  validateEntityResourcePinV1,
  type EntityResourcePinV1,
  type EntitySecurityManifestV1,
  type EntityStorageAuthorityV1,
} from "@athyper/server-contract-metadata";
import {
  compileNativeRelease,
  type NativeReleaseCompilationContext,
} from "./native-release-compilation.js";
import type { NativeCompiledOperation } from "./native-operation-compilation.js";
import { sha256 } from "./deterministic.js";

/** Compile candidate resources from the same complete source as the Entity
 * artifact. This is semantic lowering, not storage-owner authorization, installed
 * evidence or human approval. Host composition must independently resolve all
 * compiler inputs and permission/provider resources before admitting publication.
 * The first adapter supports direct tables, plain fields and tenant.record.v1.
 * Unsupported controls reject; they are never erased to create a usable manifest.
 */
export function compileNativeLiveReadResources(input: {
  graph: ExpandedNativeMetaEntityGraph;
  compiler: NativeReleaseCompilationContext;
  controls: readonly NativeCompiledOperation[];
  releaseId: string;
  tenantId: string;
  provider: EntityResourcePinV1;
  securityCoordinate: Omit<EntityResourcePinV1, "hash">;
  storageCoordinate: Omit<EntityResourcePinV1, "hash">;
  permissions: readonly {
    plane: "studio" | "neon" | "mesh";
    code: string;
    kind: string;
    catalogue: EntityResourcePinV1;
  }[];
}) {
  const fail = (): never => {
    throw Error("NATIVE_LIVE_READ_SOURCE_UNSUPPORTED");
  };
  const { graph: g, compiler: c } = input;
  const compiled = compileNativeRelease(g, c, input.controls);
  const plane = c.authorization.plane;
  const members = g.referenceMembers!.members;
  const profiles = members.authorizationProfile;
  const runtime = g.runtimeProfiles[0];
  if (!runtime) return fail();
  if (
    g.runtimeProfiles.length !== 1 ||
    !runtime ||
    runtime.backingKind !== "table" ||
    runtime.readMode !== "generic" ||
    runtime.writeMode !== "none" ||
    profiles.length !== 1 ||
    profiles[0]!.targetPlane !== plane ||
    profiles[0]!.ownershipResolverKey !== "tenant.record.v1" ||
    profiles[0]!.ownershipResolverVersion !== 1 ||
    profiles[0]!.ownerFieldId !== null ||
    profiles[0]!.administerPermissionCode !== null ||
    members.predicate.length ||
    members.accessPermission.length ||
    g.fields.some(
      (f) => f.storageKind !== "column" || f.valueOrigin !== "stored",
    ) ||
    (g.authoringSource.tenantId !== null &&
      g.authoringSource.tenantId !== input.tenantId)
  )
    fail();
  validateEntityResourcePinV1(input.provider);
  if (
    !c.listProviders.length ||
    c.listProviders.some(
      (p) =>
        p.provider.owner !== input.provider.owner ||
        p.provider.key !== input.provider.key ||
        p.provider.version !== input.provider.version ||
        p.provider.hash !== input.provider.hash,
    )
  )
    fail();
  const source = {
    entityId: g.authoringSource.entityId,
    releaseId: input.releaseId,
    contractHash: compiled.contractHash,
    tenantId: g.authoringSource.tenantId,
  };
  if (
    (g.operationPermissions ?? []).some(
      (p) =>
        p.targetPlane !== plane ||
        !g.operations.some((o) => o.id === p.entityOperationId),
    )
  )
    return fail();
  const operations: EntitySecurityManifestV1["operations"] = g.operations.map(
    (o) => {
      if (
        o.operationKind !== "read" ||
        !["collection", "existing"].includes(o.authorizationTarget) ||
        o.requiresParentRead ||
        o.requiresPreflight
      )
        return fail();
      const declarations = (g.operationPermissions ?? []).filter(
        (p) => p.entityOperationId === o.id && p.targetPlane === plane,
      );
      if (declarations.length > 1) return fail();
      const declaration = declarations[0];
      const resolved = c.authorization.permissions.filter(
        (p) => p.operationId === o.id && p.plane === plane,
      );
      if (
        resolved.length !== 1 ||
        resolved[0]!.state !== (declaration ? "defined" : "none") ||
        resolved[0]!.permissionCode !== (declaration?.permissionCode ?? null)
      )
        return fail();
      const matches = declaration
        ? input.permissions.filter(
            (p) =>
              p.plane === plane &&
              p.code === declaration.permissionCode &&
              p.kind === declaration.permissionKind,
          )
        : [];
      if (declaration && matches.length !== 1) return fail();
      const requirement = declaration
        ? { state: "defined" as const, ...matches[0]! }
        : { state: "none" as const };
      return {
        identityId: o.id,
        semanticHash: sha256({
          operation: o,
          requirement,
          scopes: c.authorization.scopes.filter((s) => s.operationId === o.id),
        }),
        key: o.operationKey,
        target: o.authorizationTarget as "collection" | "existing",
        requirement,
      };
    },
  );
  const fields: EntitySecurityManifestV1["fields"] = g.fields.map((f) => {
    const policies = members.fieldAccess.filter(
      (p) => p.entityFieldId === f.id && p.targetPlane === plane,
    );
    const identities = c.core.identities.filter(
      (i) =>
        i.id === f.fieldIdentityId &&
        i.entityId === source.entityId &&
        i.tenantId === source.tenantId,
    );
    if (policies.length !== 1 || identities.length !== 1) return fail();
    const p = policies[0]!;
    if (
      p.representation !== "plain" ||
      !p.readOperationId ||
      p.readOperationChangeSetId !== g.ownedLabels!.changeSetId
    )
      return fail();
    return {
      identityId: f.fieldIdentityId,
      semanticHash: sha256({ field: f, policy: p }),
      key: identities[0]!.fieldKey,
      readOperationId: p.readOperationId,
      representation: "plain",
      mask: null,
      queryUses: p.queryUses,
    };
  });
  const security: EntitySecurityManifestV1 = {
    schema: "entity.effective-security-manifest/1",
    entityCode: g.entity.entityCode,
    source,
    plane,
    scope: { contract: "tenant.record.v1", tenantId: input.tenantId },
    operations,
    fields,
    unsupportedControls: [],
  };
  validateEntitySecurityManifestV1(security);
  const securityPin = { ...input.securityCoordinate, hash: sha256(security) };
  validateEntityResourcePinV1(securityPin);
  const storage: EntityStorageAuthorityV1 = {
    schema: "entity.storage-authority/1",
    source,
    plane,
    tenantId: input.tenantId,
    storage: {
      schema: runtime.storageSchema!,
      object: runtime.storageObject!,
      provider: input.provider,
    },
    owners: [
      {
        source,
        security: securityPin,
        readOperationId: profiles[0]!.recordReadOperationId,
        fields: fields.map((f) => ({
          fieldIdentityId: f.identityId,
          ownerFieldIdentityId: f.identityId,
        })),
      },
    ],
  };
  validateEntityStorageAuthorityV1(storage);
  const storagePin = { ...input.storageCoordinate, hash: sha256(storage) };
  validateEntityResourcePinV1(storagePin);
  if (
    sha256({ ...securityPin, hash: "" }) === sha256({ ...storagePin, hash: "" })
  )
    fail();
  return {
    compiled,
    security: {
      schema: "entity.installed-live-read-resource/1" as const,
      pin: securityPin,
      content: security,
    },
    storage: {
      schema: "entity.installed-live-read-resource/1" as const,
      pin: storagePin,
      content: storage,
    },
    liveReadContract: {
      schema: "entity.live-read/1" as const,
      source,
      security: securityPin,
      storageAuthority: storagePin,
    },
  };
}
