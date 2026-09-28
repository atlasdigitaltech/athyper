import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

/** Deployment configuration, never inferred from a username or request header. */
export interface PlatformAuthority {
  readonly tenantId: string;
  readonly realmKey: string;
  readonly issuer: string;
  readonly audience: string;
}

export function validatePlatformAuthority(input: PlatformAuthority): Readonly<PlatformAuthority> {
  if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.tenantId)
    || input.realmKey !== "platform-control" || input.audience !== "athyper-platform-control-api")
    throw Error("PLATFORM_AUTHORITY_CONFIGURATION_INVALID");
  const issuer = new URL(input.issuer);
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash
    || issuer.pathname !== `/realms/${input.realmKey}`)
    throw Error("PLATFORM_AUTHORITY_ISSUER_INVALID");
  return Object.freeze({ ...input });
}

/** Signature/issuer/audience verification belongs to the isolated token verifier.
 * This is an additional application boundary, not a substitute for verification. */
export function assertPlatformAuthority(context: VerifiedRequestContext, authority: PlatformAuthority): void {
  if (context.planeKey !== "studio" || context.realmKey !== authority.realmKey || context.tenantId !== authority.tenantId)
    throw Error("PLATFORM_AUTHORITY_CONTEXT_DENIED");
  if (context.assurance !== "elevated") throw Error("PLATFORM_AUTHORITY_MFA_REQUIRED");
}
