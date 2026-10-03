import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { EntityCapabilityRequirement } from "@athyper/server-contract-metadata";
import {
  createEntitySupportQualificationWriter,
  type EntityQualificationAuthority,
  type EntityQualificationProbe,
} from "@athyper/server-platform-metadata";
import type { Container } from "../../../kernel/container.js";

export interface EntitySupportQualificationRegistration {
  /** Dedicated qualification credential/store, explicitly composed by custody.
   * Do not silently reuse the serving or publication writer credential. */
  readonly storage: Pick<ObjectStorage, "get" | "putIfAbsent">;
  readonly authority: EntityQualificationAuthority<VerifiedRequestContext>;
  readonly probe: (
    requirement: EntityCapabilityRequirement,
  ) => EntityQualificationProbe<VerifiedRequestContext> | undefined;
  readonly validityMs: number;
  readonly probeTimeoutMs?: number;
}

/** Deployment/operator composition registers actual authenticated custody and
 * owner probes. Published metadata cannot supply either implementation. */
export function registerEntitySupportQualification(
  container: Container,
  registration: EntitySupportQualificationRegistration | undefined,
): void {
  if (!registration) return;
  const metadata = container.platform.metadata;
  const readiness = container.platform.entityReadiness;
  if (!metadata || !readiness)
    throw Error("ENTITY_QUALIFICATION_HOST_UNAVAILABLE");
  container.platform.entitySupportQualification =
    createEntitySupportQualificationWriter({
      ...registration,
      async readDescriptor(context, entityCode) {
        const descriptor = await metadata.getEntityDescriptor(
          context,
          entityCode,
        );
        if (
          !descriptor ||
          descriptor.entityCode !== entityCode ||
          descriptor.planeKey !== context.planeKey
        )
          throw Error("ENTITY_QUALIFICATION_DESCRIPTOR_UNAVAILABLE");
        return descriptor;
      },
      describe: (descriptor) => readiness.describeDescriptor(descriptor),
    });
}
