import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { type Transaction } from "kysely";
import { resolveMasterDataAuthorityTarget } from "./master-data-authority.js";
import { MasterDataError } from "./errors.js";
export const CONTACT_VERIFICATION_PERMISSION = "neon.relationship.business_partner.verify_contact";
/** Resolve authority from stored ownership, never caller-provided organization coordinates. */
export function createContactVerificationAuthority(authorizer: Authorizer) {
  return async (context: VerifiedRequestContext, contactId: string, tx: Transaction<Record<string, never>>) => {
    if (context.planeKey !== "neon") throw new MasterDataError(403, "VERIFICATION_SCOPE_UNSUPPORTED", "Contact verification requires Neon business-partner scope");
    // Reuse the same registry/owner/organization locks as the other master routes.
    let resource;
    try { resource = await resolveMasterDataAuthorityTarget(context, { contactId }, tx); }
    catch (error) {
      if (error instanceof MasterDataError && error.code === "MASTER_DATA_SCOPE_AMBIGUOUS") {
        throw new MasterDataError(403, "VERIFICATION_SCOPE_AMBIGUOUS", error.message);
      }
      throw error;
    }
    const decision = await authorizer.authorize({context,permissionCode:CONTACT_VERIFICATION_PERMISSION,
      resource});
    if (!decision.allowed) throw new MasterDataError(403,"FORBIDDEN","Contact verification permission denied");
  };
}
