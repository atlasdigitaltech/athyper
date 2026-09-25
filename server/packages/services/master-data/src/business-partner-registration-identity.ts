import { adaptLegacyOrganizationIdentity, parsePersonPartnerIdentityCreate, PartnerIdentityContractError } from "./business-partner/identity/contract";

/** Person registration has an explicit contract; legacy organization payloads are unchanged. */
export async function validateRegistrationIdentity(
  payload: Readonly<Record<string, unknown>>,
  businessDate: string,
  resolveLegalForm: (code: string) => Promise<string | null>,
): Promise<void> {
  if (payload.partnerCategory !== "person")
    return validateLegacyRegistrationIdentity(payload, businessDate, resolveLegalForm);
  for (const key of ["legalForm", "registrationCountryCode", "incorporationDate", "organizationIdentity", "requestedRole"])
    if (Object.hasOwn(payload, key)) throw new PartnerIdentityContractError("IDENTITY_INVALID", key);
  parsePersonPartnerIdentityCreate({
    partnerCategory: "person", personId: payload.personId, displayName: payload.name,
    ownershipClass: payload.ownershipClass,
    ...(payload.legalClassification !== undefined ? { legalClassification: payload.legalClassification } : {}),
    ...(payload.websiteUrl !== undefined ? { websiteUrl: payload.websiteUrl } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
  }, businessDate);
}

/** Validates identity without rewriting the pinned legacy payload or its approval hash. */
export async function validateLegacyRegistrationIdentity(
  payload: Readonly<Record<string, unknown>>,
  businessDate: string,
  resolveLegalForm: (code: string) => Promise<string | null>,
): Promise<void> {
  if (payload.partnerCategory !== undefined && payload.partnerCategory !== "organization")
    throw new PartnerIdentityContractError("PERSON_PARTNER_ENABLEMENT_PENDING", "partnerCategory");
  for (const key of ["personId", "organizationIdentity", "displayName"]) {
    if (Object.hasOwn(payload, key)) throw new PartnerIdentityContractError("IDENTITY_CONTRACT_VERSION_UNSUPPORTED", key);
  }
  const old: Record<string, unknown> = {};
  for (const key of ["name", "legalForm", "registrationCountryCode", "incorporationDate", "websiteUrl", "description", "ownershipClass", "legalClassification"]) {
    if (Object.hasOwn(payload, key)) old[key] = payload[key];
  }
  const code = old.legalForm;
  if (code !== undefined && code !== null && (typeof code !== "string" || !code.trim()))
    throw new PartnerIdentityContractError("IDENTITY_INVALID", "legalForm");
  const id = typeof code === "string" ? await resolveLegalForm(code) : null;
  adaptLegacyOrganizationIdentity(old, id, businessDate);
}
