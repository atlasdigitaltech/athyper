import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export const BUSINESS_PARTNER_360_SCHEMA_VERSION = 1 as const;

export const BUSINESS_PARTNER_360_SECTION_CODES = Object.freeze([
  "overview",
  "identity",
  "contacts",
  "addresses",
  "identifiers-tax",
  "governance",
  "roles-scope",
  "supplier-company",
  "customer-company",
  "banking",
  "qualifications-certificates",
  "credit",
  "requests",
  "activity",
  "business-activity",
  "network",
] as const);

export type BusinessPartner360SectionCode = typeof BUSINESS_PARTNER_360_SECTION_CODES[number];
export type BusinessPartner360RoleLens = "all" | "supplier" | "customer";
export type BusinessPartner360PartyCategory = "organization" | "person";
export type BusinessPartner360SectionState = "ready" | "empty" | "partial" | "stale" | "unavailable";
export type BusinessPartner360SectionAuthorization = "granted" | "restricted";

export const BUSINESS_PARTNER_360_PERMISSIONS = Object.freeze({
  record: "neon.relationship.business_partner.read",
  identity: "neon.relationship.business_partner_identity.read",
  contact: "neon.relationship.business_partner_contact.read",
  address: "neon.relationship.business_partner_address.read",
  identifierMasked: "neon.relationship.business_partner_identifier.read_masked",
  taxMasked: "neon.relationship.business_partner_tax.read_masked",
  taxReveal: "neon.relationship.business_partner_tax.reveal",
  bankMasked: "neon.relationship.business_partner_bank.read_masked",
  bankReveal: "neon.relationship.business_partner_bank.reveal",
  qualification: "neon.relationship.business_partner_qualification.read",
  certificate: "neon.relationship.business_partner_certificate.read",
  credit: "neon.relationship.business_partner_credit.read",
  person: "neon.relationship.business_partner_person.read",
  personSensitive: "neon.relationship.business_partner_person_sensitive.read",
  workforce: "neon.relationship.business_partner_workforce.read",
  request: "neon.relationship.entity_case.read",
  activity: "neon.relationship.business_partner_activity.read",
  network: "neon.relationship.business_partner_network.read",
  amend: "neon.relationship.business_partner_amend.create",
} as const);

export type BusinessPartner360Permission = typeof BUSINESS_PARTNER_360_PERMISSIONS[keyof typeof BUSINESS_PARTNER_360_PERMISSIONS];

export const BUSINESS_PARTNER_360_COMPLETENESS_PACK_CODES = Object.freeze([
  "organization_base", "supplier_scope", "supplier_payable", "customer_scope",
  "customer_credit", "person_base", "workforce_active",
] as const);
export type BusinessPartner360CompletenessPackCode = typeof BUSINESS_PARTNER_360_COMPLETENESS_PACK_CODES[number];
export type BusinessPartner360CompletenessActionCode = "amend_partner" | "add_role" | "assign_organization" | "configure_company" | "change_bank" | "lifecycle" | "qualification" | "certification";
export type BusinessPartner360RequirementState = "satisfied" | "restricted_satisfied" | "missing";

export interface BusinessPartner360RequirementDefinition {
  readonly code: string;
  readonly fieldCode: string;
  readonly sectionCode: BusinessPartner360SectionCode;
  readonly severity: "required" | "recommended";
  readonly requiresVerified?: boolean;
  readonly actionCode: BusinessPartner360CompletenessActionCode;
  readonly label: string;
}

export interface BusinessPartner360RequirementPackDefinition {
  readonly code: BusinessPartner360CompletenessPackCode;
  readonly version: number;
  readonly category: BusinessPartner360PartyCategory;
  readonly role?: "supplier" | "customer" | "workforce";
  readonly scope: "global" | "organization" | "company" | "workforce";
  readonly requirements: readonly BusinessPartner360RequirementDefinition[];
}

export interface BusinessPartner360Scope {
  readonly tenantId: string;
  readonly businessPartnerId: string;
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
  readonly roleLens?: BusinessPartner360RoleLens;
  readonly asOf: string;
}

export type BusinessPartner360PublicScope = Omit<BusinessPartner360Scope, "tenantId">;

export interface BusinessPartner360Query {
  readonly context: VerifiedRequestContext;
  readonly businessPartnerId: string;
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
  readonly roleLens?: BusinessPartner360RoleLens;
  readonly asOf?: string;
}

export interface BusinessPartner360PageQuery extends BusinessPartner360Query {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface BusinessPartner360SourceFreshness {
  readonly plane: "neon" | "mesh" | "studio";
  readonly service: string;
  readonly sourceObject: string;
  readonly observedAt: string;
  readonly schemaVersion?: string;
  readonly projectionVersion?: string;
}

export interface BusinessPartner360RedactionNotice {
  readonly fieldCode: string;
  readonly classification: "confidential" | "restricted" | "highly_restricted";
  readonly behavior: "masked" | "presence_only" | "omitted";
  readonly reasonCode: string;
}

export interface BusinessPartner360SectionManifest {
  readonly code: BusinessPartner360SectionCode;
  readonly applicable: boolean;
  readonly authorization: BusinessPartner360SectionAuthorization;
  readonly state: BusinessPartner360SectionState;
  readonly count?: number;
  readonly href?: string;
  readonly reasonCode?: BusinessPartner360ReasonCode;
  readonly lastChangedAt?: string;
  readonly redactionClass?: "none" | "masked" | "presence_only";
  readonly actions?: readonly Readonly<{ code: string; href: string; permission: BusinessPartner360Permission }> [];
}

export interface BusinessPartner360Summary {
  readonly schemaVersion: typeof BUSINESS_PARTNER_360_SCHEMA_VERSION;
  readonly asOf: string;
  readonly generatedAt: string;
  readonly businessPartnerVersion: number;
  readonly definition: Readonly<{ code: "business_partner.onboarding"; version: string; hash: string }>;
  readonly scope: BusinessPartner360PublicScope;
  readonly identity: Readonly<{
    id: string;
    code: string;
    category: BusinessPartner360PartyCategory;
    displayName: string;
    legalName?: string;
    lifecycleStatus: string;
  }>;
  readonly roles: readonly Readonly<{ id: string; code: "supplier" | "customer"; roleCode?: string; status: string }>[];
  readonly primaryAddress?: BusinessPartner360AddressSummary;
  readonly primaryContact?: BusinessPartner360ContactSummary;
  readonly identifiers: readonly BusinessPartner360MaskedIdentifierSummary[];
  readonly completeness: BusinessPartner360CompletenessSummary;
  readonly openWork: BusinessPartner360OpenWorkSummary;
  readonly recentActivity: readonly BusinessPartner360ActivitySummary[];
  readonly sections: readonly BusinessPartner360SectionManifest[];
  readonly provenance: readonly BusinessPartner360SourceFreshness[];
}

export interface BusinessPartner360AddressSummary {
  readonly id: string;
  readonly purpose: string;
  readonly line1?: string;
  readonly locality?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
  readonly primary: boolean;
  readonly verified: boolean;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
}

export interface BusinessPartner360ContactSummary {
  readonly id: string;
  readonly displayName?: string;
  readonly purpose?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly primary: boolean;
  readonly verified: boolean;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
}

export interface BusinessPartner360MaskedIdentifierSummary {
  readonly id: string;
  readonly schemeCode: string;
  readonly jurisdictionCode?: string;
  readonly maskedValue: string;
  readonly primary: boolean;
  readonly verified: boolean;
}

export interface BusinessPartner360CompletenessSummary {
  readonly status: "complete" | "incomplete" | "not_applicable" | "definition_unavailable";
  readonly percent: number;
  readonly requiredCount: number;
  readonly completeCount: number;
  readonly restrictedCount: number;
  readonly required: readonly BusinessPartner360RequirementResult[];
  readonly recommended: readonly BusinessPartner360RequirementResult[];
  readonly packs: readonly Readonly<{ code: BusinessPartner360CompletenessPackCode; version: number }> [];
  readonly readOnly: boolean;
  readonly missing: readonly Readonly<{
    code: string;
    sectionCode: BusinessPartner360SectionCode;
    severity: "required" | "recommended";
    action?: BusinessPartner360GovernedAction;
  }>[];
  readonly evaluatedAt: string;
  readonly definitionVersion: string;
  readonly definitionHash: string;
  readonly fingerprint: string;
}

export interface BusinessPartner360GovernedAction {
  readonly code: BusinessPartner360CompletenessActionCode;
  readonly label: string;
  readonly href: string;
  readonly authority: "entity_case" | "qualification" | "certification";
  readonly requestKind?: string;
  readonly permission: string;
}

export interface BusinessPartner360RequirementResult {
  readonly code: string;
  readonly fieldCode: string;
  readonly sectionCode: BusinessPartner360SectionCode;
  readonly state: BusinessPartner360RequirementState;
  readonly action?: BusinessPartner360GovernedAction;
}

export interface BusinessPartner360OpenWorkSummary {
  readonly activeRequestCount: number;
  readonly returnedRequestCount: number;
  readonly expiringQualificationCount: number;
  readonly expiringCertificateCount: number;
  readonly pendingBankVerificationCount: number;
}

export interface BusinessPartner360ActivitySummary {
  readonly id: string;
  readonly occurredAt: string;
  readonly category: string;
  readonly eventCode: string;
  readonly title: string;
  readonly source: Readonly<{ plane: "neon" | "mesh" | "studio"; service: string }>;
}

export interface BusinessPartner360Section<T> {
  readonly schemaVersion: typeof BUSINESS_PARTNER_360_SCHEMA_VERSION;
  readonly sectionCode: BusinessPartner360SectionCode;
  readonly asOf: string;
  readonly generatedAt: string;
  readonly businessPartnerVersion: number;
  readonly definitionHash: string;
  readonly state: BusinessPartner360SectionState;
  readonly data: T;
  readonly page?: Readonly<{ nextCursor?: string; limit: number }>;
  readonly provenance: readonly BusinessPartner360SourceFreshness[];
  readonly redactions: readonly BusinessPartner360RedactionNotice[];
}

export const BUSINESS_PARTNER_360_REASON_CODES = Object.freeze([
  "BP_360_NOT_FOUND",
  "BP_360_SCOPE_REQUIRED",
  "BP_360_SCOPE_INVALID",
  "BP_360_SECTION_NOT_APPLICABLE",
  "BP_360_SECTION_FORBIDDEN",
  "BP_360_DEFINITION_INCOMPATIBLE",
  "BP_360_DEFINITION_UNAVAILABLE",
  "BP_360_PROVIDER_UNAVAILABLE",
  "BP_360_PROVIDER_STALE",
  "BP_360_CURSOR_STALE",
] as const);

export type BusinessPartner360ReasonCode = typeof BUSINESS_PARTNER_360_REASON_CODES[number];

export interface BusinessPartner360SafeError {
  readonly status: 400 | 403 | 404 | 409 | 503;
  readonly code: BusinessPartner360ReasonCode;
  readonly message: string;
  readonly requestId?: string;
}

export interface BusinessPartner360Service {
  summary(query: BusinessPartner360Query): Promise<BusinessPartner360Summary>;
  section<T=unknown>(query:BusinessPartner360PageQuery&{readonly sectionCode:BusinessPartner360SectionCode}):Promise<BusinessPartner360Section<T>>;
  revealTaxRegistration(command:import("./business-partner-360-sections.js").BusinessPartner360TaxRevealCommand):Promise<import("./business-partner-360-sections.js").BusinessPartner360TaxRevealResult>;
  revealBankAccount(command:import("./business-partner-360-commercial-controls.js").BusinessPartner360BankRevealCommand):Promise<import("./business-partner-360-commercial-controls.js").BusinessPartner360BankRevealResult>;
}

export interface BusinessPartner360SectionDefinition {
  readonly code: BusinessPartner360SectionCode;
  readonly routes: readonly string[];
  readonly categories: readonly BusinessPartner360PartyCategory[];
  readonly roles: readonly ("supplier" | "customer")[];
  readonly global: boolean;
  readonly permission: BusinessPartner360Permission;
  readonly fieldPermissions: readonly BusinessPartner360Permission[];
  readonly discoverableWhenDenied: false;
}

const allCategories = ["organization"] as const;
const allRoles = ["supplier", "customer"] as const;
const route = (name: string) => `/api/neon/business-partners/:id/360/${name}`;

export const BUSINESS_PARTNER_360_SECTION_DEFINITIONS: readonly BusinessPartner360SectionDefinition[] = Object.freeze([
  definition("overview", [], allCategories, allRoles, true, BUSINESS_PARTNER_360_PERMISSIONS.record),
  definition("identity", [route("identity")], allCategories, allRoles, true, BUSINESS_PARTNER_360_PERMISSIONS.identity),
  definition("contacts", [route("contacts")], allCategories, allRoles, true, BUSINESS_PARTNER_360_PERMISSIONS.contact),
  definition("addresses", [route("addresses")], allCategories, allRoles, true, BUSINESS_PARTNER_360_PERMISSIONS.address),
  definition("identifiers-tax", [route("identifiers")], allCategories, allRoles, true, BUSINESS_PARTNER_360_PERMISSIONS.identifierMasked, [BUSINESS_PARTNER_360_PERMISSIONS.taxMasked]),
  definition("governance", [route("governance")], ["organization"], allRoles, true, BUSINESS_PARTNER_360_PERMISSIONS.identity),
  definition("roles-scope", [route("roles")], allCategories, allRoles, true, BUSINESS_PARTNER_360_PERMISSIONS.record),
  definition("supplier-company", [route("company-configuration")], ["organization"], ["supplier"], false, BUSINESS_PARTNER_360_PERMISSIONS.record),
  definition("customer-company", [route("company-configuration")], ["organization"], ["customer"], false, BUSINESS_PARTNER_360_PERMISSIONS.record),
  definition("banking", [route("banking")], ["organization"], ["supplier"], false, BUSINESS_PARTNER_360_PERMISSIONS.bankMasked),
  definition("qualifications-certificates", [route("qualifications"), route("certificates")], ["organization"], ["supplier"], false, BUSINESS_PARTNER_360_PERMISSIONS.qualification, [BUSINESS_PARTNER_360_PERMISSIONS.certificate]),
  definition("credit", [route("credit")], ["organization"], ["customer"], false, BUSINESS_PARTNER_360_PERMISSIONS.credit),
  definition("requests", [route("requests")], allCategories, allRoles, true, BUSINESS_PARTNER_360_PERMISSIONS.request),
  definition("activity", [route("activity")], allCategories, allRoles, true, BUSINESS_PARTNER_360_PERMISSIONS.activity),
  definition("business-activity", [route("business-activity")], allCategories, ["supplier", "customer"], false, BUSINESS_PARTNER_360_PERMISSIONS.record),
  definition("network", [route("network")], allCategories, ["supplier", "customer"], false, BUSINESS_PARTNER_360_PERMISSIONS.network),
]);

const forbiddenPhase1Keys = new Set([
  "risk",
  "riskassessment",
  "riskscore",
  "overallriskscore",
  "riskband",
  "riskincident",
  "riskincidents",
  "riskincidentcount",
  "risktrend",
  "riskexposure",
]);

export function assertBusinessPartner360Phase1Contract(value: unknown): void {
  visit(value, "$", new Set<object>());
}

function definition(code: BusinessPartner360SectionCode, routes: readonly string[], categories: readonly BusinessPartner360PartyCategory[], roles: readonly ("supplier" | "customer")[], global: boolean, permission: BusinessPartner360Permission, fieldPermissions: readonly BusinessPartner360Permission[] = []): BusinessPartner360SectionDefinition {
  return Object.freeze({ code, routes: Object.freeze([...routes]), categories: Object.freeze([...categories]), roles: Object.freeze([...roles]), global, permission, fieldPermissions: Object.freeze([...fieldPermissions]), discoverableWhenDenied: false });
}

function visit(value: unknown, path: string, seen: Set<object>): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (forbiddenPhase1Keys.has(normalized)) throw new TypeError(`BP_360_PHASE1_RISK_FIELD_FORBIDDEN:${path}.${key}`);
    visit(item, `${path}.${key}`, seen);
  }
}
