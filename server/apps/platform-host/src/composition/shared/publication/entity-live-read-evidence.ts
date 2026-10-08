import type { Transaction } from "kysely";
import {
  validateEntityLiveReadContractV1,
  type EntityResourcePinV1,
  type EntitySecurityManifestV1,
} from "@athyper/server-contract-metadata";
import {
  withLockedLocalLiveReadResources,
  type LocalLiveReadResourceBinding,
} from "@athyper/server-service-publication";
import {
  entityLiveResourceHash,
  entityReadAuthorizationFingerprint,
  type EntityLiveReadEvidencePort,
  type EntityLockedReadEvidence,
} from "@athyper/server-service-records";

type Tx = Transaction<Record<string, never>>;
type Evidence = EntityLockedReadEvidence<Tx>;
type Input = Parameters<
  EntityLiveReadEvidencePort<Tx>["withLockedEvidence"]
>[0];
type Publication = Parameters<typeof withLockedLocalLiveReadResources>[0];
/** Resolved by trusted host composition under the caller transaction, never an
 * HTTP body. Current security is explicit: an historical source cannot select
 * itself as the current policy. All dependencies are locked together before use. */
export interface EntityLiveReadInstallationSet {
  readonly bindings: readonly LocalLiveReadResourceBinding[];
  readonly currentSecurity: readonly {
    readonly entityId: string;
    readonly pin: EntityResourcePinV1;
  }[];
}
const fail = (): never => {
  throw Error("ENTITY_LIVE_READ_INSTALLATION_UNAVAILABLE");
};
/** Publication/security composition for the shared records service. This does
 * not grant permissions, manufacture F9 correspondence or bypass the existing
 * effective-read meet. Unsupported masks remain unavailable. The resource lock
 * encloses both evidence resolution and the protected repository read. */
export function createLocalEntityLiveReadEvidence(options: {
  publication: Pick<
    Publication,
    | "canonical"
    | "verifier"
    | "runtimeVersion"
    | "maximumResources"
    | "maximumBytes"
  >;
  resolve(input: Input): Promise<EntityLiveReadInstallationSet>;
  /** Registered provider/catalogue owner verifies installation and revocation in
   * this same transaction. Missing pins return null; content hash is checked. */
  installedCapability: Evidence["installed"];
  securityDescriptor: Evidence["securityDescriptor"];
  providerSupported: Evidence["providerSupported"];
  permissionSupported: Evidence["permissionSupported"];
}): EntityLiveReadEvidencePort<Tx> {
  return {
    async withLockedEvidence(input, work) {
      const { context, transaction, descriptor } = input;
      const live = descriptor.liveReadContract;
      if (
        !transaction.isTransaction ||
        !live ||
        descriptor.planeKey !== context.planeKey ||
        !["studio", "neon", "mesh"].includes(context.planeKey)
      )
        fail();
      validateEntityLiveReadContractV1(live);
      const fingerprint = entityReadAuthorizationFingerprint(context);
      const scope = {
        tenantId: context.tenantId,
        principalId: context.principalId,
        plane: context.planeKey,
        authEpoch: context.authEpoch,
        authorizationFingerprint: fingerprint,
      };
      const installation = structuredClone(await options.resolve(input));
      if (
        !installation.currentSecurity.length ||
        installation.currentSecurity.length >
          options.publication.maximumResources ||
        new Set(installation.currentSecurity.map((row) => row.entityId))
          .size !== installation.currentSecurity.length ||
        !installation.currentSecurity.some(
          (row) => row.entityId === live.source.entityId,
        )
      )
        fail();
      const selected = new Set(
        installation.bindings.map((row) => entityLiveResourceHash(row.pin)),
      );
      if (
        ![
          live.security,
          live.storageAuthority,
          ...installation.currentSecurity.map((row) => row.pin),
        ].every((pin) => selected.has(entityLiveResourceHash(pin)))
      )
        fail();
      return withLockedLocalLiveReadResources(
        {
          ...options.publication,
          transaction,
          tenantId: context.tenantId,
          plane: context.planeKey as "studio" | "neon" | "mesh",
          bindings: installation.bindings,
        },
        async (resources) => {
          let open = true;
          function guard(tx: Tx) {
            if (
              !open ||
              tx !== transaction ||
              entityReadAuthorizationFingerprint(context) !== fingerprint
            )
              fail();
          }
          const current = new Map<
            string,
            { pin: EntityResourcePinV1; manifest: EntitySecurityManifestV1 }
          >();
          for (const row of installation.currentSecurity) {
            const resource = resources.read(row.pin);
            if (
              resource.content.schema !==
                "entity.effective-security-manifest/1" ||
              resource.content.source.entityId !== row.entityId ||
              resource.content.plane !== scope.plane ||
              resource.content.scope.tenantId !== scope.tenantId
            )
              fail();
            current.set(row.entityId, {
              pin: row.pin,
              manifest: resource.content as EntitySecurityManifestV1,
            });
          }
          try {
            guard(transaction);
            return await work({
              caller: scope,
              generation: entityLiveResourceHash({
                publication: resources.generation,
                caller: scope,
                current: installation.currentSecurity,
              }),
              async installed(pin, tx) {
                guard(tx);
                if (selected.has(entityLiveResourceHash(pin)))
                  return resources.read(pin).content;
                const value = await options.installedCapability(pin, tx);
                guard(tx);
                if (
                  value !== null &&
                  entityLiveResourceHash(value) !== pin.hash
                )
                  fail();
                return value === null ? null : structuredClone(value);
              },
              async currentSecurity(entityId, tx) {
                guard(tx);
                return structuredClone(current.get(entityId) ?? null);
              },
              async securityDescriptor(manifest, tx) {
                guard(tx);
                // Only a locked verified manifest may reach the source-coverage reader.
                const known = installation.bindings.some((binding) => {
                  const resource = resources.read(binding.pin);
                  return (
                    entityLiveResourceHash(resource.content) ===
                    entityLiveResourceHash(manifest)
                  );
                });
                if (!known) fail();
                const result = await options.securityDescriptor(manifest, tx);
                guard(tx);
                return result;
              },
              async providerSupported(pin, descriptor, tx) {
                guard(tx);
                const result = await options.providerSupported(
                  pin,
                  descriptor,
                  tx,
                );
                guard(tx);
                return result;
              },
              async permissionSupported(requirement, tx) {
                guard(tx);
                const result = await options.permissionSupported(
                  requirement,
                  tx,
                );
                guard(tx);
                return result;
              },
              async maskSupported(_pin, tx) {
                guard(tx);
                return false;
              },
              async mask(_pin, _value, tx) {
                guard(tx);
                return fail();
              },
            });
          } finally {
            open = false;
          }
        },
      );
    },
  };
}
