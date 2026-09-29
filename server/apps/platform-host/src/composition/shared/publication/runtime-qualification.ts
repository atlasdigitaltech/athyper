import {
  createEntityAuthorizationRuntimeRegistry,
  type EntityAuthorizationRuntimeRegistration,
} from "@athyper/server-contract-metadata";

/** Trusted host registrations, not declarations copied from the artifact being
 * qualified. An absent registration must never count as callable availability. */
export function createPublicationRuntimeQualification(input: {
  readonly registrations?: readonly EntityAuthorizationRuntimeRegistration[];
  readonly sourceConstraints?: (...args: never[]) => unknown;
}) {
  return createEntityAuthorizationRuntimeRegistry(
    input.registrations ?? [],
    { sourceConstraints: input.sourceConstraints },
  );
}
