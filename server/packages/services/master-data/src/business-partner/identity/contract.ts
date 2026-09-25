/** Target identity payload boundary. It does not authorize or write an aggregate. */
export class PartnerIdentityContractError extends Error {
  constructor(readonly code: string, readonly field: string) {
    super(`${code}:${field}`);
    this.name = "PartnerIdentityContractError";
  }
}

type ObjectValue = Record<string, unknown>;
export interface OrganizationIdentityInput {
  readonly legalName: string;
  readonly legalFormValueId?: string | null;
  readonly registrationCountryCode?: string | null;
  readonly incorporationDate?: string | null;
  readonly businessTypeValueId?: string | null;
  readonly foundedYear?: number | null;
  readonly employeeCount?: number | null;
  readonly employeeCountAsOf?: string | null;
  readonly employeeCountScope?: "organization" | "consolidated_group" | null;
}
export interface OrganizationPartnerIdentityInput {
  readonly partnerCategory: "organization";
  readonly displayName: string;
  readonly ownershipClass?: "external" | "internal";
  readonly legalClassification?: "government" | "nonprofit" | null;
  readonly websiteUrl?: string | null;
  readonly description?: string | null;
  readonly organizationIdentity: OrganizationIdentityInput;
}

const commonKeys = ["partnerCategory", "displayName", "ownershipClass", "legalClassification", "websiteUrl", "description", "organizationIdentity"];
const organizationKeys = ["legalName", "legalFormValueId", "registrationCountryCode", "incorporationDate", "businessTypeValueId", "foundedYear", "employeeCount", "employeeCountAsOf", "employeeCountScope"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (field: string): never => { throw new PartnerIdentityContractError("IDENTITY_INVALID", field); };

export interface PersonPartnerIdentityInput {
  readonly partnerCategory: "person";
  readonly personId: string;
  readonly displayName: string;
  readonly ownershipClass?: "external" | "internal";
  readonly legalClassification?: "sole_proprietor" | null;
  readonly websiteUrl?: string | null;
  readonly description?: string | null;
}

/** Shape validation only. Writers must separately authorize and resolve the tenant-local person. */
export function parsePersonPartnerIdentityCreate(value: unknown, businessDate: string): PersonPartnerIdentityInput {
  const input = object(value, "identity");
  keys(input, ["partnerCategory", "personId", "displayName", "ownershipClass", "legalClassification", "websiteUrl", "description"], "identity");
  selected(input.partnerCategory, ["person"], "partnerCategory");
  if (typeof input.personId !== "string" || !uuid.test(input.personId)) fail("personId");
  const displayName = text(input.displayName, 320, "displayName");
  const common = parsePartnerIdentityCreate({
    partnerCategory: "organization", displayName, organizationIdentity: { legalName: displayName },
    ...Object.fromEntries(["ownershipClass", "websiteUrl", "description"].filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]])),
  }, businessDate);
  const { organizationIdentity: _organization, partnerCategory: _category, ...shared } = common;
  return Object.freeze({ ...shared, partnerCategory: "person", personId: (input.personId as string).toLowerCase(),
    ...(Object.hasOwn(input,"legalClassification") ? {legalClassification: input.legalClassification === null ? null : selected(input.legalClassification,["sole_proprietor"],"legalClassification") as "sole_proprietor"} : {}),
  }) as PersonPartnerIdentityInput;
}
function object(value: unknown, field: string): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(field);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fail(field);
  return value as ObjectValue;
}
function keys(value: ObjectValue, allowed: readonly string[], field: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${field}.${key}`);
}
function text(value: unknown, max: number, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) return fail(field);
  return value.trim();
}
function date(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(field);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value.startsWith("0000")) return fail(field);
  return value;
}
function selected(value: unknown, choices: readonly string[], field: string): string {
  if (typeof value !== "string" || !choices.includes(value)) return fail(field);
  return value;
}

/** Organization contract; person capture has an explicit separate parser and authority. */
export function parsePartnerIdentityCreate(value: unknown, businessDate: string): OrganizationPartnerIdentityInput {
  const today = date(businessDate, "businessDate");
  const input = object(value, "identity");
  if (input.partnerCategory === "person") {
    throw new PartnerIdentityContractError("PERSON_PARTNER_ENABLEMENT_PENDING", "partnerCategory");
  }
  keys(input, commonKeys, "identity");
  selected(input.partnerCategory, ["organization"], "partnerCategory");
  const org = object(input.organizationIdentity, "organizationIdentity");
  keys(org, organizationKeys, "organizationIdentity");
  const normalized: ObjectValue = { legalName: text(org.legalName, 320, "organizationIdentity.legalName") };
  for (const key of organizationKeys.filter(k => k !== "legalName")) {
    if (!Object.hasOwn(org, key)) continue;
    const value = org[key];
    const field = `organizationIdentity.${key}`;
    if (value === null) { normalized[key] = null; continue; }
    switch (key) {
      case "legalFormValueId": case "businessTypeValueId":
        if (typeof value !== "string" || !uuid.test(value)) fail(field);
        normalized[key] = (value as string).toLowerCase(); break;
      case "registrationCountryCode":
        if (typeof value !== "string" || !/^[A-Z]{2}$/.test(value)) fail(field);
        normalized[key] = value; break;
      case "incorporationDate": case "employeeCountAsOf":
        normalized[key] = date(value, field);
        if (key === "employeeCountAsOf" && (value as string) > today) fail(field);
        break;
      case "foundedYear": case "employeeCount":
        if (typeof value !== "number" || !Number.isInteger(value) || value < (key === "foundedYear" ? 1 : 0)
            || value > (key === "foundedYear" ? Number(today.slice(0, 4)) : 2147483647)) fail(field);
        normalized[key] = value; break;
      case "employeeCountScope":
        normalized[key] = selected(value, ["organization", "consolidated_group"], field); break;
    }
  }
  const count = ["employeeCount", "employeeCountAsOf", "employeeCountScope"].filter(k => normalized[k] != null).length;
  if (count !== 0 && count !== 3) fail("organizationIdentity.employeeCountTuple");
  const result: ObjectValue = {
    partnerCategory: "organization",
    displayName: Object.hasOwn(input, "displayName") ? text(input.displayName, 320, "displayName") : normalized.legalName,
    organizationIdentity: Object.freeze(normalized),
  };
  if (Object.hasOwn(input, "ownershipClass")) result.ownershipClass = selected(input.ownershipClass, ["external", "internal"], "ownershipClass");
  if (Object.hasOwn(input, "legalClassification")) result.legalClassification = input.legalClassification === null ? null : selected(input.legalClassification, ["government", "nonprofit"], "legalClassification");
  if (Object.hasOwn(input, "description")) {
    if (input.description !== null && (typeof input.description !== "string" || input.description.length > 4000)) fail("description");
    result.description = input.description;
  }
  if (Object.hasOwn(input, "websiteUrl")) {
    if (input.websiteUrl === null) result.websiteUrl = null;
    else {
      const url = text(input.websiteUrl, 2048, "websiteUrl");
      if (!/^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?(?:[/#?][^\s\x00-\x1f@]*)?$/i.test(url) || /[\s\x00-\x1f@]/.test(url)) fail("websiteUrl");
      result.websiteUrl = url;
    }
  }
  return Object.freeze(result) as unknown as OrganizationPartnerIdentityInput;
}

/** Validate the complete merged value; missing keys preserve state, null clears nullable fields. */
export function applyPartnerIdentityPatch(current: OrganizationPartnerIdentityInput, value: unknown, businessDate: string): OrganizationPartnerIdentityInput {
  const patch = object(value, "patch");
  keys(patch, ["displayName", "legalClassification", "websiteUrl", "description", "organizationIdentity"], "patch");
  const org = Object.hasOwn(patch, "organizationIdentity") ? object(patch.organizationIdentity, "organizationIdentity") : {};
  keys(org, organizationKeys, "organizationIdentity");
  return parsePartnerIdentityCreate({ ...current, ...patch, organizationIdentity: { ...current.organizationIdentity, ...org } }, businessDate);
}

/** Only a writer handling a pinned legacy contract may call this adapter. No contract inference. */
export function adaptLegacyOrganizationIdentity(
  value: unknown,
  resolvedLegalFormValueId: string | null,
  businessDate: string,
): OrganizationPartnerIdentityInput {
  const old = object(value, "legacyIdentity");
  keys(old, ["name", "legalForm", "registrationCountryCode", "incorporationDate", "websiteUrl", "description", "ownershipClass", "legalClassification"], "legacyIdentity");
  // Caller must resolve code against the tenant-authorized lookup catalog; never fabricate an ID.
  const hasCode = old.legalForm !== undefined && old.legalForm !== null;
  if (hasCode) text(old.legalForm, 100, "legalForm");
  if (hasCode !== (resolvedLegalFormValueId !== null)) fail("legalFormResolution");
  const organizationIdentity: ObjectValue = { legalName: old.name, legalFormValueId: resolvedLegalFormValueId };
  for (const key of ["registrationCountryCode", "incorporationDate"]) if (Object.hasOwn(old, key)) organizationIdentity[key] = old[key];
  const input: ObjectValue = { partnerCategory: "organization", displayName: old.name, organizationIdentity };
  for (const key of ["websiteUrl", "description", "ownershipClass", "legalClassification"]) if (Object.hasOwn(old, key)) input[key] = old[key];
  return parsePartnerIdentityCreate(input, businessDate);
}
